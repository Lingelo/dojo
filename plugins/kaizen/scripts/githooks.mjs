// Kaizen — git-level guard rails, for when Claude Code runs without the plugin (no hook fires, nothing
// is refused, nothing says so).
//
// - `installGitHooks`: copies `templates/githooks/*` into `.githooks/` (versioned, so every clone has
//   them) and wires `core.hooksPath`. Never overwrites a hook: of a Kaizen hook written by an older
//   version it refreshes the CLI lookup line only, keeping whatever the team added. Never shadows hooks
//   already in use (`core.hooksPath` set by husky…, or `.git/hooks/*`): then it only writes
//   `.githooks/` and returns the line to chain.
// - `declarePlugin`: merges the dojo marketplace and `kaizen@dojo` into the versioned
//   `.claude/settings.json`, so a fresh clone or a cloud session loads Kaizen.
// - `prePush` / `preCommit`: what the hooks run, through `kaizen.mjs githook <name>`.

import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, loadConfig, logFriction, pushReasonKey } from './lib.mjs';
import { HOOK_LOOKUP, MARKETPLACE, OPS_ID, PLUGIN_ID, opsNeeded, templateLookup } from './doctor.mjs';
import { checkPush, currentBranch, pushRefusal, takePromptedPush } from './review-state.mjs';
import { formatFindings, scan } from './secrets.mjs';

export const HOOKS = ['pre-push', 'pre-commit'];
const KAIZEN_SOURCE = 'Lingelo/dojo';
const TEMPLATES = fileURLToPath(new URL('../templates/githooks/', import.meta.url));
const ZERO = /^0+$/;

// Hooks git would run today besides ours: `.git/hooks/*` without `.sample`.
function activeHooks(root) {
  const dir = git(root, ['rev-parse', '--git-path', 'hooks'], { allowFail: true });
  if (!dir) return [];
  try {
    // Absolute in a linked worktree, relative otherwise.
    return readdirSync(resolve(root, dir)).filter((f) => !f.endsWith('.sample'));
  } catch {
    return [];
  }
}

// Gives Kaizen's own hooks this version's CLI lookup line, nothing else: lines the team added, line
// endings and hooks that are not Kaizen's stay as they are. → the paths rewritten.
export function refreshHookLookups(root) {
  const refreshed = [];
  for (const h of HOOKS) {
    const dest = join(root, '.githooks', h);
    if (!existsSync(dest)) continue;
    const text = readFileSync(dest, 'utf8');
    const current = text.match(HOOK_LOOKUP)?.[0];
    const lookup = templateLookup(h);
    if (text.includes(`githook ${h}`) && current && lookup && current !== lookup) {
      writeFileSync(dest, text.replace(HOOK_LOOKUP, () => lookup));
      refreshed.push(`.githooks/${h}`);
    }
  }
  return refreshed;
}

export function installGitHooks(root) {
  const written = [];
  const refreshed = refreshHookLookups(root);
  for (const h of HOOKS) {
    const dest = join(root, '.githooks', h);
    if (existsSync(dest)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(TEMPLATES, h), dest);
    chmodSync(dest, 0o755);
    written.push(`.githooks/${h}`);
  }
  if (!written.length && !HOOKS.some((h) => existsSync(join(root, '.githooks', h)))) throw new Error('nothing to install');
  if (refreshed.length) written.push(...refreshed.map((f) => `${f} (CLI lookup refreshed: commit it)`));
  const hooksPath = git(root, ['config', '--get', 'core.hooksPath'], { allowFail: true });
  if (hooksPath && hooksPath.replace(/[\\/]+$/, '') === '.githooks') return { written, wired: true };
  const existing = hooksPath ? `core.hooksPath (${hooksPath})` : activeHooks(root).length ? `.git/hooks (${activeHooks(root).join(', ')})` : null;
  if (existing) {
    const dir = hooksPath || git(root, ['rev-parse', '--git-path', 'hooks']);
    return {
      written,
      wired: false,
      reason: `hooks already in use in ${existing}: core.hooksPath left unchanged`,
      chain: HOOKS.map((h) => `${dir}/${h}: add the line  .githooks/${h} "$@" || exit 1`),
    };
  }
  git(root, ['config', 'core.hooksPath', '.githooks']);
  return { written, wired: true, note: 'each clone wires them once: git config core.hooksPath .githooks (kaizen doctor reports it)' };
}

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
  // A repository that deploys with Kaizen also needs the production commands (kaizen-ops, since 4.0).
  const wanted = opsNeeded(root) ? [PLUGIN_ID, OPS_ID] : [PLUGIN_ID];
  const missing = wanted.filter((id) => plugins[id] !== true);
  if (markets[MARKETPLACE] && !missing.length) throw new Error(`${wanted.join(' and ')} already declared`);
  markets[MARKETPLACE] ||= { source: { source: 'github', repo: KAIZEN_SOURCE } };
  for (const id of missing) plugins[id] = true;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
  return { written: '.claude/settings.json', enabled: missing };
}

// git pre-push: stdin lists `<local ref> <local sha> <remote ref> <remote sha>` per pushed ref.
// What decides is the remote ref: every update of a remote branch is checked at the pushed commit,
// whatever the local side (`HEAD`, a sha, a tag: `git push origin HEAD` must not slip through).
// Deletions and tags publish no new branch code. The review is looked up under the local branch name
// (`HEAD` → the current branch), else the remote one.
export function prePush(root, stdin, K, { env = process.env } = {}) {
  if (!existsSync(join(root, '.kaizen', 'config.json'))) return { code: 0 };
  const config = loadConfig(root);
  for (const line of String(stdin).split(/\r?\n/)) {
    const [localRef, localSha, remoteRef] = line.trim().split(/\s+/);
    if (!localRef || !localSha || ZERO.test(localSha) || !remoteRef?.startsWith('refs/heads/')) continue;
    const branch = localRef.startsWith('refs/heads/')
      ? localRef.slice('refs/heads/'.length)
      : (localRef === 'HEAD' && currentBranch(root)) || remoteRef.slice('refs/heads/'.length);
    const res = checkPush(root, config, { branch, sha: localSha });
    if (!res.allowed) {
      if (config.review.require_before_push === 'ask') {
        // From Claude Code (CLAUDECODE is set in its Bash tool): only the push its review hook just put
        // to the user. A push that hook did not see (another spelling, a script) asked nobody: refused.
        if (env.CLAUDECODE) {
          if (takePromptedPush(root, branch, localSha)) continue;
          logFriction(root, { gate: 'push', kind: 'refused', reason: pushReasonKey(res), branch, source: 'git' });
          return {
            code: 1,
            message: `[kaizen] Push of ${branch} refused: ${res.reason}, and the user was not asked about this push. ` +
              'Run a plain `git push …` so Claude Code asks them (review first), or run /kaizen:review.\n',
          };
        }
        // From the user's own terminal: their call; a git hook cannot ask them, so it only reminds.
        logFriction(root, { gate: 'push', kind: 'asked', reason: pushReasonKey(res), branch, source: 'git' });
        return { code: 0, message: `[kaizen] Pushing ${branch} without a review: ${res.reason} (review.require_before_push: "ask").\n` };
      }
      logFriction(root, { gate: 'push', kind: 'refused', reason: pushReasonKey(res), branch, source: 'git' });
      return { code: 1, message: pushRefusal(res, K) };
    }
  }
  return { code: 0 };
}

export function preCommit(root) {
  if (!existsSync(join(root, '.kaizen', 'config.json'))) return { code: 0 };
  const config = loadConfig(root);
  if (config.secrets.scan === false) return { code: 0 };
  const findings = scan(root, { staged: true, ignore: config.secrets.ignore });
  if (!findings.length) return { code: 0 };
  logFriction(root, { gate: 'secrets', kind: 'refused', findings: findings.length, source: 'git' });
  return {
    code: 1,
    message: `[kaizen] Commit refused: ${findings.length} possible secret(s) in the staged changes.\n${formatFindings(findings)}\n` +
      'Move the value to an environment variable or a secret manager. A false positive → secrets.ignore in .kaizen/config.json.\n',
  };
}
