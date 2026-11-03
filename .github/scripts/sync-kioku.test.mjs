/**
 * Tests of .github/scripts/sync-kioku.mjs, on local git repositories (no network): a fake kioku repository and a
 * copy of this marketplace's catalogue.
 *   node --test .github/scripts/sync-kioku.test.mjs
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, test } from 'node:test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL_ROOT = path.resolve(HERE, '..', '..');

let root;
let market;
let kioku;
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();
const put = (dir, rel, text) => {
  mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  writeFileSync(path.join(dir, rel), text);
};
const commit = (message) => {
  git(kioku, 'add', '-A');
  git(kioku, 'commit', '-q', '-m', message);
  return git(kioku, 'rev-parse', 'HEAD');
};
const sync = () => spawnSync(process.execPath, [path.join(market, '.github', 'scripts', 'sync-kioku.mjs'), '--from', kioku, '--ref', 'HEAD'], { encoding: 'utf8' });
const entry = () => JSON.parse(readFileSync(path.join(market, '.claude-plugin', 'marketplace.json'), 'utf8')).plugins.find((p) => p.name === 'kioku');

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'sync-kioku-test-'));
  // The marketplace: the real catalogue and this script, nothing else.
  market = path.join(root, 'dojo');
  mkdirSync(path.join(market, 'plugins'), { recursive: true });
  cpSync(path.join(REAL_ROOT, '.claude-plugin'), path.join(market, '.claude-plugin'), { recursive: true });
  cpSync(HERE, path.join(market, '.github', 'scripts'), { recursive: true });
  // A fake kioku repository.
  kioku = path.join(root, 'kioku');
  mkdirSync(kioku);
  git(kioku, 'init', '-q', '-b', 'main');
  put(kioku, '.claude-plugin/plugin.json', JSON.stringify({ name: 'kioku', description: 'x' }));
  put(kioku, 'hooks/guard.mjs', '// guard v1\n');
  put(kioku, '.github/workflows/test.yml', 'name: tests\n');
  put(kioku, '.gitignore', 'local-only.txt\n');
  put(kioku, 'local-only.txt', 'never copied\n');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test('first run: copies the tracked files at the SHA, without .github, and points the catalogue to ./plugins/kioku', () => {
  const sha = commit('v1');
  const r = sync();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`now at Lingelo/kioku@${sha.slice(0, 7)}`));
  assert.equal(readFileSync(path.join(market, 'plugins/kioku/hooks/guard.mjs'), 'utf8'), '// guard v1\n');
  assert.ok(!existsSync(path.join(market, 'plugins/kioku/.github')), '.github is not copied');
  assert.ok(!existsSync(path.join(market, 'plugins/kioku/local-only.txt')), 'an ignored, untracked file is not copied');
  assert.match(readFileSync(path.join(market, 'plugins/kioku/.kioku-source'), 'utf8'), new RegExp(`^sha: ${sha}$`, 'm'));
  assert.equal(entry().source, './plugins/kioku');
  assert.ok(entry().description, 'the other fields of the entry are kept');
  assert.deepEqual(readdirSync(path.join(market, 'plugins')), ['kioku'], 'no staging directory left behind');
});

test('second run on the same SHA: up to date, nothing rewritten', () => {
  commit('v1');
  assert.equal(sync().status, 0);
  const before = readFileSync(path.join(market, '.claude-plugin', 'marketplace.json'), 'utf8');
  const r = sync();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /up to date/);
  assert.equal(readFileSync(path.join(market, '.claude-plugin', 'marketplace.json'), 'utf8'), before);
});

test('new kioku commit: the copy follows, a file removed in kioku disappears from the copy', () => {
  commit('v1');
  sync();
  put(kioku, 'hooks/guard.mjs', '// guard v2\n');
  rmSync(path.join(kioku, '.gitignore'));
  const sha = commit('v2');
  const r = sync();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\(was [0-9a-f]{7}\)/);
  assert.equal(readFileSync(path.join(market, 'plugins/kioku/hooks/guard.mjs'), 'utf8'), '// guard v2\n');
  assert.ok(!existsSync(path.join(market, 'plugins/kioku/.gitignore')), 'removed in kioku, removed from the copy');
  assert.match(readFileSync(path.join(market, 'plugins/kioku/.kioku-source'), 'utf8'), new RegExp(`^sha: ${sha}$`, 'm'));
});

test('a source without .claude-plugin/plugin.json: refused, the previous copy is kept', () => {
  commit('v1');
  sync();
  rmSync(path.join(kioku, '.claude-plugin'), { recursive: true });
  commit('broken');
  const r = sync();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no \.claude-plugin\/plugin\.json/);
  assert.equal(readFileSync(path.join(market, 'plugins/kioku/hooks/guard.mjs'), 'utf8'), '// guard v1\n', 'previous copy intact');
  assert.deepEqual(readdirSync(path.join(market, 'plugins')), ['kioku'], 'no staging directory left behind');
});

test('a symbolic link pointing outside the plugin: refused; one inside it: copied', () => {
  execFileSync('ln', ['-s', 'hooks/guard.mjs', path.join(kioku, 'inside-link')]);
  commit('inner link');
  assert.equal(sync().status, 0);
  execFileSync('ln', ['-s', '/etc/passwd', path.join(kioku, 'outside-link')]);
  commit('outer link');
  const r = sync();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /symbolic link\(s\) pointing outside the plugin: outside-link/);
  assert.ok(!existsSync(path.join(market, 'plugins/kioku/outside-link')), 'never copied');
});

test('a plugin.json named otherwise: refused', () => {
  put(kioku, '.claude-plugin/plugin.json', JSON.stringify({ name: 'other' }));
  commit('v1');
  const r = sync();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /name is not "kioku"/);
  assert.ok(!existsSync(path.join(market, 'plugins/kioku')));
});

test('invalid --source or --ref: refused before anything is fetched', () => {
  for (const args of [['--source', 'not a repo'], ['--ref', 'main; rm -rf /']]) {
    const r = spawnSync(process.execPath, [path.join(market, '.github', 'scripts', 'sync-kioku.mjs'), ...args], { encoding: 'utf8' });
    assert.equal(r.status, 1, args.join(' '));
  }
});
