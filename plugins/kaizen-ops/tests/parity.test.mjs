// Parity: Kaizen core's git hooks and this plugin's resolver find Kaizen core the same way. The hooks
// stay self-contained (they run from .githooks/ and must find core before they can import anything), so
// the lookup is written twice; this test runs both on the same fake worlds and requires the same answer.
// The resolver's sibling checkout is the one deliberate difference: every world here has none.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const OPS = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS = join(OPS, '..', 'kaizen', 'templates', 'githooks');
const RESOLVER = pathToFileURL(join(OPS, 'scripts', 'kaizen.mjs')).href;

// The `node -e '…'` lookup of a hook template.
const lookup = (hook) => readFileSync(join(HOOKS, hook), 'utf8').match(/node -e '([^']*)'/)[1];

function world() {
  const base = mkdtempSync(join(tmpdir(), 'kaizen parity '));
  const home = join(base, 'claude config');
  const repo = join(base, 'repo');
  mkdirSync(repo, { recursive: true });
  spawnSync('git', ['init', '-q'], { cwd: repo });
  const gitGlobal = join(base, 'gitconfig');
  writeFileSync(gitGlobal, '');
  return { base, home, repo, gitGlobal, ops: join(base, 'no sibling', 'kaizen-ops') };
}

function core(dir, { name = 'kaizen', version = '4.0.0' } = {}) {
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name, version }));
  writeFileSync(join(dir, 'scripts', 'kaizen.mjs'), '');
  return join(dir, 'scripts', 'kaizen.mjs');
}

const cache = (w, version, opts) => core(join(w.home, 'plugins', 'cache', 'dojo', 'kaizen', version), { version, ...opts });
const real = (p) => realpathSync(p);

function env(w, extra) {
  return { ...process.env, KAIZEN_CLI: '', CLAUDE_CONFIG_DIR: w.home, GIT_CONFIG_GLOBAL: w.gitGlobal, GIT_CONFIG_NOSYSTEM: '1', ...extra };
}

// Each side → the real path of the CLI it picked, or null when it refuses.
function hookPick(w, hook, extra) {
  const r = spawnSync(process.execPath, ['-e', lookup(hook)], { cwd: w.repo, encoding: 'utf8', env: env(w, extra) });
  return r.status === 0 ? real(r.stdout) : null;
}

function resolverPick(w, extra) {
  const code = `import(${JSON.stringify(RESOLVER)}).then((m) => process.stdout.write(JSON.stringify(m.findCore({ opsRoot: ${JSON.stringify(w.ops)} }))))`;
  const r = spawnSync(process.execPath, ['-e', code], { cwd: w.repo, encoding: 'utf8', env: env(w, extra) });
  assert.equal(r.status, 0, r.stderr);
  const { core: c } = JSON.parse(r.stdout);
  return c ? real(c.cli) : null;
}

function same(w, expected, extra = {}) {
  const want = expected ? real(expected) : null;
  assert.equal(resolverPick(w, extra), want, 'resolver');
  for (const hook of ['pre-push', 'pre-commit']) assert.equal(hookPick(w, hook, extra), want, hook);
}

test('both hook templates carry the same lookup', () => {
  assert.equal(lookup('pre-push'), lookup('pre-commit'));
});

test('plugin cache: newest semver (numeric), entries that are not Kaizen core skipped', () => {
  const w = world();
  cache(w, '4.0.0');
  cache(w, '4.9.0');
  const want = cache(w, '4.10.0');
  cache(w, '9.0.0', { name: 'not-kaizen' });
  mkdirSync(join(w.home, 'plugins', 'cache', 'dojo', 'kaizen', 'latest'), { recursive: true });
  same(w, want);
});

test('a decoy marketplace is never picked; nothing found is refused', () => {
  const w = world();
  core(join(w.home, 'plugins', 'cache', 'evil', 'kaizen', '9.9.9'));
  same(w, null);
});

test('KAIZEN_CLI wins over the cache; one that is not Kaizen core is refused, never replaced', () => {
  const w = world();
  cache(w, '4.0.0');
  const pinned = core(join(w.base, 'pinned core'));
  same(w, pinned, { KAIZEN_CLI: pinned });
  const other = core(join(w.base, 'other plugin'), { name: 'other' });
  same(w, null, { KAIZEN_CLI: other });
  same(w, null, { KAIZEN_CLI: join(w.base, 'missing', 'kaizen.mjs') });
});

test('git config kaizen.cli wins over KAIZEN_CLI; one that is not Kaizen core is refused', () => {
  const w = world();
  const viaEnv = core(join(w.base, 'env core'));
  const viaGit = core(join(w.base, 'git core'));
  spawnSync('git', ['config', 'kaizen.cli', viaGit], { cwd: w.repo, env: env(w) });
  same(w, viaGit, { KAIZEN_CLI: viaEnv });
  spawnSync('git', ['config', 'kaizen.cli', join(w.base, 'missing.mjs')], { cwd: w.repo, env: env(w) });
  same(w, null, { KAIZEN_CLI: viaEnv });
});
