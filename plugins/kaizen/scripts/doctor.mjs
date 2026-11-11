// Kaizen — are the guard rails actually on? A cycle can run for days with the plugin not loaded: no
// hook fires, nothing is blocked, nothing says so. The doctor makes that visible.
//
// Static checks need no Claude Code session: configuration, plugin declared in the versioned
// `.claude/settings.json`, branch review state. The hook check reads the heartbeat the
// SessionStart hook writes (`.kaizen/state/hooks-seen.json`): from a terminal, no heartbeat only means
// "not verified"; from a skill (`--in-skill`) the session has started, so no heartbeat means "off".
// Each check returns { id, title, status: ok|warn|info, evidence, fix }. Read-only.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { docsRoot, git, loadConfig, verifyCommands } from './lib.mjs';
import { checkPush, currentBranch } from './review-state.mjs';
import { readAgentSkills } from './agentskills.mjs';

export const MARKETPLACE = 'dojo';
export const PLUGIN_ID = `kaizen@${MARKETPLACE}`;
// Addy Osmani's agent-skills is embedded in Kaizen; enabled on its own as well, its skills would load twice.
export const AGENT_SKILLS_ID = `agent-skills@${MARKETPLACE}`;
const EMBEDDED = fileURLToPath(new URL('../agent-skills/.agent-skills-source', import.meta.url));
const DAY_MS = 24 * 3600 * 1000;

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function ago(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

// Does the versioned project settings file make Claude Code load Kaizen for everyone who clones it?
export function pluginDeclared(root) {
  const s = readJson(join(root, '.claude', 'settings.json'));
  if (!s) return { declared: false, why: '.claude/settings.json missing' };
  const market = s.extraKnownMarketplaces?.[MARKETPLACE];
  const enabled = s.enabledPlugins?.[PLUGIN_ID] === true;
  if (!enabled) return { declared: false, why: `${PLUGIN_ID} not enabled in .claude/settings.json` };
  if (!market) return { declared: false, why: `marketplace "${MARKETPLACE}" not declared in .claude/settings.json` };
  return { declared: true };
}

// Is a plugin enabled for this repository: project settings, local settings or the user's settings.
export function pluginEnabled(root, id, env = process.env) {
  const files = [
    join(root, '.claude', 'settings.json'),
    join(root, '.claude', 'settings.local.json'),
    join(env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'settings.json'),
  ];
  return files.some((f) => readJson(f)?.enabledPlugins?.[id] === true);
}

// Where agent-skills' floor guard runs, if anywhere: a git hook (.githooks/, .husky/, .git/hooks/), a
// pre-commit or lefthook config, package.json scripts or a CI workflow naming it.
export function floorGuardWiring(root) {
  const candidates = ['.pre-commit-config.yaml', 'lefthook.yml', 'package.json'];
  for (const dir of ['.githooks', '.husky', join('.git', 'hooks'), join('.github', 'workflows')]) {
    try {
      for (const f of readdirSync(join(root, dir))) candidates.push(join(dir, f));
    } catch {}
  }
  return candidates.filter((rel) => {
    try {
      return statSync(join(root, rel)).isFile() && /floor-guard/.test(readFileSync(join(root, rel), 'utf8'));
    } catch {
      return false;
    }
  }).map((rel) => rel.split('\\').join('/'));
}

export function heartbeat(root) {
  const h = readJson(join(root, '.kaizen', 'state', 'hooks-seen.json'));
  return h && Date.parse(h.at) ? h : null;
}

// Declares the dojo marketplace and Kaizen in the versioned `.claude/settings.json`, so a fresh clone or a
// cloud session loads it (`kaizen install settings`).
const KAIZEN_SOURCE = 'Lingelo/dojo';
export function declarePlugin(root) {
  const path = join(root, '.claude', 'settings.json');
  let settings = {};
  if (existsSync(path)) {
    try {
      settings = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      throw new Error('.claude/settings.json is not valid JSON: nothing is overwritten');
    }
  }
  const markets = (settings.extraKnownMarketplaces ||= {});
  const plugins = (settings.enabledPlugins ||= {});
  const wanted = [PLUGIN_ID];
  const missing = wanted.filter((id) => plugins[id] !== true);
  if (markets[MARKETPLACE] && !missing.length) throw new Error(`${wanted.join(' and ')} already declared`);
  markets[MARKETPLACE] ||= { source: { source: 'github', repo: KAIZEN_SOURCE } };
  for (const id of missing) plugins[id] = true;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
  return { written: '.claude/settings.json', enabled: missing };
}

export function doctor(root, { inSkill = false, now = Date.now() } = {}) {
  const config = loadConfig(root);
  const checks = [];
  const add = (id, title, status, evidence, fix = null) => checks.push({ id, title, status, evidence, fix });

  add(
    'config',
    'Kaizen configured',
    existsSync(join(root, '.kaizen', 'config.json')) ? 'ok' : 'warn',
    existsSync(join(root, '.kaizen', 'config.json')) ? '.kaizen/config.json' : 'no .kaizen/config.json: the gates stay inactive in this repo',
    '/kaizen:setup',
  );

  const decl = pluginDeclared(root);
  add(
    'plugin_declared',
    'Plugin declared for every clone',
    decl.declared ? 'ok' : 'warn',
    decl.declared ? `.claude/settings.json enables ${PLUGIN_ID}` : `${decl.why}: a fresh clone or a cloud session runs without Kaizen`,
    decl.declared ? null : 'node "$K" install settings',
  );

  // agent-skills: embedded, the base of the workflow.
  const as = readAgentSkills(root);
  const twice = pluginEnabled(root, AGENT_SKILLS_ID);
  const version = /^sha: ([0-9a-f]{7})/m.exec(existsSync(EMBEDDED) ? readFileSync(EMBEDDED, 'utf8') : '')?.[1];
  const files = [
    as.spec?.path,
    as.plan?.path,
    as.tasks && `${as.tasks.path} (${as.tasks.list.filter((t) => t.done).length}/${as.tasks.list.length} tasks done)`,
    as.constraints?.path,
  ].filter(Boolean);
  {
    const seen = files.length ? `reads ${files.join(', ')}` : 'none of its files yet (SPEC.md, tasks/, CONSTRAINTS.md)';
    add(
      'agent_skills',
      'agent-skills (embedded, the workflow Kaizen guards)',
      twice ? 'warn' : 'ok',
      twice
        ? `${AGENT_SKILLS_ID} is enabled too: Kaizen embeds it, so its skills load twice`
        : `embedded${version ? ` (addyosmani/agent-skills@${version})` : ''}; Kaizen ${seen}`,
      twice ? `disable ${AGENT_SKILLS_ID} (/plugin), and remove it from .claude/settings.json if declared there` : null,
    );
  }
  if (as.constraints) {
    const wired = floorGuardWiring(root);
    add(
      'floor_guard',
      'Floor guard (CONSTRAINTS.md)',
      wired.length ? 'ok' : 'warn',
      wired.length ? `runs from ${wired.join(', ')}` : 'CONSTRAINTS.md has a floor but no floor guard runs: skipped tests and silenced checks pass unnoticed',
      wired.length ? null : 'run /kaizen:constraints: it installs the floor guard (constraint-driven-development skill, references/floor-guard.md) in a pre-commit hook and the CI',
    );
  }

  const h = heartbeat(root);
  if (h) {
    const age = now - Date.parse(h.at);
    add('hooks', 'Claude Code hooks firing', 'ok', `last session start seen ${ago(age)}${age > 7 * DAY_MS ? ' (old: is the plugin still enabled?)' : ''}`);
  } else if (inSkill) {
    add('hooks', 'Claude Code hooks firing', 'warn', 'no hook has fired in this repo: the review, secret and quality gates are OFF in this session', 'enable the plugin (/plugin), then start a new session; until then run every gate by hand');
  } else {
    add('hooks', 'Claude Code hooks firing', 'info', 'not verified: no Claude Code session with Kaizen has started here yet', 'start a session with the plugin enabled');
  }


  const verify = verifyCommands(root, config);
  const names = Object.keys(verify.commands);
  add('verify', 'Verification commands', names.length ? 'ok' : 'warn', names.length ? names.join(', ') : 'none detected or configured: the quality gate has nothing to run', '.kaizen/config.json → verify');

  const branch = currentBranch(root);
  if (branch) {
    const push = checkPush(root, config);
    add('review', `Review of ${branch}`, push.allowed ? 'ok' : 'warn', `${push.reason}${push.branch_lines ? ` (${push.branch_lines} lines on the branch)` : ''}`, push.allowed ? null : '/kaizen:review');
    // What already left the machine: the upstream commit, checked like a push of it.
    const upstream = git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { allowFail: true });
    const sha = upstream && git(root, ['rev-parse', '@{u}'], { allowFail: true });
    // A pushed commit inside the history of the recorded review was reviewed with it.
    const covered = sha && push.review?.head && git(root, ['merge-base', '--is-ancestor', sha, push.review.head], { allowFail: true }) !== null;
    if (sha && !covered) {
      const pushed = checkPush(root, config, { branch, sha });
      if (!pushed.allowed) add('pushed', `Pushed state of ${branch}`, 'warn', `${upstream} (${sha.slice(0, 7)}) was pushed without a recorded review: ${pushed.reason}`, '/kaizen:review, then push again');
    }
  }

  const status = checks.some((c) => c.status === 'warn') ? 'warn' : 'ok';
  return { status, in_skill: inSkill, checks };
}

export function formatDoctor(r) {
  const icon = { ok: '✔', warn: '⚠', info: '·' };
  const lines = [`Kaizen doctor — ${r.status === 'ok' ? 'guard rails on' : 'attention needed'}`];
  for (const c of r.checks) {
    lines.push(`  ${icon[c.status]} ${c.title} — ${c.evidence}`);
    if (c.status !== 'ok' && c.fix) lines.push(`      → ${c.fix}`);
  }
  return lines.join('\n');
}
