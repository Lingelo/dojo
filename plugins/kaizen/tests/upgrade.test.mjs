// kaizen upgrade: the migrations a repository still needs after a Kaizen update, detected from its state.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLUGIN, cleanup, cli, gitc, tempRepo } from './helpers.mjs';

// An empty Claude config dir: the user's own settings never enable kaizen-ops behind a test's back.
const ENV = { CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'kaizen-claude-')) };
const run = (dir, args) => cli(dir, args, { env: ENV });
const ids = (r) => r.json.pending.map((m) => m.id);
const OLD_HOOK = (h) => readFileSync(join(PLUGIN, 'tests', 'fixtures', 'githooks', `${h}-4.1.1`), 'utf8').replace(/\r\n/g, '\n');
const read = (dir, f) => readFileSync(join(dir, f), 'utf8');

// A repository left as Kaizen 3.x/4.1 shaped it (AE1).
function oldRepo() {
  const dir = tempRepo({
    '.kaizen/config.json': '{\n  "profile":  "lean",\n  "deploy": { "environments": { "production": { "command": "make deploy", "rollback": "make rollback" } } }\n}\n',
    '.claude/settings.json': { extraKnownMarketplaces: { dojo: { source: { source: 'github', repo: 'Lingelo/dojo' } } }, enabledPlugins: { 'kaizen@dojo': true } },
    '.githooks/pre-push': OLD_HOOK('pre-push').replace(/^exec /m, 'echo team-check\nexec '),
  });
  gitc(dir, ['config', 'core.hooksPath', '.githooks']);
  return dir;
}

test('nothing pending: one line, and nothing at all outside a Kaizen repo', () => {
  const dir = tempRepo({ '.kaizen/config.json': { profile: 'product' } });
  assert.match(run(dir, ['upgrade']).stdout, /nothing to migrate in this repo/);
  assert.deepEqual(run(dir, ['upgrade', '--json']).json.pending, []);
  const bare = tempRepo({ 'docs/solutions/x.md': '# x\n' });
  assert.deepEqual(run(bare, ['upgrade', '--json']).json.pending, []);
  cleanup(dir);
  cleanup(bare);
});

test('AE1: an old repository lists every migration it needs, with version, reason and files', () => {
  const dir = oldRepo();
  const r = run(dir, ['upgrade', '--json']);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(ids(r), ['profile-names', 'kaizen-ops', 'hook-lookup']);
  const byId = Object.fromEntries(r.json.pending.map((m) => [m.id, m]));
  assert.equal(byId['profile-names'].since, '3.4.0');
  assert.deepEqual(byId['profile-names'].files, ['.kaizen/config.json']);
  assert.match(byId['kaizen-ops'].reason, /declares deployment environments/);
  assert.deepEqual(byId['hook-lookup'].files, ['.githooks/pre-push']);
  assert.ok(r.json.pending.every((m) => m.auto));
  const text = run(dir, ['upgrade']).stdout;
  assert.match(text, /3 migration\(s\) pending/);
  assert.match(text, /node \$K upgrade --apply/);
  cleanup(dir);
});

test('AE2: --apply fixes them in place, keeps formatting and team lines, then has nothing left', () => {
  const dir = oldRepo();
  const r = run(dir, ['upgrade', '--apply', '--json']);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(r.json.applied.map((a) => a.id), ['profile-names', 'kaizen-ops', 'hook-lookup']);
  assert.deepEqual([...r.json.written].sort(), ['.claude/settings.json', '.githooks/pre-push', '.kaizen/config.json']);
  // The one value rewritten, the file's own spacing kept.
  assert.match(read(dir, '.kaizen/config.json'), /^ {2}"profile": {2}"prototype",$/m);
  assert.equal(JSON.parse(read(dir, '.claude/settings.json')).enabledPlugins['kaizen-ops@dojo'], true);
  assert.match(read(dir, '.githooks/pre-push'), /echo team-check\nexec node "\$cli" githook pre-push/);
  assert.doesNotMatch(run(dir, ['doctor', '--json']).json.checks.find((c) => c.id === 'git_hooks').evidence, /older Kaizen/);
  // Idempotent.
  assert.deepEqual(run(dir, ['upgrade', '--json']).json.pending, []);
  const again = run(dir, ['upgrade', '--apply', '--json']).json;
  assert.deepEqual([again.applied, again.manual, again.written], [[], [], []]);
  assert.match(run(dir, ['upgrade', '--apply']).stdout, /nothing to migrate/);
  cleanup(dir);
});

test('AE3: a migration that cannot be automated is listed with its steps and never touched', () => {
  const dir = tempRepo({ '.kaizen/config.json': { profile: 'product' }, 'docs/solutions/bug/x.md': '# x\n' });
  const list = run(dir, ['upgrade', '--json']).json.pending;
  assert.deepEqual(list.map((m) => [m.id, m.auto, m.manual]), [['learnings-folder', false, ['git mv docs/solutions docs/learnings']]]);
  const r = run(dir, ['upgrade', '--apply', '--json']).json;
  assert.deepEqual(r.applied, []);
  assert.deepEqual(r.manual, [{ id: 'learnings-folder', steps: ['git mv docs/solutions docs/learnings'] }]);
  assert.ok(existsSync(join(dir, 'docs', 'solutions', 'bug', 'x.md')));
  assert.match(run(dir, ['upgrade', '--apply']).stdout, /✋ learnings-folder — by hand: git mv docs\/solutions docs\/learnings/);
  // Moved by hand: nothing left. A custom docs_root is followed.
  gitc(dir, ['mv', 'docs/solutions', 'docs/learnings']);
  assert.deepEqual(run(dir, ['upgrade', '--json']).json.pending, []);
  const custom = tempRepo({ '.kaizen/config.json': { docs_root: 'handbook' }, 'handbook/solutions/a.md': '# a\n' });
  assert.deepEqual(run(custom, ['upgrade', '--json']).json.pending[0].manual, ['git mv handbook/solutions handbook/learnings']);
  cleanup(dir);
  cleanup(custom);
});

test('marketplace-dojo: an old marketplace id gets kaizen@dojo, the old key is left to the team', () => {
  const dir = tempRepo({ '.kaizen/config.json': { profile: 'product' }, '.claude/settings.json': { enabledPlugins: { 'kaizen@claude-craft': true } } });
  const m = run(dir, ['upgrade', '--json']).json.pending;
  assert.deepEqual(m.map((x) => x.id), ['marketplace-dojo']);
  assert.match(m[0].reason, /enables kaizen@claude-craft but not kaizen@dojo/);
  const r = run(dir, ['upgrade', '--apply', '--json']).json;
  const settings = JSON.parse(read(dir, '.claude/settings.json'));
  assert.equal(settings.enabledPlugins['kaizen@dojo'], true);
  assert.equal(settings.enabledPlugins['kaizen@claude-craft'], true, 'never removed for the team');
  assert.ok(settings.extraKnownMarketplaces.dojo);
  assert.match(r.manual[0].steps[0], /remove "kaizen@claude-craft"/);
  assert.deepEqual(run(dir, ['upgrade', '--json']).json.pending, []);
  cleanup(dir);
});

test('each migration: does not apply once fixed by hand, nor when its trigger is absent', () => {
  // Profile renamed by hand, in config.json and config.local.json alike.
  const dir = tempRepo({ '.kaizen/config.json': { profile: 'critical' } });
  writeFileSync(join(dir, '.kaizen', 'config.local.json'), '{ "profile": "full" }\n');
  assert.deepEqual(run(dir, ['upgrade', '--json']).json.pending[0].files, ['.kaizen/config.local.json']);
  run(dir, ['upgrade', '--apply']);
  assert.equal(read(dir, '.kaizen/config.local.json'), '{ "profile": "critical" }\n');
  // kaizen-ops enabled in the user's own settings: nothing to migrate.
  const ops = tempRepo({ '.kaizen/config.json': { monitor: { signals: { up: { type: 'http', url: 'https://x' } } } } });
  const home = mkdtempSync(join(tmpdir(), 'kaizen-claude-'));
  assert.deepEqual(cli(ops, ['upgrade', '--json'], { env: { CLAUDE_CONFIG_DIR: home } }).json.pending.map((m) => m.id), ['kaizen-ops']);
  writeFileSync(join(home, 'settings.json'), JSON.stringify({ enabledPlugins: { 'kaizen-ops@dojo': true } }));
  assert.deepEqual(cli(ops, ['upgrade', '--json'], { env: { CLAUDE_CONFIG_DIR: home } }).json.pending, []);
  // Hooks that are not Kaizen's: not a migration.
  const foreign = tempRepo({ '.kaizen/config.json': {} });
  mkdirSync(join(foreign, '.githooks'));
  writeFileSync(join(foreign, '.githooks', 'pre-push'), '#!/bin/sh\nmake lint\n');
  assert.deepEqual(run(foreign, ['upgrade', '--json']).json.pending, []);
  for (const d of [dir, ops, foreign]) cleanup(d);
});
