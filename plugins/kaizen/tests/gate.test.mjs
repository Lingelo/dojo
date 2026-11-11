// The quality gate: on by itself when a session edits code (post-edit.mjs), the Stop hook blocks while
// the checks are red, and turns it off when they are green.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { GATE, POST_EDIT, cleanup, cli, gitc, hook, tempRepo, writeFiles } from './helpers.mjs';

const stop = (dir, session = 'S1') => spawnSync(process.execPath, [GATE], { input: JSON.stringify({ cwd: dir, session_id: session }), encoding: 'utf8' });
const edit = (dir, file, session = 'S1', tool = 'Edit') => hook(POST_EDIT, { cwd: dir, session_id: session, tool_name: tool, tool_input: { file_path: join(dir, file) } });
const gate = (dir) => (existsSync(join(dir, '.kaizen/state/gate.json')) ? JSON.parse(readFileSync(join(dir, '.kaizen/state/gate.json'), 'utf8')) : null);
const repoWithTest = (exitCode, extra = {}) => tempRepo({ '.kaizen/config.json': { verify: { test: `node -e "process.exit(${exitCode})"` }, gate: { max_blocks: 2 }, ...extra }, 'app.js': '1\n' });

test('no code edited: the Stop hook runs nothing and lets the turn end', () => {
  const dir = repoWithTest(1);
  assert.equal(stop(dir).status, 0);
  edit(dir, 'README.md');
  edit(dir, 'docs/notes.md');
  assert.equal(gate(dir), null, 'Markdown does not turn the gate on');
  assert.equal(stop(dir).status, 0);
  cleanup(dir);
});

test('code edited and checks red: blocks (exit 2) up to max_blocks, then lets the turn end and turns off', () => {
  const dir = repoWithTest(1);
  edit(dir, 'app.js');
  assert.equal(gate(dir).active, true);
  assert.deepEqual(gate(dir).files, ['app.js']);
  const first = stop(dir);
  assert.equal(first.status, 2);
  assert.match(first.stderr, /Quality gate \(1\/2\): code was edited and the checks are red/);
  assert.match(first.stderr, /never by skipping or weakening a test/);
  assert.equal(stop(dir).status, 2);
  const third = stop(dir);
  assert.equal(third.status, 0);
  assert.match(third.stderr, /letting you finish/);
  assert.equal(gate(dir), null, 'released: off until code is edited again');
  cleanup(dir);
});

test('code edited and checks green: lets the turn end and turns itself off', () => {
  const dir = repoWithTest(0);
  edit(dir, 'src/a.ts', 'S1', 'Write');
  assert.equal(stop(dir).status, 0);
  assert.equal(gate(dir), null);
  cleanup(dir);
});

test('the gate belongs to the session that edited', () => {
  const dir = repoWithTest(1);
  edit(dir, 'app.js', 'S1');
  assert.equal(stop(dir, 'S2').status, 0, 'another session is not concerned');
  assert.equal(stop(dir, 'S1').status, 2);
  edit(dir, 'app.js', 'S2');
  assert.equal(gate(dir).session, 'S2', 'an edit in another session takes it over');
  cleanup(dir);
});

test('disabled by the config, outside a Kaizen repo, expired', () => {
  const off = repoWithTest(1, { gate: { enabled: false } });
  edit(off, 'app.js');
  assert.equal(gate(off), null);
  const bare = tempRepo({ 'app.js': '1\n' });
  edit(bare, 'app.js');
  assert.ok(!existsSync(join(bare, '.kaizen')), 'nothing written outside a Kaizen repo');
  const old = repoWithTest(1);
  writeFiles(old, { '.kaizen/state/gate.json': { active: true, session: 'S1', since: '2020-01-01T00:00:00Z' } });
  const r = stop(old);
  assert.equal(r.status, 0);
  assert.match(r.stderr, /expired/);
  for (const d of [off, bare, old]) cleanup(d);
});

test('gate off: the escape hatch, and the state is ignored by git', () => {
  const dir = repoWithTest(1);
  edit(dir, 'app.js');
  cli(dir, ['gate', 'off']);
  assert.equal(stop(dir).status, 0);
  edit(dir, 'app.js');
  assert.equal(execGit(dir, ['status', '--porcelain', '.kaizen/state']), '');
  cleanup(dir);
});
const execGit = (dir, args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' }).stdout.trim();

test('budget exhausted: remaining commands are not run and do not block', () => {
  const dir = tempRepo({
    '.kaizen/config.json': { verify: { test: 'node -e "setTimeout(() => {}, 3000)"', lint: 'node -e "process.exit(1)"' }, gate: { budget_seconds: 1.5 } },
  });
  edit(dir, 'a.js');
  const r = stop(dir);
  assert.equal(r.status, 2, 'test killed at the budget = red');
  assert.match(r.stderr, /timeout/);
  assert.doesNotMatch(r.stderr, /lint/, 'lint never run');
  cleanup(dir);
});

test('targeted checks: {files} = files touched by the branch', () => {
  const dir = tempRepo({
    '.kaizen/config.json': { verify: { test: 'node -e "process.exit(0)"' }, gate: { targeted: { lint: 'node -e "process.exit(process.argv.slice(1).includes(\'b.js\') ? 1 : 0)" {files}' } } },
    'a.js': 'a\n',
  });
  gitc(dir, ['checkout', '-qb', 'feat/x']);
  writeFiles(dir, { 'b.js': 'b\n' });
  edit(dir, 'b.js');
  const r = stop(dir);
  assert.equal(r.status, 2, 'new untracked file passed to the linter');
  assert.match(r.stderr, /'b\.js'|"b\.js"/);
  cleanup(dir);
});
