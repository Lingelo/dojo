// The resolver: kaizen-ops finds Kaizen core's CLI, refuses an older core, and forwards every call.
// Each test lays out a fake world (plugins, plugin cache, git config) under a folder with a space.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { compareSemver } from '../scripts/kaizen.mjs';

const OPS = join(dirname(fileURLToPath(import.meta.url)), '..');
// Versions read from the plugin, never hard-coded: a version bump must not break these tests.
const OPS_VERSION = JSON.parse(readFileSync(join(OPS, '.claude-plugin', 'plugin.json'), 'utf8')).version;
const REQUIRED = JSON.parse(readFileSync(join(OPS, 'scripts', 'requires.json'), 'utf8')).kaizen;
const [MAJ, MIN] = REQUIRED.split('.').map(Number);
const NEWER = `${MAJ}.${MIN + 1}.0`;
const OLDER = `${MAJ - 1}.99.0`;
const esc = (v) => v.replace(/\./g, '\\.');

// A fake core CLI: prints its identity, arguments and stdin as JSON, exits with KAIZEN_FAKE_EXIT
// (KAIZEN_FAKE_SIGNAL: kills itself with that signal instead).
const FAKE_CLI = `import { readFileSync } from 'node:fs';
let stdin = '';
try { stdin = readFileSync(0, 'utf8'); } catch {}
process.stdout.write(JSON.stringify({ core: process.env.KAIZEN_FAKE_ID || process.argv[1], args: process.argv.slice(2), stdin }));
if (process.env.KAIZEN_FAKE_SIGNAL) process.kill(process.pid, process.env.KAIZEN_FAKE_SIGNAL);
process.exit(Number(process.env.KAIZEN_FAKE_EXIT || 0));
`;

function world() {
  const base = mkdtempSync(join(tmpdir(), 'kaizen ops '));
  const home = join(base, 'claude config');
  const repo = join(base, 'repo');
  mkdirSync(repo, { recursive: true });
  spawnSync('git', ['init', '-q'], { cwd: repo });
  const gitGlobal = join(base, 'gitconfig');
  writeFileSync(gitGlobal, '');
  return { base, home, repo, gitGlobal };
}

function core(dir, { name = 'kaizen', version = REQUIRED } = {}) {
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name, version }));
  writeFileSync(join(dir, 'scripts', 'kaizen.mjs'), FAKE_CLI);
  return join(dir, 'scripts', 'kaizen.mjs');
}

// A copy of kaizen-ops at <dir>, so the sibling lookup sees the layout the test builds.
function ops(dir) {
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
  for (const f of ['scripts/kaizen.mjs', 'scripts/requires.json', '.claude-plugin/plugin.json']) copyFileSync(join(OPS, f), join(dir, f));
  return join(dir, 'scripts', 'kaizen.mjs');
}

function run(w, resolver, args, { env = {}, input } = {}) {
  const r = spawnSync(process.execPath, [resolver, ...args], {
    cwd: w.repo,
    input,
    encoding: 'utf8',
    env: { ...process.env, KAIZEN_CLI: '', CLAUDE_CONFIG_DIR: w.home, GIT_CONFIG_GLOBAL: w.gitGlobal, GIT_CONFIG_NOSYSTEM: '1', ...env },
  });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {}
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

// Paths compared by their real path: on macOS the tmp dir is a symlink (/var → /private/var), and Node
// locates the resolver — hence its sibling checkout — by its real path.
const real = (p) => realpathSync(p);

const cache = (w, version, opts) => core(join(w.home, 'plugins', 'cache', 'dojo', 'kaizen', version), { version, ...opts });

test('compareSemver: numeric, not lexical', () => {
  assert.equal(compareSemver('4.10.0', '4.9.9') > 0, true);
  assert.equal(compareSemver('4.0.0', '4.0.0'), 0);
  assert.equal(compareSemver('3.10.0', '4.0.0') < 0, true);
});

test('forwards arguments, stdin and exit code to the core CLI', () => {
  const w = world();
  const cli = cache(w, REQUIRED);
  const r = run(w, ops(join(w.base, 'ops')), ['deploy', 'list', '--env', 'production with space'], { input: 'payload', env: { KAIZEN_FAKE_EXIT: '3' } });
  assert.equal(r.code, 3);
  assert.deepEqual({ ...r.json, core: real(r.json.core) }, { core: real(cli), args: ['deploy', 'list', '--env', 'production with space'], stdin: 'payload' });
  rmSync(w.base, { recursive: true, force: true });
});

test('resolution order: git config, then KAIZEN_CLI, then the sibling checkout, then the newest cache entry', () => {
  const w = world();
  const plugins = join(w.base, 'plugins');
  const resolver = ops(join(plugins, 'kaizen-ops'));
  cache(w, REQUIRED);
  const newest = cache(w, `${MAJ}.${MIN + 10}.0`);
  cache(w, `${MAJ}.${MIN + 2}.0`);
  core(join(w.home, 'plugins', 'cache', 'dojo', 'kaizen', `${MAJ + 5}.0.0`), { name: 'not-kaizen', version: `${MAJ + 5}.0.0` });
  assert.equal(real(run(w, resolver, ['x']).json.core), real(newest), 'newest semver whose plugin.json is kaizen');

  const sibling = core(join(plugins, 'kaizen'));
  assert.equal(real(run(w, resolver, ['x']).json.core), real(sibling), 'the sibling checkout wins over the cache');

  const fromEnv = core(join(w.base, 'env core'));
  assert.equal(real(run(w, resolver, ['x'], { env: { KAIZEN_CLI: fromEnv } }).json.core), real(fromEnv));

  const fromGit = core(join(w.base, 'git core'));
  spawnSync('git', ['config', 'kaizen.cli', fromGit], { cwd: w.repo });
  assert.equal(real(run(w, resolver, ['x'], { env: { KAIZEN_CLI: fromEnv } }).json.core), real(fromGit), 'git config first, as the git hooks');
  rmSync(w.base, { recursive: true, force: true });
});

test('core-root and --version are answered without running the core', () => {
  const w = world();
  const cli = cache(w, NEWER);
  const resolver = ops(join(w.base, 'ops'));
  const root = run(w, resolver, ['core-root']);
  assert.equal(root.code, 0);
  assert.equal(real(root.stdout.trim()), real(dirname(dirname(cli))));
  assert.match(run(w, resolver, ['--version']).stdout, new RegExp(`^kaizen-ops ${esc(OPS_VERSION)} \\(Kaizen ${esc(NEWER)}, `));
  rmSync(w.base, { recursive: true, force: true });
});

test('an older core is refused, naming both versions and the fix', () => {
  const w = world();
  cache(w, OLDER);
  const r = run(w, ops(join(w.base, 'ops')), ['deploy', 'list']);
  assert.equal(r.code, 1);
  assert.equal(r.stdout, '', 'the core never ran');
  assert.match(r.stderr, new RegExp(`kaizen-ops ${esc(OPS_VERSION)} needs Kaizen ≥ ${esc(REQUIRED)} \\(found ${esc(OLDER)}\\): update kaizen@dojo`));
  rmSync(w.base, { recursive: true, force: true });
});

test('no core anywhere, or an explicit pointer to something else: explicit refusal', () => {
  const w = world();
  const resolver = ops(join(w.base, 'ops'));
  const none = run(w, resolver, ['status']);
  assert.equal(none.code, 1);
  assert.match(none.stderr, /Kaizen core not found/);
  assert.match(none.stderr, /git config kaizen\.cli/);

  const other = core(join(w.base, 'other'), { name: 'something-else' });
  cache(w, REQUIRED);
  const wrong = run(w, resolver, ['status'], { env: { KAIZEN_CLI: other } });
  assert.equal(wrong.code, 1, 'an explicit pointer is never silently replaced by another core');
  assert.match(wrong.stderr, /KAIZEN_CLI points to .* which is not Kaizen core/);
  rmSync(w.base, { recursive: true, force: true });
});

test('--version still answers with an older core, flagged INCOMPATIBLE; core-root does not', () => {
  const w = world();
  cache(w, OLDER);
  const resolver = ops(join(w.base, 'ops'));
  const v = run(w, resolver, ['--version']);
  assert.equal(v.code, 1);
  assert.match(v.stdout, new RegExp(`Kaizen ${esc(OLDER)}, .* INCOMPATIBLE: needs Kaizen ≥ ${esc(REQUIRED)}`));
  assert.equal(run(w, resolver, ['core-root']).code, 1, 'skills never read an incompatible core');
  rmSync(w.base, { recursive: true, force: true });
});

test('a missing requires.json refuses every call (fail closed)', () => {
  const w = world();
  cache(w, NEWER);
  const resolver = ops(join(w.base, 'ops'));
  unlinkSync(join(w.base, 'ops', 'scripts', 'requires.json'));
  const r = run(w, resolver, ['status']);
  assert.equal(r.code, 1);
  assert.equal(r.stdout, '', 'the core never ran');
  assert.match(r.stderr, /requires\.json is missing or unreadable/);
  rmSync(w.base, { recursive: true, force: true });
});

test('a core killed by a signal is reported, never exit 1 (a monitor verdict)', { skip: process.platform === 'win32' && 'no POSIX signals on Windows' }, () => {
  const w = world();
  cache(w, REQUIRED);
  const r = run(w, ops(join(w.base, 'ops')), ['monitor', 'watch'], { env: { KAIZEN_FAKE_SIGNAL: 'SIGTERM' } });
  assert.equal(r.code, 128 + 15);
  assert.match(r.stderr, /terminated by SIGTERM: no result/);
  rmSync(w.base, { recursive: true, force: true });
});
