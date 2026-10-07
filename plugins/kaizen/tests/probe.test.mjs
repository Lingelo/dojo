// Host probe (evals/host-probe, plan kaizen-multi-host S0): the probe plugin's hook logger and skill
// script, the sandbox, the report and the fixture sanitizer. The real run happens on Cursor and Codex
// by hand (docs/reference/hosts.md); these tests keep the probe itself trustworthy.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { analyze, fixtures, init, sanitize, toMarkdown } from '../evals/host-probe/probe.mjs';
import { PLUGIN } from './helpers.mjs';

const PROBE = join(PLUGIN, 'evals', 'host-probe', 'marketplace', 'plugins', 'kaizen-probe');
const DUMP = join(PROBE, 'scripts', 'dump.mjs');
const WHEREAMI = join(PROBE, 'scripts', 'whereami.mjs');

function sandbox() {
  const dir = join(mkdtempSync(join(tmpdir(), 'kaizen-probe-')), 'sbx');
  init(dir);
  return dir;
}

function dump(dir, args, payload) {
  const input = typeof payload === 'string' ? payload : JSON.stringify({ cwd: dir, ...payload });
  return spawnSync(process.execPath, [DUMP, ...args], { cwd: dir, encoding: 'utf8', input, env: { ...process.env, KAIZEN_PROBE_OUT: '' } });
}

test('manifests: the three hosts declare the same plugin and point to existing files', () => {
  const read = (p) => JSON.parse(readFileSync(join(PROBE, p), 'utf8'));
  const manifests = ['.claude-plugin/plugin.json', '.cursor-plugin/plugin.json', '.codex-plugin/plugin.json'].map(read);
  for (const m of manifests) assert.deepEqual([m.name, m.version], ['kaizen-probe', manifests[0].version]);
  const paths = [manifests[0].hooks, manifests[1].hooks, manifests[2].skills, manifests[2].extensions['com.openai'].hooks];
  for (const p of paths) assert.ok(existsSync(join(PROBE, p)), p);
  for (const f of ['claude-hooks.json', 'codex-hooks.json', 'cursor-hooks.json']) {
    const text = readFileSync(join(PROBE, 'hooks', f), 'utf8');
    for (const m of text.matchAll(/\/(scripts\/[\w.-]+)\\"/g)) assert.ok(existsSync(join(PROBE, m[1])), `${f} → ${m[1]}`);
  }
});

test('hook logger: records the payload, blocks a marked shell command and one stop, nothing else', () => {
  const dir = sandbox();
  try {
    const pre = ['--host', 'claude', '--event', 'PreToolUse', '--via', 'claude-root', '--role', 'pre'];
    assert.equal(dump(dir, pre, { tool_name: 'Bash', tool_input: { command: 'echo kaizen-probe-block' } }).status, 2);
    assert.equal(dump(dir, pre, { tool_name: 'Bash', tool_input: { command: 'git status' } }).status, 0);
    const cursor = dump(dir, ['--host', 'cursor', '--event', 'beforeShellExecution', '--via', 'cursor-root', '--role', 'pre'], { command: 'echo kaizen-probe-block' });
    assert.equal(cursor.status, 2, 'top-level command (Cursor shape) is seen too');
    const stop = ['--host', 'claude', '--event', 'Stop', '--via', 'claude-root', '--role', 'stop'];
    assert.equal(dump(dir, stop, {}).status, 0, 'no flag, no block');
    writeFileSync(join(dir, '.probe', 'stop-block-once'), '');
    assert.equal(dump(dir, stop, {}).status, 2);
    assert.equal(dump(dir, stop, {}).status, 0, 'only once');
    assert.equal(spawnSync(process.execPath, [DUMP, '--host', 'x', '--event', 'E', '--via', 'v'], { cwd: dir, input: 'not json' }).status, 0);
    const records = readdirSync(join(dir, '.probe', 'hooks')).map((f) => JSON.parse(readFileSync(join(dir, '.probe', 'hooks', f), 'utf8')));
    assert.equal(records.length, 7);
    assert.ok(records.some((r) => r.input?.unparsed_stdin === 'not json'));
    assert.ok(records.every((r) => Object.values(r.env).every((v) => !/@/.test(v))), 'no email value kept');
  } finally {
    rmSync(join(dir, '..'), { recursive: true, force: true });
  }
});

test('report: hook and skill records become the observations of one host', () => {
  const dir = sandbox();
  try {
    const pre = ['--host', 'codex', '--event', 'PreToolUse', '--via', 'plugin-root', '--role', 'pre'];
    dump(dir, pre, { session_id: 's', tool_name: 'Bash', tool_input: { command: 'git commit -m x' } });
    dump(dir, pre, { session_id: 's', tool_name: 'Bash', tool_input: { command: 'echo kaizen-probe-block' } });
    dump(dir, ['--host', 'codex', '--event', 'UserPromptSubmit', '--via', 'plugin-root'], { session_id: 's', prompt: 'kaizen-probe-confirm 42' });
    dump(dir, ['--host', 'cursor', '--event', 'stop', '--via', 'cursor-root'], { conversation_id: 'c' });
    const skillDir = join(dir, 'plugins', 'kaizen-probe', 'skills', 'probe-locate');
    const run = (script) => spawnSync(process.execPath, [script, '--skill', 'probe-locate', '--skill-dir', skillDir, '--how', 'test'], { cwd: dir }).status;
    assert.equal(run(join(dir, 'plugins', 'kaizen-probe', 'scripts', 'whereami.mjs')), 0);
    assert.equal(run(WHEREAMI), 0, 'a copy elsewhere runs too, but does not match the skill dir');
    const r = analyze(dir, 'codex');
    assert.equal(r.hook_records, 3, 'the cursor record is not counted for codex');
    assert.deepEqual(r.id_fields, ['session_id']);
    assert.deepEqual(r.shell_tool_names, ['Bash']);
    assert.equal(r.git_commit_seen, true);
    assert.equal(r.block_returned, true);
    assert.equal(r.ran_after_block, false);
    assert.deepEqual(r.prompt_text_field, ['prompt']);
    assert.deepEqual(r.skills.map((s) => s.skill_dir_resolves_plugin).sort(), [false, true]);
    assert.match(toMarkdown(r), /\| Shell tool name\(s\) \| `Bash` \|/);
  } finally {
    rmSync(join(dir, '..'), { recursive: true, force: true });
  }
});

test('fixtures: one file per event, sandbox path, home and emails replaced', () => {
  const dir = sandbox();
  const out = mkdtempSync(join(tmpdir(), 'kaizen-probe-fx-'));
  try {
    const args = ['--host', 'cursor', '--event', 'beforeShellExecution', '--via', 'cursor-root', '--role', 'pre'];
    dump(dir, args, { workspace_roots: [dir], user_email: 'someone@corp.io', command: 'git commit -m x' });
    dump(dir, args, { workspace_roots: [dir], user_email: 'someone@corp.io', command: 'git commit -m y' });
    assert.deepEqual(fixtures(dir, 'cursor', out), ['beforeShellExecution-git-commit']);
    const text = readFileSync(join(out, 'beforeShellExecution-git-commit.json'), 'utf8');
    assert.ok(!text.includes(dir) && !text.includes('someone@corp.io'));
    assert.match(text, /"\/repo"/);
    assert.deepEqual(sanitize({ a: [`${dir}/x`, 'me@x.org'] }, dir), { a: ['/repo/x', 'user@example.com'] });
  } finally {
    rmSync(join(dir, '..'), { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});
