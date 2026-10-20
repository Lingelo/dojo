// kaizen doctor: are the guard rails on?
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLUGIN, REVIEW_GATE, REVIEW_HOOKS, cleanup, cli, gitc, tempRepo, writeFiles } from './helpers.mjs';

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

const PRE_PUSH = readFileSync(join(PLUGIN, 'templates', 'githooks', 'pre-push'), 'utf8');

test('git hooks present but not wired (fresh clone): the wiring command', () => {
  const dir = featureRepo({ '.githooks/pre-push': PRE_PUSH });
  gitc(dir, ['update-index', '--chmod=+x', '.githooks/pre-push'], ['commit', '-qm', 'chore: hook mode']);
  let r = cli(dir, ['doctor', '--json']);
  assert.equal(check(r, 'git_hooks').status, 'warn');
  assert.equal(check(r, 'git_hooks').fix, 'git config core.hooksPath .githooks');
  gitc(dir, ['config', 'core.hooksPath', '.githooks']);
  r = cli(dir, ['doctor', '--json']);
  assert.equal(check(r, 'git_hooks').status, 'ok');
  cleanup(dir);
});

test('git hooks that git ignores are not reported as wired: not executable, or not Kaizen\'s', () => {
  const dir = featureRepo({ '.githooks/pre-push': PRE_PUSH });
  gitc(dir, ['config', 'core.hooksPath', '.githooks']);
  let r = cli(dir, ['doctor', '--json']);
  assert.equal(check(r, 'git_hooks').status, 'warn', 'committed as 100644');
  assert.match(check(r, 'git_hooks').fix, /update-index --chmod=\+x \.githooks\/pre-push/);
  writeFiles(dir, { '.githooks/pre-push': '#!/bin/sh\nnpm run lint\n' });
  gitc(dir, ['add', '.githooks/pre-push'], ['update-index', '--chmod=+x', '.githooks/pre-push'], ['commit', '-qm', 'chore: own hook']);
  r = cli(dir, ['doctor', '--json']);
  assert.match(check(r, 'git_hooks').evidence, /not Kaizen's/);
  cleanup(dir);
});

test('a pushed commit inside the history of the recorded review is not reported', () => {
  const dir = featureRepo();
  const bare = mkdtempSync(join(tmpdir(), 'kaizen-bare-'));
  gitc(bare, ['init', '-q', '--bare']);
  gitc(dir, ['remote', 'add', 'origin', bare], ['push', '-q', 'origin', 'main']);
  assert.equal(cli(dir, ['review', 'record', '--verdict', 'ready']).code, 0);
  gitc(dir, ['push', '-q', '-u', 'origin', 'feat/x']);
  writeFiles(dir, { 'big.js': Array.from({ length: 120 }, (_, i) => `l${i}`).join('\n') });
  gitc(dir, ['add', '-A'], ['commit', '-qm', 'feat: more']);
  spawnSync(process.execPath, [REVIEW_HOOKS, '--evidence'], { input: JSON.stringify({ cwd: dir, session_id: 'S1', tool_name: 'Agent', tool_input: { subagent_type: 'kaizen:correctness-reviewer' } }), encoding: 'utf8' });
  assert.equal(cli(dir, ['review', 'record', '--verdict', 'ready']).code, 0, 'a new review of the larger branch');
  const r = cli(dir, ['doctor', '--json']);
  assert.equal(check(r, 'pushed'), undefined, JSON.stringify(r.json.checks));
  cleanup(dir);
  cleanup(bare);
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

test('a repository that deploys with Kaizen is told to enable kaizen-ops (AE5 of the split plan)', () => {
  const home = tempRepo({});
  const env = { CLAUDE_CONFIG_DIR: home };
  const dir = tempRepo({ '.kaizen/config.json': { deploy: { environments: { production: { command: 'make deploy' } } } }, 'a.js': '1\n' });
  let ops = check(cli(dir, ['doctor', '--json'], { env }), 'ops_plugin');
  assert.equal(ops.status, 'warn');
  assert.match(ops.evidence, /moved to kaizen-ops in Kaizen 4\.0/);
  assert.match(ops.fix, /"kaizen-ops@dojo": true/);
  writeFiles(home, { 'settings.json': { enabledPlugins: { 'kaizen-ops@dojo': true } } });
  ops = check(cli(dir, ['doctor', '--json'], { env }), 'ops_plugin');
  assert.equal(ops.status, 'ok', 'enabled in the user settings counts');
  const plain = tempRepo({ '.kaizen/config.json': {}, 'a.js': '1\n' });
  assert.equal(check(cli(plain, ['doctor', '--json'], { env }), 'ops_plugin'), undefined, 'no deployment, no signal: nothing to say');
  for (const d of [home, dir, plain]) cleanup(d);
});
