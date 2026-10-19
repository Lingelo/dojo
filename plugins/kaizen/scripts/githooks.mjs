// Kaizen — git-level guard rails, for when Claude Code runs without the plugin (no hook fires, nothing
// is refused, nothing says so).
//
// - `installGitHooks`: copies `templates/githooks/*` into `.githooks/` (versioned, so every clone has
//   them) and wires `core.hooksPath`. Never overwrites a hook, never shadows hooks already in use
//   (`core.hooksPath` set by husky…, or `.git/hooks/*`): then it only writes `.githooks/` and returns
//   the line to chain.
// - `declarePlugin`: merges the dojo marketplace and `kaizen@dojo` into the versioned
//   `.claude/settings.json`, so a fresh clone or a cloud session loads Kaizen.
// - `prePush` / `preCommit`: what the hooks run, through `kaizen.mjs githook <name>`.

import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, loadConfig } from './lib.mjs';
import { MARKETPLACE, PLUGIN_ID } from './doctor.mjs';
import { checkPush, pushRefusal } from './review-state.mjs';
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
    return readdirSync(join(root, dir)).filter((f) => !f.endsWith('.sample'));
  } catch {
    return [];
  }
}

export function installGitHooks(root) {
  const written = [];
  for (const h of HOOKS) {
    const dest = join(root, '.githooks', h);
    if (existsSync(dest)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(TEMPLATES, h), dest);
    chmodSync(dest, 0o755);
    written.push(`.githooks/${h}`);
  }
  if (!written.length && !HOOKS.some((h) => existsSync(join(root, '.githooks', h)))) throw new Error('nothing to install');
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
  if (markets[MARKETPLACE] && plugins[PLUGIN_ID] === true) throw new Error(`${PLUGIN_ID} is already declared`);
  markets[MARKETPLACE] ||= { source: { source: 'github', repo: KAIZEN_SOURCE } };
  plugins[PLUGIN_ID] = true;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
  return { written: '.claude/settings.json' };
}

// git pre-push: stdin lists `<local ref> <local sha> <remote ref> <remote sha>` per pushed ref.
// Each pushed branch is checked at the pushed commit; deletions and tags publish no new code.
export function prePush(root, stdin, K) {
  if (!existsSync(join(root, '.kaizen', 'config.json'))) return { code: 0 };
  const config = loadConfig(root);
  for (const line of String(stdin).split(/\r?\n/)) {
    const [localRef, localSha] = line.trim().split(/\s+/);
    if (!localRef || !localSha || ZERO.test(localSha) || !localRef.startsWith('refs/heads/')) continue;
    const res = checkPush(root, config, { branch: localRef.slice('refs/heads/'.length), sha: localSha });
    if (!res.allowed) return { code: 1, message: pushRefusal(res, K) };
  }
  return { code: 0 };
}

export function preCommit(root) {
  if (!existsSync(join(root, '.kaizen', 'config.json'))) return { code: 0 };
  const config = loadConfig(root);
  if (config.secrets.scan === false) return { code: 0 };
  const findings = scan(root, { staged: true, ignore: config.secrets.ignore });
  if (!findings.length) return { code: 0 };
  return {
    code: 1,
    message: `[kaizen] Commit refused: ${findings.length} possible secret(s) in the staged changes.\n${formatFindings(findings)}\n` +
      'Move the value to an environment variable or a secret manager. A false positive → secrets.ignore in .kaizen/config.json.\n',
  };
}
