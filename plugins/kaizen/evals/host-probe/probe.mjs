#!/usr/bin/env node
// Kaizen — host probe (plan kaizen-multi-host, slice S0). Prepares a sandbox repo that is both a
// plugin marketplace (Claude Code, Cursor, Codex) and the project the agent works in, then turns what
// the probe plugin recorded into a report and into hook fixtures for the tests.
// Protocol: docs/reference/hosts.md.
//
//   node evals/host-probe/probe.mjs init <dir>                  sandbox repo + local bare remote
//   node evals/host-probe/probe.mjs reset <dir>                 forget the records (before each host)
//   node evals/host-probe/probe.mjs stop-once <dir>             the next Stop hook refuses once
//   node evals/host-probe/probe.mjs headless <dir> --host <h> [--cmd "<command>"]
//   node evals/host-probe/probe.mjs report <dir> --host <h>     Markdown report (also .probe/report-<h>.md)
//   node evals/host-probe/probe.mjs fixtures <dir> --host <h> [--out <dir>]

import { spawnSync, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MARKET = join(HERE, 'marketplace');
const FIXTURES = join(HERE, '..', '..', 'tests', 'fixtures', 'hooks');
const PONG = 'KAIZEN-PROBE-PONG';
const HEADLESS = {
  claude: `claude -p "Reply with exactly: ${PONG}"`,
  codex: `codex exec "Reply with exactly: ${PONG}"`,
  cursor: `cursor-agent -p "Reply with exactly: ${PONG}"`,
};

function fail(msg) {
  process.stderr.write(`probe: ${msg}\n`);
  process.exit(1);
}

function readRecords(dir, kind) {
  const d = join(dir, '.probe', kind);
  if (!existsSync(d)) return [];
  return readdirSync(d)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(d, f), 'utf8')));
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export function init(dir) {
  if (existsSync(dir) && readdirSync(dir).length) fail(`${dir} exists and is not empty`);
  cpSync(MARKET, dir, { recursive: true });
  writeFileSync(join(dir, '.gitignore'), '.probe/\n');
  writeFileSync(join(dir, 'README.md'), '# Kaizen probe sandbox\n\nThrowaway repo for docs/reference/hosts.md.\n');
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'probe@example.com');
  git(dir, 'config', 'user.name', 'Kaizen probe');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'chore: kaizen probe sandbox');
  const remote = `${resolve(dir)}.remote.git`;
  execFileSync('git', ['init', '-q', '--bare', remote]);
  git(dir, 'remote', 'add', 'origin', remote);
  git(dir, 'push', '-q', '-u', 'origin', 'main');
  return remote;
}

export function headless(dir, host, cmd = HEADLESS[host]) {
  if (!cmd) fail(`no preset for host "${host}": pass --cmd "<command>"`);
  const started = Date.now();
  const r = spawnSync(cmd, { cwd: dir, shell: true, encoding: 'utf8', timeout: 180000, input: '' });
  const result = {
    host,
    cmd,
    status: r.status,
    error: r.error ? String(r.error.message || r.error) : null,
    seconds: Math.round((Date.now() - started) / 1000),
    ok: String(r.stdout || '').includes(PONG),
    stdout_tail: String(r.stdout || '').slice(-2000),
    stderr_tail: String(r.stderr || '').slice(-2000),
  };
  mkdirSync(join(dir, '.probe', 'headless'), { recursive: true });
  writeFileSync(join(dir, '.probe', 'headless', `${host}.json`), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

const SHELL_TOOLS = /^(Bash|Shell|shell|exec_command|local_shell|run_terminal_cmd)$/;
const idFields = (input) => ['session_id', 'conversation_id', 'thread_id', 'generation_id', 'turn_id'].filter((k) => input?.[k] !== undefined);
const cmdOf = (r) => String(r.input?.tool_input?.command ?? r.input?.command ?? '');
const uniq = (xs) => [...new Set(xs.filter((x) => x !== null && x !== undefined && x !== ''))];
const yes = (b) => (b ? 'yes' : 'no');

export function analyze(dir, host) {
  const hooks = readRecords(dir, 'hooks').filter((r) => r.host === host);
  const skills = readRecords(dir, 'skills');
  const headlessFile = join(dir, '.probe', 'headless', `${host}.json`);
  const events = {};
  for (const r of hooks) {
    events[r.event] ??= { count: 0, vias: new Set() };
    events[r.event].count++;
    events[r.event].vias.add(r.via);
  }
  const shell = hooks.filter((r) => r.command_found_at);
  const blocks = hooks.filter((r) => r.role === 'pre' && r.action === 'block');
  const ranAfterBlock = hooks.some((r) => r.role !== 'pre' && /^(PostToolUse|postToolUse|afterShellExecution)$/.test(r.event) && cmdOf(r).includes('kaizen-probe-block'));
  const prompt = hooks.filter((r) => /^(UserPromptSubmit|beforeSubmitPrompt)$/.test(r.event));
  const promptField = uniq(prompt.flatMap((r) => Object.entries(r.input || {}).filter(([, v]) => typeof v === 'string' && v.includes('kaizen-probe-confirm')).map(([k]) => k)));
  const stops = hooks.filter((r) => /^(Stop|stop)$/.test(r.event));
  const sub = (name) => skills.find((s) => s.skill === 'probe-subagents' && s.as === name);
  const a = sub('reviewer-a');
  const b = sub('reviewer-b');
  const overlap = a && b ? Date.parse(a.started) < Date.parse(b.ended) && Date.parse(b.started) < Date.parse(a.ended) : null;
  return {
    host,
    hook_records: hooks.length,
    events: Object.fromEntries(Object.entries(events).map(([e, v]) => [e, { count: v.count, vias: [...v.vias].sort() }])),
    root_vias: uniq(hooks.map((r) => r.via)).sort(),
    hook_env: uniq(hooks.flatMap((r) => Object.entries(r.env || {}).filter(([, v]) => v !== '<set>').map(([k]) => k))).sort(),
    id_fields: uniq(hooks.flatMap((r) => idFields(r.input))).sort(),
    tool_names: uniq(hooks.map((r) => r.input?.tool_name)).sort(),
    shell_tool_names: uniq(hooks.map((r) => r.input?.tool_name).filter((t) => SHELL_TOOLS.test(String(t)))).sort(),
    shell_events: uniq(shell.map((r) => `${r.event} → ${r.command_found_at}`)).sort(),
    git_commit_seen: shell.some((r) => /\bgit\b.*\bcommit\b/.test(cmdOf(r))),
    git_push_seen: shell.some((r) => /\bgit\b.*\bpush\b/.test(cmdOf(r))),
    block_returned: blocks.length > 0,
    ran_after_block: blocks.length ? ranAfterBlock : null,
    prompt_hook: prompt.length > 0,
    prompt_text_field: promptField,
    stop_hook: stops.length > 0,
    stop_blocked: stops.some((r) => r.action === 'block'),
    stop_after_block: stops.some((r) => r.action === 'block') ? stops.length > 1 : null,
    subagent_hooks: uniq(hooks.filter((r) => /subagent/i.test(r.event)).map((r) => r.event)).sort(),
    transcript: hooks.map((r) => r.transcript).find((t) => t) || null,
    skills: skills.map((s) => ({ skill: s.skill, as: s.as, how: s.how, skill_dir_resolves_plugin: s.skill_dir_resolves_plugin })),
    skills_ran: uniq(skills.map((s) => s.skill)).sort(),
    subagents_parallel: overlap,
    named_agent: Boolean(sub('named-agent')),
    headless: existsSync(headlessFile) ? JSON.parse(readFileSync(headlessFile, 'utf8')) : null,
  };
}

export function toMarkdown(r) {
  const na = (v) => (v === null || v === undefined ? 'not tested' : typeof v === 'boolean' ? yes(v) : Array.isArray(v) ? (v.length ? v.map((x) => `\`${x}\``).join(', ') : 'none') : String(v));
  const rows = [
    ['Hook records', r.hook_records],
    ['Hook events seen', Object.entries(r.events).map(([e, v]) => `\`${e}\` ×${v.count}`).join(', ') || 'none'],
    ['Plugin root forms that ran (`--via`)', na(r.root_vias)],
    ['Plugin/project path env vars in hooks', na(r.hook_env)],
    ['Session id fields', na(r.id_fields)],
    ['Tool names seen', na(r.tool_names)],
    ['Shell tool name(s)', na(r.shell_tool_names)],
    ['Where the shell command is', na(r.shell_events)],
    ['`git commit` seen by a hook', na(r.git_commit_seen)],
    ['`git push` seen by a hook', na(r.git_push_seen)],
    ['Exit 2 returned on `kaizen-probe-block`', na(r.block_returned)],
    ['Blocked command still ran', na(r.ran_after_block)],
    ['Prompt hook fired', na(r.prompt_hook)],
    ['Field carrying the prompt text', na(r.prompt_text_field)],
    ['Stop hook fired', na(r.stop_hook)],
    ['Stop refused once, hook fired again after', na(r.stop_after_block)],
    ['Subagent hook events', na(r.subagent_hooks)],
    ['Transcript', r.transcript ? `${r.transcript.exists ? 'exists' : 'missing'}${r.transcript.exists ? `, ${r.transcript.lines} lines, last line keys: ${r.transcript.last_line_keys.join(', ')}` : ''}` : 'none'],
    ['Skills that ran', na(r.skills_ran)],
    ['Skill dir → plugin root', r.skills.filter((s) => s.skill_dir_resolves_plugin !== null).map((s) => `${s.skill}: ${yes(s.skill_dir_resolves_plugin)} (${s.how || 'how not given'})`).join('; ') || 'not tested'],
    ['Env-var forms that worked in skills', na(r.skills.filter((s) => /^env-/.test(String(s.as))).map((s) => s.as))],
    ['Two generic subagents overlapped', na(r.subagents_parallel)],
    ['Plugin agent available by name', na(r.named_agent)],
    ['Headless CLI', r.headless ? `${r.headless.ok ? 'ok' : 'failed'} — \`${r.headless.cmd}\` (exit ${r.headless.status}, ${r.headless.seconds} s)` : 'not tested'],
  ];
  return [
    `# Probe report — ${r.host}`,
    '',
    '| Observation | Result |',
    '|---|---|',
    ...rows.map(([k, v]) => `| ${k} | ${String(v).replace(/\|/g, '\\|')} |`),
    '',
    'Manual (from the protocol): install steps, invocation syntax, what the agent said when blocked, whether',
    'it replied KAIZEN-PROBE-CONTINUED after the refused stop, host version and OS.',
    '',
  ].join('\n');
}

export function sanitize(value, dir) {
  const pairs = [];
  for (const p of uniq([dir, existsSync(dir) ? realpathSync(dir) : null])) pairs.push([p, '/repo'], [p.replace(/\\/g, '/'), '/repo'], [p.replace(/\\/g, '\\\\'), '/repo']);
  pairs.push([homedir(), '/home/probe'], [homedir().replace(/\\/g, '/'), '/home/probe']);
  const walk = (v) => {
    if (typeof v === 'string') {
      let s = v;
      for (const [from, to] of pairs) if (from && from !== '/') s = s.split(from).join(to);
      return s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, 'user@example.com');
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value);
}

export function fixtures(dir, host, out = join(FIXTURES, host)) {
  mkdirSync(out, { recursive: true });
  const written = [];
  const seen = new Set();
  for (const r of readRecords(dir, 'hooks').filter((x) => x.host === host)) {
    const c = cmdOf(r);
    const tag = /\bgit\b.*\bcommit\b/.test(c) ? '-git-commit' : /\bgit\b.*\bpush\b/.test(c) ? '-git-push' : c.includes('kaizen-probe-block') ? '-block' : '';
    const name = `${r.event}${tag}${r.via && !/^(claude-root|plugin-root|cursor-root)$/.test(r.via) ? `-${r.via}` : ''}`;
    if (seen.has(name)) continue;
    seen.add(name);
    writeFileSync(join(out, `${name}.json`), `${JSON.stringify(sanitize(r, dir), null, 2)}\n`);
    written.push(name);
  }
  return written;
}

function main(argv) {
  const [cmd, dirArg, ...rest] = argv;
  const opt = (n) => {
    const i = rest.indexOf(`--${n}`);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  if (!cmd || cmd === 'help' || !dirArg) {
    process.stdout.write(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//   ')).map((l) => l.slice(3)).join('\n') + '\n');
    process.exit(cmd ? 1 : 0);
  }
  const dir = resolve(dirArg);
  const host = opt('host');
  switch (cmd) {
    case 'init': {
      const remote = init(dir);
      console.log(`Sandbox ready: ${dir} (remote ${remote}). Next: docs/reference/hosts.md, section "Run the probe".`);
      break;
    }
    case 'reset':
      rmSync(join(dir, '.probe'), { recursive: true, force: true });
      console.log('Records cleared.');
      break;
    case 'stop-once':
      mkdirSync(join(dir, '.probe'), { recursive: true });
      writeFileSync(join(dir, '.probe', 'stop-block-once'), '');
      console.log('The next Stop hook refuses once.');
      break;
    case 'headless': {
      if (!host) fail('--host is required');
      const r = headless(dir, host, opt('cmd'));
      console.log(`${r.ok ? 'ok' : 'FAILED'}: ${r.cmd} (exit ${r.status}${r.error ? `, ${r.error}` : ''})`);
      if (!r.ok) process.exit(1);
      break;
    }
    case 'report': {
      if (!host) fail('--host is required');
      const md = toMarkdown(analyze(dir, host));
      writeFileSync(join(dir, '.probe', `report-${host}.md`), md);
      process.stdout.write(md);
      break;
    }
    case 'fixtures': {
      if (!host) fail('--host is required');
      const out = opt('out') ? resolve(opt('out')) : undefined;
      const names = fixtures(dir, host, out);
      console.log(`${names.length} fixture(s): ${names.join(', ')}`);
      break;
    }
    default:
      fail(`unknown command ${cmd}`);
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main(process.argv.slice(2));
