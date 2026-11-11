import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readAgentSkills } from '../scripts/agentskills.mjs';
import { PLUGIN, cleanup, tempRepo } from './helpers.mjs';

const FIXTURES = join(PLUGIN, 'tests', 'fixtures', 'agent-skills');

function withFixtures(files = null) {
  const dir = tempRepo({}, { commit: false });
  cpSync(FIXTURES, dir, { recursive: true });
  if (files) for (const [p, text] of Object.entries(files)) writeFileSync(join(dir, p), text);
  return dir;
}

test('agent-skills: reads the spec, its boundaries and sections', () => {
  const dir = withFixtures();
  try {
    const { spec } = readAgentSkills(dir);
    assert.equal(spec.path, 'SPEC.md');
    assert.equal(spec.title, 'Orders CSV export');
    assert.ok(spec.sections.includes('Objective') && spec.sections.includes('Success Criteria'));
    assert.deepEqual(spec.boundaries.always, ['run `bin/rails test` before commits']);
    assert.deepEqual(spec.boundaries.ask, ['database schema changes, adding dependencies']);
    assert.deepEqual(spec.boundaries.never, ['commit secrets', 'edit `vendor/`']);
  } finally {
    cleanup(dir);
  }
});

test('agent-skills: reads the tasks, their files and verification; done = every acceptance box checked', () => {
  const dir = withFixtures();
  try {
    const { plan, tasks, checkpoints } = readAgentSkills(dir);
    assert.equal(plan.path, 'tasks/plan.md');
    assert.equal(tasks.path, 'tasks/todo.md');
    assert.deepEqual(tasks.list.map((t) => [t.n, t.title, t.done]), [
      [1, 'Orders CSV serializer', true],
      [2, 'Export endpoint', false],
      [3, 'Export button', false],
    ]);
    const [t1, t2, t3] = tasks.list;
    assert.deepEqual(t1.files, ['app/exports/orders_csv.rb', 'test/exports/orders_csv_test.rb']);
    assert.deepEqual(t1.verification.map((v) => v.command), ['bin/rails test test/exports/orders_csv_test.rb', null]);
    assert.deepEqual(t2.acceptance.map((a) => a.checked), [true, false]);
    assert.deepEqual(t2.depends, [1]);
    assert.deepEqual(t3.depends, [1, 2]);
    assert.deepEqual(t3.files, [], 'a task without "Files likely touched" has no files');
    assert.equal(t2.scope, 'Medium');
    assert.deepEqual(tasks.next && tasks.next.n, 2);
    assert.deepEqual(checkpoints, [{ title: 'After Tasks 1-2', done: false }]);
  } finally {
    cleanup(dir);
  }
});

test('agent-skills: reads CONSTRAINTS.md — floor, enforced rows with their command, measured, exceptions', () => {
  const dir = withFixtures();
  try {
    const { constraints } = readAgentSkills(dir);
    assert.equal(constraints.path, 'CONSTRAINTS.md');
    assert.equal(constraints.floor.length, 3);
    assert.deepEqual(constraints.enforced.map((r) => [r.dimension, r.command, r.stage]), [
      ['Lint', 'bundle exec rubocop', 'every edit'],
      ['Coverage', 'bin/rails test', 'task end, CI'],
    ]);
    assert.deepEqual(constraints.measured, [{ metric: 'Project coverage', today: '62.4%', direction: 'must not fall' }]);
    assert.deepEqual(constraints.exceptions, [{ id: 'W1', rule: 'Metrics/MethodLength', path: 'app/legacy/**', owner: '@ana', expires: '2026-11-01' }]);
  } finally {
    cleanup(dir);
  }
});

test('agent-skills: spec in docs/, CRLF files, missing sections and files are absent, never an error', () => {
  const dir = tempRepo({}, { commit: false });
  try {
    assert.deepEqual(readAgentSkills(dir), {}, 'nothing → empty result');
    const crlf = (p) => readFileSync(join(FIXTURES, p), 'utf8').replace(/\n/g, '\r\n');
    cpSync(FIXTURES, join(dir, 'docs'), { recursive: true });
    // Spec in docs/, todo with CRLF, no constraints, no plan.
    writeFileSync(join(dir, 'docs', 'SPEC.md'), crlf('SPEC.md'));
    const r = readAgentSkills(join(dir));
    assert.equal(r.spec.path, 'docs/SPEC.md');
    assert.deepEqual(r.spec.boundaries.never, ['commit secrets', 'edit `vendor/`']);
    assert.equal(r.tasks, undefined, 'tasks/ is only read at the root, as agent-skills writes it');
    cpSync(join(FIXTURES, 'tasks'), join(dir, 'tasks'), { recursive: true });
    writeFileSync(join(dir, 'tasks', 'todo.md'), crlf('tasks/todo.md'));
    const r2 = readAgentSkills(dir);
    assert.deepEqual(r2.tasks.list.map((t) => t.done), [true, false, false]);
    assert.deepEqual(r2.tasks.list[0].files, ['app/exports/orders_csv.rb', 'test/exports/orders_csv_test.rb']);
    writeFileSync(join(dir, 'CONSTRAINTS.md'), '# Constraints\n\nOnly prose, no section.\n');
    assert.deepEqual(readAgentSkills(dir).constraints, { path: 'CONSTRAINTS.md', floor: [], enforced: [], measured: [], exceptions: [] });
  } finally {
    cleanup(dir);
  }
});
