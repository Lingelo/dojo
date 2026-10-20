#!/usr/bin/env node
// Kaizen Ops — runs Kaizen core's CLI.
//
// kaizen-ops carries skills and docs only: the CLI, the hooks and every gate stay in Kaizen core
// (kaizen@dojo). Its skills keep `K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`; this script finds core,
// refuses a core older than scripts/requires.json, then forwards the call — arguments, stdin, stdout,
// stderr and exit code. It answers two commands itself: `core-root` (where core's references and docs
// live) and `--version`.
//
// Where core is looked for, in order (the git hooks' order, plus the sibling checkout):
// 1. `git config kaizen.cli`, 2. `$KAIZEN_CLI` — explicit: if they point to something that is not
//    Kaizen core, refuse rather than pick another one;
// 3. `<kaizen-ops>/../kaizen` — this repository, `--plugin-dir`, the evals;
// 4. the newest `kaizen` of the dojo marketplace in the Claude Code plugin cache.

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const OPS_ROOT = resolve(dirname(SELF), '..');

export function compareSemver(a, b) {
  const x = String(a).split('.').map(Number);
  const y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
}

function isFile(f) {
  try {
    return statSync(f).isFile();
  } catch {
    return false;
  }
}

function manifest(root) {
  try {
    return JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
  } catch {
    return null;
  }
}

// { cli, root, version } when `cli` is Kaizen core's kaizen.mjs, otherwise null.
function asCore(cli) {
  if (!cli || !isFile(cli)) return null;
  const root = resolve(dirname(cli), '..');
  const m = manifest(root);
  return m?.name === 'kaizen' ? { cli: resolve(cli), root, version: m.version } : null;
}

function gitConfig(cwd) {
  try {
    return execFileSync('git', ['config', '--get', 'kaizen.cli'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

// → { core: { cli, root, version, source } } or { error }
export function findCore({ env = process.env, cwd = process.cwd(), opsRoot = OPS_ROOT } = {}) {
  for (const [source, value] of [['git config kaizen.cli', gitConfig(cwd)], ['KAIZEN_CLI', env.KAIZEN_CLI || '']]) {
    if (!value) continue;
    const c = asCore(value);
    if (!c) return { error: `${source} points to ${value}, which is not Kaizen core's scripts/kaizen.mjs` };
    return { core: { ...c, source } };
  }
  const sibling = asCore(join(opsRoot, '..', 'kaizen', 'scripts', 'kaizen.mjs'));
  if (sibling) return { core: { ...sibling, source: 'sibling checkout' } };
  const dir = join(env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'plugins', 'cache', 'dojo', 'kaizen');
  let versions = [];
  try {
    versions = readdirSync(dir).filter((v) => /^\d+\.\d+\.\d+$/.test(v));
  } catch {}
  for (const v of versions.sort((a, b) => compareSemver(b, a))) {
    const c = asCore(join(dir, v, 'scripts', 'kaizen.mjs'));
    if (c) return { core: { ...c, source: 'plugin cache' } };
  }
  return {
    error:
      'Kaizen core not found: enable the kaizen@dojo plugin, or point to it with ' +
      '`git config kaizen.cli <path>/scripts/kaizen.mjs` (or the KAIZEN_CLI environment variable)',
  };
}

export function main(args, { env = process.env, cwd = process.cwd() } = {}) {
  const fail = (msg) => {
    process.stderr.write(`[kaizen-ops] ${msg}\n`);
    return 1;
  };
  const found = findCore({ env, cwd });
  if (found.error) return fail(found.error);
  const { core } = found;
  const own = manifest(OPS_ROOT) || {};
  let required = '0.0.0';
  try {
    required = JSON.parse(readFileSync(join(OPS_ROOT, 'scripts', 'requires.json'), 'utf8')).kaizen || required;
  } catch {}
  if (compareSemver(core.version, required) < 0) {
    return fail(`kaizen-ops ${own.version} needs Kaizen ≥ ${required} (found ${core.version}): update kaizen@dojo`);
  }
  if (args[0] === 'core-root') {
    process.stdout.write(`${core.root}\n`);
    return 0;
  }
  if (args[0] === '--version') {
    process.stdout.write(`kaizen-ops ${own.version} (Kaizen ${core.version}, ${core.source}: ${core.root})\n`);
    return 0;
  }
  const r = spawnSync(process.execPath, [core.cli, ...args], { cwd, env, stdio: 'inherit' });
  if (r.error) return fail(`could not run ${core.cli}: ${r.error.message}`);
  return r.status ?? 1;
}

// Run as a script, not when imported (tests). Real paths: macOS tmp dirs are symlinks (/var → /private/var).
const real = (p) => {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
};
if (process.argv[1] && real(process.argv[1]) === real(SELF)) process.exit(main(process.argv.slice(2)));
