// kaizen doctor: are the guard rails on?
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { REVIEW_GATE, REVIEW_HOOKS, cleanup, cli, gitc, tempRepo, writeFiles } from './helpers.mjs';

const check = (r, id) => r.json.checks.find((c) => c.id === id);

function featureRepo(files = {}) {
  const dir = tempRepo({ '.kaizen/config.json': {}, 'app.js': 'a\n', ...files });
  gitc(dir, ['checkout', '-qb', 'feat/x']);
  writeFiles(dir, { 'app.js': 'a\nb\nc\n' });
  gitc(dir, ['commit', '-qam', 'feat: b and c']);
  return dir;
}

const heartbeat = (dir) =>
  spawnSync(process.execPath, [REVIEW_HOOKS, '--heartbeat'], { input: JSON.stringify({ cwd: dir, session_id: 'S1', source: 'startup' }), encoding: 'utf8' });

test('no heartbeat and unreviewed commits: hooks not verified, the branch and its fix reported (AE1)', () => {
  const dir = featureRepo();
  const r = cli(dir, ['doctor', '--json']);
  assert.equal(r.code, 0);
  assert.equal(r.json.status, 'warn');
  assert.equal(check(r, 'hooks').status, 'info');
  assert.match(check(r, 'hooks').evidence, /not verified/);
  assert.equal(check(r, 'review').status, 'warn');
  assert.match(check(r, 'review').evidence, /no review recorded/);
  assert.equal(check(r, 'review').fix, '/kaizen:review');
  assert.match(check(r, 'plugin_declared').fix, /audit fix claude_settings/);
  cleanup(dir);
});

test('inside a skill, no heartbeat means the hooks are off; exit 0 unless --strict (AE8)', () => {
  const dir = featureRepo();
  const r = cli(dir, ['doctor', '--in-skill', '--json']);
  assert.equal(r.code, 0);
  assert.equal(check(r, 'hooks').status, 'warn');
  assert.match(check(r, 'hooks').evidence, /OFF/);
  assert.match(cli(dir, ['doctor', '--in-skill']).stdout, /gates are OFF/);
  assert.equal(cli(dir, ['doctor', '--strict']).code, 1);
  cleanup(dir);
});

test('the SessionStart heartbeat marks the hooks active', () => {
  const dir = featureRepo();
  assert.equal(heartbeat(dir).status, 0);
  const r = cli(dir, ['doctor', '--in-skill', '--json']);
  assert.equal(check(r, 'hooks').status, 'ok');
  cleanup(dir);
});

test('the heartbeat is only written in a Kaizen repo', () => {
  const dir = tempRepo({ 'app.js': 'a\n' });
  heartbeat(dir);
  const r = cli(dir, ['doctor', '--json']);
  assert.equal(check(r, 'hooks').status, 'info');
  cleanup(dir);
});

test('the heartbeat file is protected from direct writes', () => {
  const dir = featureRepo();
  const r = spawnSync(process.execPath, [REVIEW_GATE], {
    input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: join(dir, '.kaizen', 'state', 'hooks-seen.json') }, cwd: dir }),
    encoding: 'utf8',
  });
  assert.equal(r.status, 2);
  cleanup(dir);
});

test('plugin declared in the versioned settings, all green after a review', () => {
  const dir = featureRepo({
    '.claude/settings.json': {
      extraKnownMarketplaces: { dojo: { source: { source: 'github', repo: 'Lingelo/dojo' } } },
      enabledPlugins: { 'kaizen@dojo': true },
    },
    'package.json': { scripts: { test: 'node -e 0' } },
  });
  heartbeat(dir);
  assert.equal(cli(dir, ['review', 'record', '--verdict', 'ready']).code, 0);
  const r = cli(dir, ['doctor', '--json']);
  assert.equal(check(r, 'plugin_declared').status, 'ok');
  assert.equal(check(r, 'review').status, 'ok');
  assert.equal(check(r, 'verify').status, 'ok');
  assert.equal(r.json.status, 'ok', JSON.stringify(r.json.checks));
  assert.equal(cli(dir, ['doctor', '--strict']).code, 0);
  cleanup(dir);
});

test('settings enabling the plugin without its marketplace are reported', () => {
  const dir = featureRepo({ '.claude/settings.json': { enabledPlugins: { 'kaizen@dojo': true } } });
  const r = cli(dir, ['doctor', '--json']);
  assert.equal(check(r, 'plugin_declared').status, 'warn');
  assert.match(check(r, 'plugin_declared').evidence, /marketplace "dojo"/);
  cleanup(dir);
});

test('git hooks present but not wired (fresh clone): the wiring command', () => {
  const dir = featureRepo({ '.githooks/pre-push': '#!/bin/sh\n' });
  let r = cli(dir, ['doctor', '--json']);
  assert.equal(check(r, 'git_hooks').status, 'warn');
  assert.equal(check(r, 'git_hooks').fix, 'git config core.hooksPath .githooks');
  gitc(dir, ['config', 'core.hooksPath', '.githooks']);
  r = cli(dir, ['doctor', '--json']);
  assert.equal(check(r, 'git_hooks').status, 'ok');
  cleanup(dir);
});

test('a branch already pushed without a review is reported', () => {
  const dir = featureRepo();
  const bare = mkdtempSync(join(tmpdir(), 'kaizen-bare-'));
  gitc(bare, ['init', '-q', '--bare']);
  gitc(dir, ['remote', 'add', 'origin', bare], ['push', '-q', 'origin', 'main'], ['push', '-q', '-u', 'origin', 'feat/x']);
  const r = cli(dir, ['doctor', '--json']);
  assert.equal(check(r, 'pushed').status, 'warn');
  assert.match(check(r, 'pushed').evidence, /pushed without a recorded review/);
  cleanup(dir);
  cleanup(bare);
});
