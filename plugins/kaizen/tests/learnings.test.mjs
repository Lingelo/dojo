// Learnings read back by the engine (post-edit.mjs): when agent-skills' spec or plan is written, and when a
// file a learning is about is edited — no skill has to remember to search.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { POST_EDIT, cleanup, hook, tempRepo, writeFiles } from './helpers.mjs';

const learning = (title, extra = '') => `---\ntitle: ${title}\ndate: 2026-09-12\nmodule: exports\nproblem_type: runtime_error\ncomponent: service_layer\nsymptoms: ["Unreadable accents"]\nroot_cause: wrong_api\nresolution_type: code_fix\nseverity: medium\ntags: [csv, excel, bom]\n${extra}---\n# ${title}\n`;
const repo = () =>
  tempRepo({
    '.kaizen/config.json': {},
    'docs/learnings/runtime-errors/csv-bom.md': learning('Excel breaks accents in CSV exports', 'files: ["src/exports/**"]\n'),
    'docs/learnings/conventions/jobs.md': '---\ntitle: Name jobs with a verb\ndate: 2026-09-01\nmodule: jobs\nproblem_type: convention\ncomponent: background_job\nseverity: low\n---\n# y\n',
  });
const written = (dir, file, session = 'S1') => hook(POST_EDIT, { cwd: dir, session_id: session, tool_name: 'Write', tool_input: { file_path: join(dir, file) } });
const context = (r) => r.json?.hookSpecificOutput?.additionalContext || '';

test('SPEC.md written: the matching learnings are added to the context, once per version', () => {
  const dir = repo();
  writeFiles(dir, { 'SPEC.md': '# Spec: Orders CSV export\n\n## Objective\nExport the orders as CSV for Excel.\n' });
  const first = written(dir, 'SPEC.md');
  assert.equal(first.json.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(context(first), /docs\/learnings\/runtime-errors\/csv-bom\.md — Excel breaks accents in CSV exports/);
  assert.doesNotMatch(context(first), /jobs\.md/, 'only what matches');
  assert.match(context(first), /cite them in tasks\/plan\.md/);
  assert.equal(written(dir, 'SPEC.md').stdout, '', 'same content: not repeated');
  writeFiles(dir, { 'SPEC.md': '# Spec: Orders CSV export\n\n## Objective\nExport the orders as CSV for Excel, with filters.\n' });
  assert.match(context(written(dir, 'SPEC.md')), /csv-bom/, 'a new version is read again');
  cleanup(dir);
});

test('tasks/plan.md written: same read-back, cited in the plan itself', () => {
  const dir = repo();
  writeFiles(dir, { 'tasks/plan.md': '# Plan: CSV export with Excel accents\n' });
  const r = written(dir, 'tasks/plan.md');
  assert.match(context(r), /csv-bom\.md/);
  assert.match(context(r), /cite them in tasks\/plan\.md/);
  cleanup(dir);
});

test('a file a learning is about: its learning comes back once per session, and the gate turns on', () => {
  const dir = repo();
  const r = written(dir, 'src/exports/orders.js');
  assert.match(context(r), /Learnings about src\/exports\/orders\.js:\n- docs\/learnings\/runtime-errors\/csv-bom\.md/);
  assert.equal(written(dir, 'src/exports/orders.js').stdout, '', 'once per session');
  assert.match(context(written(dir, 'src/exports/orders.js', 'S2')), /csv-bom/, 'a new session reads it again');
  assert.equal(written(dir, 'src/other.js').stdout, '', 'no learning about this file');
  cleanup(dir);
});

test('nothing outside a Kaizen repo, nothing without learnings', () => {
  const bare = tempRepo({ 'SPEC.md': '# Spec: CSV\n' });
  assert.equal(written(bare, 'SPEC.md').stdout, '');
  const empty = tempRepo({ '.kaizen/config.json': {}, 'SPEC.md': '# Spec: CSV\n' });
  assert.equal(written(empty, 'SPEC.md').stdout, '');
  cleanup(bare);
  cleanup(empty);
});
