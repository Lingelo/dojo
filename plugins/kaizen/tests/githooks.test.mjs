// Git hooks (audit fix git_hooks): review and secrets refused at the git level, without the plugin.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { CLI, PLUGIN, cleanup, cli, gitc, tempRepo, writeFiles } from './helpers.mjs';

// An empty Claude config dir: only what a test puts in it is found.
function claudeHome() {
  return mkdtempSync(join(tmpdir(), 'kaizen-claude-'));
}

function featureRepo(config = {}) {
  const dir = tempRepo({ '.kaizen/config.json': config, 'app.js': 'a\n' });
  const bare = mkdtempSync(join(tmpdir(), 'kaizen-bare-'));
  gitc(bare, ['init', '-q', '--bare']);
  gitc(dir, ['remote', 'add', 'origin', bare], ['push', '-q', 'origin', 'main'], ['checkout', '-qb', 'feat/x']);
  writeFiles(dir, { 'app.js': 'a\nb\nc\n' });
  gitc(dir, ['commit', '-qam', 'feat: b and c']);
  return { dir, bare };
}

function git(dir, args, env = {}) {
  return spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
}

test('install: hooks written and wired, never overwritten', () => {
  const { dir, bare } = featureRepo();
  const r = cli(dir, ['audit', 'fix', 'git_hooks']);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(r.json.written, ['.githooks/pre-push', '.githooks/pre-commit']);
  assert.equal(r.json.wired, true);
  assert.equal(git(dir, ['config', 'core.hooksPath']).stdout.trim(), '.githooks');
  writeFileSync(join(dir, '.githooks', 'pre-push'), '#!/bin/sh\n# mine\n');
  assert.deepEqual(cli(dir, ['audit', 'fix', 'git_hooks']).json.written, []);
  assert.match(readFileSync(join(dir, '.githooks', 'pre-push'), 'utf8'), /# mine/);
  cleanup(dir);
  cleanup(bare);
});

// Hooks installed by Kaizen 4.1.1, whose lookup ran any file named by kaizen.cli or $KAIZEN_CLI.
const OLD = (h) => readFileSync(join(PLUGIN, 'tests', 'fixtures', 'githooks', `${h}-4.1.1`), 'utf8').replace(/\r\n/g, '\n');
const lookupLine = (text) => text.split(/\r?\n/).find((l) => l.startsWith('cli=$(node -e'));

test('outdated hooks: doctor and audit warn, audit fix refreshes the lookup line only', () => {
  const { dir, bare } = featureRepo();
  mkdirSync(join(dir, '.githooks'), { recursive: true });
  // pre-push as 4.1.1 wrote it plus a team line; pre-commit as 4.1.1 wrote it, with CRLF (Windows checkout).
  writeFileSync(join(dir, '.githooks', 'pre-push'), OLD('pre-push').replace(/^exec /m, 'echo team-check\nexec '), { mode: 0o755 });
  writeFileSync(join(dir, '.githooks', 'pre-commit'), OLD('pre-commit').replace(/\n/g, '\r\n'), { mode: 0o755 });
  gitc(dir, ['config', 'core.hooksPath', '.githooks']);
  const check = (r) => r.json.checks.find((c) => c.id === 'git_hooks');
  const before = check(cli(dir, ['doctor', '--json']));
  assert.equal(before.status, 'warn');
  assert.match(before.evidence, /pre-push, pre-commit: CLI lookup of an older Kaizen/);
  assert.match(before.fix, /audit fix git_hooks/);
  assert.equal(check(cli(dir, ['audit', '--json', '--no-github'])).status, 'warn');

  const r = cli(dir, ['audit', 'fix', 'git_hooks']);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(r.json.written, ['.githooks/pre-push (CLI lookup refreshed: commit it)', '.githooks/pre-commit (CLI lookup refreshed: commit it)']);
  for (const h of ['pre-push', 'pre-commit']) {
    const text = readFileSync(join(dir, '.githooks', h), 'utf8');
    assert.equal(lookupLine(text), lookupLine(readFileSync(join(PLUGIN, 'templates', 'githooks', h), 'utf8')), `${h}: lookup refreshed`);
  }
  assert.match(readFileSync(join(dir, '.githooks', 'pre-push'), 'utf8'), /echo team-check\nexec node "\$cli" githook pre-push/, 'the team line is kept');
  assert.equal((readFileSync(join(dir, '.githooks', 'pre-commit'), 'utf8').match(/\r\n/g) || []).length, OLD('pre-commit').split('\n').length - 1, 'CRLF kept');
  assert.equal(check(cli(dir, ['doctor', '--json'])).status, 'ok');
  assert.equal(check(cli(dir, ['audit', '--json', '--no-github'])).status, 'ok');
  // Idempotent, and a hook that is not Kaizen's is never touched.
  writeFileSync(join(dir, '.githooks', 'pre-push'), `#!/bin/sh\n${lookupLine(OLD('pre-push'))}\nmake lint\n`);
  assert.deepEqual(cli(dir, ['audit', 'fix', 'git_hooks']).json.written, []);
  assert.match(readFileSync(join(dir, '.githooks', 'pre-push'), 'utf8'), /make lint/);
  cleanup(dir);
  cleanup(bare);
});

test('install: hooks already in use are never shadowed, the chaining line is given', () => {
  const { dir, bare } = featureRepo();
  gitc(dir, ['config', 'core.hooksPath', '.husky']);
  const r = cli(dir, ['audit', 'fix', 'git_hooks']);
  assert.equal(r.json.wired, false);
  assert.match(r.json.chain[0], /\.husky\/pre-push: add the line {2}\.githooks\/pre-push "\$@"/);
  assert.equal(git(dir, ['config', 'core.hooksPath']).stdout.trim(), '.husky');
  cleanup(dir);
  cleanup(bare);
  const second = featureRepo();
  writeFileSync(join(second.dir, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\n');
  assert.equal(cli(second.dir, ['audit', 'fix', 'git_hooks']).json.wired, false);
  assert.equal(git(second.dir, ['config', 'core.hooksPath']).status, 1, 'core.hooksPath left unset');
  cleanup(second.dir);
  cleanup(second.bare);
});

test('install from a linked worktree never shadows the main repo hooks', () => {
  const { dir, bare } = featureRepo();
  writeFileSync(join(dir, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\n');
  const wt = mkdtempSync(join(tmpdir(), 'kaizen-wt-'));
  cleanup(wt);
  gitc(dir, ['worktree', 'add', '-q', '-b', 'feat/wt', wt]);
  const r = cli(wt, ['audit', 'fix', 'git_hooks']);
  assert.equal(r.json.wired, false, JSON.stringify(r.json));
  assert.match(r.json.reason, /pre-commit/);
  cleanup(wt);
  cleanup(dir);
  cleanup(bare);
});

test('pre-push: an unreviewed branch is refused like the Claude Code gate; reviewed, deleted and tags pass (AE2)', () => {
  const { dir, bare } = featureRepo();
  cli(dir, ['audit', 'fix', 'git_hooks']);
  gitc(dir, ['config', 'kaizen.cli', CLI]);
  let r = git(dir, ['push', '-u', 'origin', 'feat/x']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Push refused on feat\/x: no review recorded/);
  assert.match(r.stderr, /review waive --reason/);
  assert.equal(git(dir, ['tag', 'v1']).status, 0);
  assert.equal(git(dir, ['push', 'origin', 'v1']).status, 0, 'a tag publishes no branch');
  assert.equal(cli(dir, ['review', 'record', '--verdict', 'ready']).code, 0);
  r = git(dir, ['push', '-u', 'origin', 'feat/x']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(git(dir, ['push', 'origin', '--delete', 'feat/x']).status, 0, 'a deletion publishes no code');
  cleanup(dir);
  cleanup(bare);
});

test('pre-push checks the pushed commit, not HEAD', () => {
  const { dir, bare } = featureRepo();
  cli(dir, ['audit', 'fix', 'git_hooks']);
  gitc(dir, ['config', 'kaizen.cli', CLI]);
  cli(dir, ['review', 'record', '--verdict', 'ready']);
  gitc(dir, ['checkout', '-qb', 'feat/y', 'main']);
  writeFiles(dir, { 'other.js': Array.from({ length: 200 }, (_, i) => `l${i}`).join('\n') });
  gitc(dir, ['add', '-A'], ['commit', '-qm', 'feat: unreviewed']);
  const r = git(dir, ['push', 'origin', 'feat/y:feat/y']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Push refused on feat\/y/);
  cleanup(dir);
  cleanup(bare);
});

test('pre-push: HEAD, sha and tag refspecs onto a branch are checked too', () => {
  const { dir, bare } = featureRepo();
  cli(dir, ['audit', 'fix', 'git_hooks']);
  gitc(dir, ['config', 'kaizen.cli', CLI], ['tag', 'v2']);
  const sha = git(dir, ['rev-parse', 'HEAD']).stdout.trim();
  for (const spec of ['HEAD', 'HEAD:feat/x', `${sha}:refs/heads/feat/z`, 'v2:refs/heads/feat/t']) {
    const r = git(dir, ['push', 'origin', spec]);
    assert.notEqual(r.status, 0, `${spec} must be refused`);
    assert.match(r.stderr, /Push refused/, spec);
  }
  assert.equal(cli(dir, ['review', 'record', '--verdict', 'ready']).code, 0);
  assert.equal(git(dir, ['push', 'origin', 'HEAD']).status, 0, 'reviewed: HEAD passes');
  cleanup(dir);
  cleanup(bare);
});

test('CLI not found: the hook refuses (fail closed) and a decoy marketplace is never run', () => {
  const { dir, bare } = featureRepo();
  cli(dir, ['audit', 'fix', 'git_hooks']);
  const home = claudeHome();
  const decoy = join(home, 'plugins', 'cache', 'evil', 'kaizen', '9.9.9');
  mkdirSync(join(decoy, '.claude-plugin'), { recursive: true });
  mkdirSync(join(decoy, 'scripts'), { recursive: true });
  writeFileSync(join(decoy, '.claude-plugin', 'plugin.json'), '{"name":"kaizen"}');
  const marker = join(home, 'pwned');
  writeFileSync(join(decoy, 'scripts', 'kaizen.mjs'), `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x');`);
  const env = { CLAUDE_CONFIG_DIR: home, KAIZEN_CLI: '' };
  const r = git(dir, ['push', '-u', 'origin', 'feat/x'], env);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Kaizen CLI not found/);
  assert.equal(existsSync(marker), false, 'the decoy plugin must not run');
  cleanup(dir);
  cleanup(bare);
  cleanup(home);
});

test('the newest kaizen of the dojo marketplace is found in the plugin cache', () => {
  const { dir, bare } = featureRepo();
  cli(dir, ['audit', 'fix', 'git_hooks']);
  const home = claudeHome();
  for (const v of ['3.2.1', '3.10.0']) {
    const root = join(home, 'plugins', 'cache', 'dojo', 'kaizen', v);
    mkdirSync(root, { recursive: true });
    symlinkSync(join(PLUGIN, '.claude-plugin'), join(root, '.claude-plugin'), 'junction');
    if (v === '3.10.0') symlinkSync(join(PLUGIN, 'scripts'), join(root, 'scripts'), 'junction');
  }
  const r = git(dir, ['push', '-u', 'origin', 'feat/x'], { CLAUDE_CONFIG_DIR: home, KAIZEN_CLI: '' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Push refused on feat\/x/);
  assert.match(r.stderr, /3\.10\.0/, 'the highest version, compared as numbers');
  cleanup(dir);
  cleanup(bare);
  cleanup(home);
});

test('pre-commit: a staged secret is refused; secrets.scan false lets it through', () => {
  const { dir, bare } = featureRepo();
  cli(dir, ['audit', 'fix', 'git_hooks']);
  gitc(dir, ['config', 'kaizen.cli', CLI]);
  writeFiles(dir, { 'conf.js': `const key = "AKIA${'Q'.repeat(16)}";\n` });
  gitc(dir, ['add', 'conf.js']);
  const r = git(dir, ['commit', '-qm', 'feat: conf']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Commit refused: 1 possible secret/);
  writeFiles(dir, { '.kaizen/config.json': { secrets: { scan: false } } });
  assert.equal(git(dir, ['commit', '-qm', 'feat: conf']).status, 0);
  cleanup(dir);
  cleanup(bare);
});

test('claude_settings: declares kaizen@dojo, keeps existing keys, never twice', () => {
  const dir = tempRepo({ '.kaizen/config.json': {}, '.claude/settings.json': { permissions: { allow: ['Bash(npm test)'] } } });
  assert.equal(cli(dir, ['audit', 'fix', 'claude_settings']).code, 0);
  const s = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'));
  assert.deepEqual(s.permissions.allow, ['Bash(npm test)']);
  assert.equal(s.enabledPlugins['kaizen@dojo'], true);
  assert.equal(s.extraKnownMarketplaces.dojo.source.repo, 'Lingelo/dojo');
  assert.match(cli(dir, ['audit', 'fix', 'claude_settings']).stderr, /already declared/);
  writeFiles(dir, { '.claude/settings.json': '{ broken' });
  assert.match(cli(dir, ['audit', 'fix', 'claude_settings']).stderr, /not valid JSON/);
  cleanup(dir);
});

test('claude_settings: a repository with signals also gets kaizen-ops@dojo, added to an existing declaration', () => {
  const dir = tempRepo({
    '.kaizen/config.json': { monitor: { signals: { health: { url: 'https://shop.example/health' } } } },
    '.claude/settings.json': { extraKnownMarketplaces: { dojo: { source: { source: 'github', repo: 'Lingelo/dojo' } } }, enabledPlugins: { 'kaizen@dojo': true } },
  });
  const r = cli(dir, ['audit', 'fix', 'claude_settings']);
  assert.equal(r.code, 0, r.stderr);
  const s = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'));
  assert.deepEqual(s.enabledPlugins, { 'kaizen@dojo': true, 'kaizen-ops@dojo': true });
  assert.match(cli(dir, ['audit', 'fix', 'claude_settings']).stderr, /kaizen@dojo and kaizen-ops@dojo already declared/);
  cleanup(dir);
});
