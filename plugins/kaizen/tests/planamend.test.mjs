// plan amend (append-only requirement IDs) and plan reviewed (review mark checked by plan check).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseFrontmatter } from '../scripts/lib.mjs';
import { PLUGIN, cleanup, cli, tempRepo } from './helpers.mjs';

function planRepo() {
  const dir = tempRepo({ 'README.md': '#\n' });
  writeFileSync(join(dir, 'plan.md'), readFileSync(join(PLUGIN, 'templates/plan-example.md'), 'utf8'));
  return dir;
}
const read = (dir) => readFileSync(join(dir, 'plan.md'), 'utf8');

test('add: next ID at the end of the requirements, covered by the unit, others untouched (AE3)', () => {
  const dir = planRepo();
  const before = read(dir);
  const r = cli(dir, ['plan', 'amend', 'plan.md', '--add-req', 'Exports are logged with who and when.', '--covered-by', 'U2', '--by', 'Ana (PO)', '--reason', 'audit: who exported what']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.json.id, 'R6');
  const text = read(dir);
  assert.match(text, /- R5\. Beyond 10,000 orders[^\n]*\n(?: +[^\n]*\n)*- R6\. Exports are logged with who and when\.\n/);
  assert.match(text, /\*\*Covers:\*\* R1, R4, R5, AE1, AE3, R6/);
  for (const id of ['R1', 'R2', 'R3', 'R4', 'R5', 'AE1', 'KTD1']) assert.equal(text.split(id).length, before.split(id).length, `${id} citations unchanged`);
  const { data } = parseFrontmatter(text);
  assert.equal(data.amended.length, 1);
  assert.match(data.amended[0], /^\d{4}-\d\d-\d\d \| Ana \(PO\) \| R6 \| audit: who exported what$/);
  const check = cli(dir, ['plan', 'check', 'plan.md', '--json']);
  assert.equal(check.code, 0, JSON.stringify(check.json.errors));
  cleanup(dir);
});

test('a second amendment appends to the list; reasons with quotes and pipes survive', () => {
  const dir = planRepo();
  cli(dir, ['plan', 'amend', 'plan.md', '--add-req', 'A.', '--covered-by', 'U1', '--by', 'X', '--reason', 'first']);
  cli(dir, ['plan', 'amend', 'plan.md', '--add-req', 'B.', '--covered-by', 'U3', '--by', 'Y', '--reason', 'say "no" | twice']);
  const { data } = parseFrontmatter(read(dir));
  assert.equal(data.amended.length, 2);
  assert.match(data.amended[1], /\| R7 \| say "no" \| twice$/);
  assert.equal(cli(dir, ['plan', 'check', 'plan.md']).code, 0);
  cleanup(dir);
});

test('replace keeps the ID and the coverage', () => {
  const dir = planRepo();
  const r = cli(dir, ['plan', 'amend', 'plan.md', '--replace-req', 'R5', 'Beyond 50,000 orders, the export is refused.', '--by', 'Ana', '--reason', 'bigger customers']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.json.id, 'R5');
  const text = read(dir);
  assert.match(text, /- R5\. Beyond 50,000 orders, the export is refused\.\n/);
  assert.doesNotMatch(text, /Beyond 10,000 orders/);
  assert.equal(cli(dir, ['plan', 'check', 'plan.md']).code, 0);
  cleanup(dir);
});

test('an amendment that breaks the plan writes nothing', () => {
  const dir = planRepo();
  const before = read(dir);
  let r = cli(dir, ['plan', 'amend', 'plan.md', '--add-req', 'Orphan.', '--by', 'X', '--reason', 'y']);
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /R6 is not covered by any unit/);
  r = cli(dir, ['plan', 'amend', 'plan.md', '--add-req', 'A.', '--covered-by', 'U9', '--by', 'X', '--reason', 'y']);
  assert.match(r.stderr, /U9 not found/);
  r = cli(dir, ['plan', 'amend', 'plan.md', '--add-req', 'A.', '--covered-by', 'U1']);
  assert.match(r.stderr, /--by/);
  assert.equal(read(dir), before);
  cleanup(dir);
});

test('review mark: never reviewed → warning; reviewed → none; changed after → warning (AE4)', () => {
  const dir = planRepo();
  const warn = () => cli(dir, ['plan', 'check', 'plan.md', '--json']).json.warnings.join(' | ');
  assert.match(warn(), /plan never reviewed/);
  const r = cli(dir, ['plan', 'reviewed', 'plan.md']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(parseFrontmatter(read(dir)).data.reviewed, /^\d{4}-\d\d-\d\d [0-9a-f]{12}$/);
  assert.doesNotMatch(warn(), /review/);
  writeFileSync(join(dir, 'plan.md'), read(dir).replace('one row per order', 'one row per order line'));
  writeFileSync(join(dir, 'plan.md'), read(dir).replace('item count.', 'item count, weight.'));
  assert.match(warn(), /plan changed since its review/);
  cli(dir, ['plan', 'reviewed', 'plan.md']);
  cli(dir, ['plan', 'amend', 'plan.md', '--add-req', 'A.', '--covered-by', 'U1', '--by', 'X', '--reason', 'y']);
  assert.match(warn(), /plan changed since its review/);
  cleanup(dir);
});
