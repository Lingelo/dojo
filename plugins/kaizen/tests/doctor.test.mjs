// kaizen doctor: are the guard rails on?
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLUGIN, REVIEW_GATE, REVIEW_HOOKS, cleanup, cli, gitc, personaReview, tempRepo, writeFiles } from './helpers.mjs';

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
  assert.match(check(r, 'plugin_declared').fix, /install settings/);
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
      enabledPlugins: { 'kaizen@dojo': true, 'agent-skills@dojo': true },
    },
    'package.json': { scripts: { test: 'node -e 0' } },
  });
  heartbeat(dir);
  personaReview(dir);
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

test('a pushed commit inside the history of the recorded review is not reported', () => {
  const dir = featureRepo();
  const bare = mkdtempSync(join(tmpdir(), 'kaizen-bare-'));
  gitc(bare, ['init', '-q', '--bare']);
  gitc(dir, ['remote', 'add', 'origin', bare], ['push', '-q', 'origin', 'main']);
  personaReview(dir);
  gitc(dir, ['push', '-q', '-u', 'origin', 'feat/x']);
  writeFiles(dir, { 'big.js': Array.from({ length: 120 }, (_, i) => `l${i}`).join('\n') });
  gitc(dir, ['add', '-A'], ['commit', '-qm', 'feat: more']);
  personaReview(dir); // a new review of the larger branch
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

// --- agent-skills (Addy Osmani's plugin, the base Kaizen converges on) -----------------------------------

const AS = (...lines) => lines.join('\n') + '\n';
const settings = (plugins) => ({ extraKnownMarketplaces: { dojo: {} }, enabledPlugins: plugins });

test('agent_skills: not enabled → warn with the fix, since agent-skills is the workflow Kaizen guards', () => {
  const home = mkdtempSync(join(tmpdir(), 'kaizen-home-'));
  const dir = tempRepo({ '.kaizen/config.json': {}, 'docs/SPEC.md': AS('# Spec: X') });
  const c = check(cli(dir, ['doctor', '--json'], { env: { CLAUDE_CONFIG_DIR: home } }), 'agent_skills');
  assert.equal(c.status, 'warn');
  assert.match(c.evidence, /agent-skills@dojo is not enabled/);
  assert.match(c.fix, /install settings/);
  cleanup(dir);
  cleanup(home);
});

test('agent_skills: enabled → ok, with the files Kaizen reads', () => {
  const home = mkdtempSync(join(tmpdir(), 'kaizen-home-'));
  const dir = tempRepo({
    '.kaizen/config.json': {},
    '.claude/settings.json': settings({ 'kaizen@dojo': true, 'agent-skills@dojo': true }),
    'SPEC.md': AS('# Spec: X', '', '## Objective', 'x'),
    'tasks/todo.md': AS('# Tasks', '', '## Task 1: A', '', '**Acceptance criteria:**', '- [x] a', '', '## Task 2: B', '', '**Acceptance criteria:**', '- [ ] b'),
  });
  const c = check(cli(dir, ['doctor', '--json'], { env: { CLAUDE_CONFIG_DIR: home } }), 'agent_skills');
  assert.equal(c.status, 'ok');
  assert.match(c.evidence, /agent-skills@dojo enabled; Kaizen reads SPEC\.md, tasks\/todo\.md \(1\/2 tasks done\)/);
  const user = tempRepo({ '.kaizen/config.json': {} });
  writeFiles(home, { 'settings.json': { enabledPlugins: { 'agent-skills@dojo': true } } });
  assert.equal(check(cli(user, ['doctor', '--json'], { env: { CLAUDE_CONFIG_DIR: home } }), 'agent_skills').status, 'ok', 'enabled in the user settings counts');
  for (const d of [dir, user, home]) cleanup(d);
});

test('agent_skills: CONSTRAINTS.md without a wired floor guard → warn with the reference; wired in CI or a git hook → ok', () => {
  const home = mkdtempSync(join(tmpdir(), 'kaizen-home-'));
  const env = { CLAUDE_CONFIG_DIR: home };
  const dir = tempRepo({ '.kaizen/config.json': {}, 'CONSTRAINTS.md': AS('# Constraints', '', '## Floor', '- No new suppression comments') });
  let c = check(cli(dir, ['doctor', '--json'], { env }), 'floor_guard');
  assert.equal(c.status, 'warn');
  assert.match(c.evidence, /CONSTRAINTS\.md has a floor but no floor guard runs/);
  assert.match(c.fix, /constraint-driven-development\/references\/floor-guard\.md/);
  writeFiles(dir, { '.github/workflows/ci.yml': 'jobs:\n  floor:\n    steps:\n      - run: node scripts/floor-guard.mjs --base origin/main\n' });
  c = check(cli(dir, ['doctor', '--json'], { env }), 'floor_guard');
  assert.equal(c.status, 'ok');
  assert.match(c.evidence, /\.github\/workflows\/ci\.yml/);
  const hooked = tempRepo({ '.kaizen/config.json': {}, 'CONSTRAINTS.md': AS('# Constraints'), '.githooks/pre-commit': '#!/bin/sh\nnode tools/floor-guard.mjs || exit 1\n' });
  assert.equal(check(cli(hooked, ['doctor', '--json'], { env }), 'floor_guard').status, 'ok');
  cleanup(dir);
  cleanup(hooked);
  cleanup(home);
});
