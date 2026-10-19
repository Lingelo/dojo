// Kaizen — are the guard rails actually on? A cycle can run for days with the plugin not loaded: no
// hook fires, nothing is blocked, nothing says so. The doctor makes that visible.
//
// Static checks need no Claude Code session: configuration, plugin declared in the versioned
// `.claude/settings.json`, git hooks wired, branch review state. The hook check reads the heartbeat the
// SessionStart hook writes (`.kaizen/state/hooks-seen.json`): from a terminal, no heartbeat only means
// "not verified"; from a skill (`--in-skill`) the session has started, so no heartbeat means "off".
// Each check returns { id, title, status: ok|warn|info, evidence, fix }. Read-only.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { git, loadConfig, verifyCommands } from './lib.mjs';
import { checkPush, currentBranch } from './review-state.mjs';

export const MARKETPLACE = 'dojo';
export const PLUGIN_ID = `kaizen@${MARKETPLACE}`;
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

export function heartbeat(root) {
  const h = readJson(join(root, '.kaizen', 'state', 'hooks-seen.json'));
  return h && Date.parse(h.at) ? h : null;
}

// Kaizen's hooks in `.githooks/`, whether git runs them (core.hooksPath) and why not: a hook that is
// not Kaizen's, or versioned without the executable bit (committed from Windows), is ignored by git.
export function gitHooksState(root) {
  const dir = join(root, '.githooks');
  const present = ['pre-push', 'pre-commit'].filter((f) => existsSync(join(dir, f)));
  const hooksPath = git(root, ['config', '--get', 'core.hooksPath'], { allowFail: true }) || null;
  const foreign = present.filter((f) => !readFileSync(join(dir, f), 'utf8').includes(`githook ${f}`));
  const notExecutable = present.filter((f) => {
    const staged = git(root, ['ls-files', '-s', `.githooks/${f}`], { allowFail: true });
    if (staged) return staged.startsWith('100644');
    return process.platform !== 'win32' && (statSync(join(dir, f)).mode & 0o111) === 0;
  });
  const wired = present.length > 0 && !foreign.length && !notExecutable.length && hooksPath !== null && hooksPath.replace(/[\\/]+$/, '') === '.githooks';
  return { present, hooksPath, wired, foreign, notExecutable };
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
    decl.declared ? null : 'node "$K" audit fix claude_settings',
  );

  const h = heartbeat(root);
  if (h) {
    const age = now - Date.parse(h.at);
    add('hooks', 'Claude Code hooks firing', 'ok', `last session start seen ${ago(age)}${age > 7 * DAY_MS ? ' (old: is the plugin still enabled?)' : ''}`);
  } else if (inSkill) {
    add('hooks', 'Claude Code hooks firing', 'warn', 'no hook has fired in this repo: the review, secret and quality gates are OFF in this session', 'enable the plugin (/plugin), then start a new session; until then run every gate by hand');
  } else {
    add('hooks', 'Claude Code hooks firing', 'info', 'not verified: no Claude Code session with Kaizen has started here yet', 'start a session with the plugin enabled');
  }

  const gh = gitHooksState(root);
  if (gh.wired) add('git_hooks', 'Git hooks', 'ok', `.githooks/ (${gh.present.join(', ')}) wired through core.hooksPath`);
  else if (gh.notExecutable.length) add('git_hooks', 'Git hooks', 'warn', `${gh.notExecutable.join(', ')} not executable in git (committed from Windows?): git ignores them`, `git update-index --chmod=+x ${gh.notExecutable.map((f) => `.githooks/${f}`).join(' ')}`);
  else if (gh.foreign.length) add('git_hooks', 'Git hooks', 'warn', `.githooks/${gh.foreign.join(', ')} is not Kaizen's: the review and secret checks are not installed`, 'chain it: add  node "$K" githook <name> "$@" || exit 1  to that hook');
  else if (gh.present.length) add('git_hooks', 'Git hooks', 'warn', `.githooks/ present but core.hooksPath is ${gh.hooksPath ? `"${gh.hooksPath}"` : 'unset'} (fresh clone?): the hooks do not run`, 'git config core.hooksPath .githooks');
  else add('git_hooks', 'Git hooks', 'info', 'not installed: without the plugin, nothing refuses an unreviewed push', 'node "$K" audit fix git_hooks');

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
