// kaizen upgrade: the migrations a repository still needs after a Kaizen update, detected from its state.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLUGIN, cleanup, cli, tempRepo } from './helpers.mjs';

// An empty Claude config dir: the user's own settings never enable kaizen-ops behind a test's back.
const ENV = { CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), 'kaizen-claude-')) };
const run = (dir, args) => cli(dir, args, { env: ENV });
const ids = (r) => r.json.pending.map((m) => m.id);
const read = (dir, f) => readFileSync(join(dir, f), 'utf8');

// A repository left as Kaizen 5.x shaped it (AE1): settings without agent-skills, a key Kaizen 6.0 no
// longer reads.
function oldRepo() {
  return tempRepo({
    '.kaizen/config.json': '{\n  "profile":  "lean"\n}\n',
    '.claude/settings.json': { extraKnownMarketplaces: { dojo: { source: { source: 'github', repo: 'Lingelo/dojo' } } }, enabledPlugins: { 'kaizen@dojo': true } },
  });
}

test('nothing pending: one line, and nothing at all outside a Kaizen repo', () => {
  const dir = tempRepo({ '.kaizen/config.json': {} });
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
  assert.deepEqual(ids(r), ['agent-skills-base']);
  const byId = Object.fromEntries(r.json.pending.map((m) => [m.id, m]));
  assert.equal(byId['agent-skills-base'].since, '6.0.0');
  assert.match(byId['agent-skills-base'].reason, /enables kaizen@dojo but not agent-skills@dojo/);
  assert.match(byId['agent-skills-base'].reason, /\.kaizen\/config\.json: no longer read/);
  assert.deepEqual(byId['agent-skills-base'].manual, ['remove "profile" from .kaizen/config.json (no longer read)']);
  assert.ok(r.json.pending.every((m) => m.auto));
  const text = run(dir, ['upgrade']).stdout;
  assert.match(text, /1 migration\(s\) pending/);
  assert.match(text, /node \$K upgrade --apply/);
  cleanup(dir);
});

test('AE2: --apply fixes what it owns, keeps team lines, leaves the manual steps until done by hand', () => {
  const dir = oldRepo();
  const r = run(dir, ['upgrade', '--apply', '--json']);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(r.json.applied.map((a) => a.id), ['agent-skills-base']);
  assert.deepEqual(r.json.written, ['.claude/settings.json']);
  assert.equal(JSON.parse(read(dir, '.claude/settings.json')).enabledPlugins['agent-skills@dojo'], true);
  assert.deepEqual(r.json.manual, [{ id: 'agent-skills-base', steps: ['remove "profile" from .kaizen/config.json (no longer read)'] }]);
  assert.match(read(dir, '.kaizen/config.json'), /"profile"/, 'the team\'s file is never edited');
  writeFileSync(join(dir, '.kaizen', 'config.json'), '{}\n');
  assert.deepEqual(run(dir, ['upgrade', '--json']).json.pending, []);
  const again = run(dir, ['upgrade', '--apply', '--json']).json;
  assert.deepEqual([again.applied, again.manual, again.written], [[], [], []]);
  assert.match(run(dir, ['upgrade', '--apply']).stdout, /nothing to migrate/);
  cleanup(dir);
});

test('agent-skills-base: a constitution and Kaizen Packs are turned into CONSTRAINTS.md by hand', () => {
  const dir = tempRepo({ '.kaizen/config.json': { packs: [{ source: 'kaizen-packs/house' }] }, 'CONSTITUTION.md': '# C\n', 'kaizen-packs/house/rule.md': '# r\n' });
  const [m] = run(dir, ['upgrade', '--json']).json.pending;
  assert.equal(m.id, 'agent-skills-base');
  assert.equal(m.auto, true, 'nothing to declare: apply does nothing');
  assert.equal(m.manual.length, 3);
  assert.match(m.manual.join('\n'), /remove "packs" from \.kaizen\/config\.json/);
  assert.match(m.manual.join('\n'), /\/kaizen:constraints/);
  assert.match(m.manual.join('\n'), /kaizen-packs\//);
  writeFileSync(join(dir, 'CONSTRAINTS.md'), '# Constraints\n');
  assert.equal(run(dir, ['upgrade', '--json']).json.pending[0].manual.length, 2, 'CONSTRAINTS.md present: the constitution is done');
  cleanup(dir);
});

test('production-removed: deploy/monitor config and kaizen-ops listed by hand, never touched (6.0)', () => {
  const dir = tempRepo({
    '.kaizen/config.json': { deploy: { environments: { production: { command: 'make deploy' } } }, monitor: { signals: {} } },
    '.claude/settings.json': { enabledPlugins: { 'kaizen@dojo': true, 'kaizen-ops@dojo': true } },
  });
  const [m] = run(dir, ['upgrade', '--json']).json.pending;
  assert.equal(m.id, 'production-removed');
  assert.equal(m.since, '6.0.0');
  assert.equal(m.auto, false);
  assert.deepEqual(m.files, ['.kaizen/config.json', '.claude/settings.json']);
  assert.equal(m.manual.length, 3);
  assert.match(m.manual.join('\n'), /remove the "deploy" key from \.kaizen\/config\.json/);
  assert.match(m.manual.join('\n'), /remove "kaizen-ops@dojo" from enabledPlugins in \.claude\/settings\.json/);
  const before = read(dir, '.kaizen/config.json');
  run(dir, ['upgrade', '--apply']);
  assert.equal(read(dir, '.kaizen/config.json'), before, 'never edited by Kaizen');
  cleanup(dir);
});

test('each migration: does not apply once fixed by hand, nor when its trigger is absent', () => {
  // Production leftovers removed by hand: nothing to migrate.
  const ops = tempRepo({ '.kaizen/config.json': { monitor: { signals: { up: { type: 'http', url: 'https://x' } } } } });
  assert.deepEqual(run(ops, ['upgrade', '--json']).json.pending.map((m) => m.id), ['production-removed']);
  writeFileSync(join(ops, '.kaizen', 'config.json'), '{}\n');
  assert.deepEqual(run(ops, ['upgrade', '--json']).json.pending, []);
  cleanup(ops);
});

test('AE4: doctor reports pending migrations with their count, ids and the fix', () => {
  const dir = oldRepo();
  const check = (d) => run(d, ['doctor', '--json']).json.checks.find((c) => c.id === 'upgrade');
  const before = check(dir);
  assert.equal(before.status, 'warn');
  assert.equal(before.evidence, '1 Kaizen migration(s) pending (agent-skills-base)');
  assert.match(before.fix, /node "\$K" upgrade/);
  run(dir, ['upgrade', '--apply']);
  assert.match(check(dir).evidence, /1 Kaizen migration\(s\) pending \(agent-skills-base\)/, 'its manual step is left');
  writeFileSync(join(dir, '.kaizen', 'config.json'), '{}\n');
  assert.deepEqual([check(dir).status, check(dir).evidence], ['ok', 'nothing to migrate']);
  // A manual one is counted as such; outside a Kaizen repo, no check at all.
  const manual = tempRepo({ '.kaizen/config.json': { deploy: {} } });
  assert.match(check(manual).evidence, /1 Kaizen migration\(s\) pending \(production-removed\), 1 by hand/);
  const bare = tempRepo({ 'a.txt': 'a\n' });
  assert.equal(check(bare), undefined);
  for (const d of [dir, manual, bare]) cleanup(d);
});

// AE5: every release from 4.3.0 on that breaks or deprecates something declares its migration, or says
// why there is none — so the next one cannot fall back into a corner of the doctor.
const semver = (v) => v.split('.').map(Number);
const atLeast = (v, min) => { const [a, b] = [semver(v), semver(min)]; for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]; return true; };
function undeclared(changelog, migrations, exempt) {
  const out = [];
  for (const [, version, body] of changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\][^\n]*\n([\s\S]*?)(?=^## \[|(?![\s\S]))/gm)) {
    if (!atLeast(version, '4.3.0') || !/^### (Breaking|Deprecated)/m.test(body)) continue;
    if (!migrations.some((m) => m.since === version) && !exempt[version]) out.push(version);
  }
  return out;
}

test('AE5: a Breaking or Deprecated release from 4.3.0 on declares its migration or why there is none', async () => {
  const { MIGRATIONS, NO_MIGRATION } = await import('../scripts/upgrade.mjs');
  assert.deepEqual(undeclared(readFileSync(join(PLUGIN, 'CHANGELOG.md'), 'utf8'), MIGRATIONS, NO_MIGRATION), []);
  // The check itself: a breaking 9.9.0 with nothing declared fails; a migration or an exemption lifts it;
  // older releases are covered by the migrations of 4.3.0.
  const fixture = '# Changelog\n\n## [9.9.0] - 2030-01-01\n\n### Breaking\n- renamed a key\n\n## [9.8.0] - 2030-01-01\n\n### Added\n- x\n\n## [4.0.0] - 2026-10-20\n\n### Breaking\n- moved\n';
  assert.deepEqual(undeclared(fixture, MIGRATIONS, NO_MIGRATION), ['9.9.0']);
  assert.deepEqual(undeclared(fixture, [...MIGRATIONS, { since: '9.9.0' }], NO_MIGRATION), []);
  assert.deepEqual(undeclared(fixture, MIGRATIONS, { '9.9.0': 'the key is still read' }), []);
});
