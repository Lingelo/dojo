// The whole cycle in one repository, through the real hook scripts in the order Claude Code runs them:
// setup → spec (learnings come back) → plan → build (quality gate) → commit (secret gate) → push (review
// gate) → review recorded → ship → cost and friction measured. Each step checks what the user sees.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { GATE, PLUGIN, POST_EDIT, REVIEW_GATE, REVIEW_HOOKS, cleanup, cli, gitc, hook, tempRepo, writeFiles } from './helpers.mjs';

const SECRET_GATE = join(PLUGIN, 'scripts', 'secret-gate.mjs');
const LEDGER_HOOK = join(PLUGIN, 'scripts', 'ledger-hook.mjs');
const S = 'S1';

test('the whole cycle, hook by hook', () => {
  const dir = tempRepo({ 'package.json': '{ "name": "shop" }\n', 'src/total.js': 'export const total = (xs) => xs.length;\n' });
  const next = () => cli(dir, ['status', '--json']).json.next.map((n) => n.command.split(' ')[0]);
  const run = (script, payload, args = []) => hook(script, { cwd: dir, session_id: S, ...payload }, args);
  const edit = (file, tool = 'Edit') => run(POST_EDIT, { tool_name: tool, tool_input: { file_path: join(dir, file) } });
  const bash = (script, command, extra = {}) => run(script, { tool_name: 'Bash', tool_input: { command }, ...extra });
  const transcript = join(dir, '..', `${dir.split(/[\\/]/).pop()}-${S}.jsonl`);
  const say = (id, text, input = 0) =>
    appendFileSync(transcript, `${JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { id, role: 'assistant', model: 'claude-sonnet-5-5', usage: { input_tokens: input, output_tokens: 0 }, content: [{ type: 'text', text }] } })}\n`);
  const stop = () => [GATE, REVIEW_HOOKS, LEDGER_HOOK].map((h) => run(h, { transcript_path: transcript }, h === REVIEW_HOOKS ? ['--stop'] : []));
  writeFileSync(transcript, '');

  // 1. /kaizen:setup — before it, the only next step is setup; after, the spec.
  assert.deepEqual(next(), ['/kaizen:setup']);
  assert.equal(cli(dir, ['init']).code, 0);
  writeFiles(dir, { '.kaizen/config.json': { verify: { test: 'node -e "process.exit(require(\'fs\').readFileSync(\'src/total.js\',\'utf8\').includes(\'reduce\')?0:1)"' } } });
  writeFiles(dir, {
    'docs/learnings/logic-errors/totals-in-cents.md':
      '---\ntitle: Order totals are summed in cents\ndate: 2026-09-12\nmodule: orders\nproblem_type: logic_error\ncomponent: service_layer\nsymptoms: ["Totals off by a cent"]\nroot_cause: logic_error\nresolution_type: code_fix\nseverity: high\ntags: [totals, orders, cents]\nfiles: ["src/total.js"]\n---\n# Order totals are summed in cents\n',
  });
  gitc(dir, ['add', '-A'], ['commit', '-qm', 'chore: kaizen setup']);
  assert.deepEqual(next(), ['/kaizen:spec']);

  // 2. /kaizen:spec on a feature branch — the learning about totals comes back when SPEC.md is written.
  gitc(dir, ['checkout', '-qb', 'feat/SHOP-7-order-totals']);
  writeFiles(dir, { 'SPEC.md': '# Spec: order totals\n\n## Objective\nSum the order totals, in cents.\n' });
  const spec = edit('SPEC.md', 'Write');
  assert.match(spec.json?.hookSpecificOutput?.additionalContext || '', /totals-in-cents\.md — Order totals are summed in cents/);
  assert.deepEqual(next(), ['/kaizen:plan'], 'a spec without tasks');

  // 3. /kaizen:plan — agent-skills' task list drives the next command.
  writeFiles(dir, { 'tasks/plan.md': '# Plan\n\n1. Sum the totals\n', 'tasks/todo.md': '# Tasks\n\n## Task 1: Sum the totals\n\n**Acceptance criteria:**\n- [ ] totals in cents\n' });
  edit('tasks/todo.md', 'Write');
  assert.deepEqual(next(), ['/kaizen:build'], 'planning files are not code to review');

  // 4. /kaizen:build — editing code turns the quality gate on; the turn cannot end while the test is red.
  const learned = edit('src/total.js');
  assert.match(learned.json?.hookSpecificOutput?.additionalContext || '', /totals-in-cents/, 'files: glob brings the learning back');
  say('m1', 'Editing src/total.js', 120000);
  const [red] = stop();
  assert.equal(red.code, 2, 'red test: the turn goes on');
  assert.match(red.stderr, /test/);
  writeFiles(dir, { 'src/total.js': 'export const total = (xs) => xs.reduce((a, x) => a + x.cents, 0);\n', 'tasks/todo.md': '# Tasks\n\n## Task 1: Sum the totals\n\n**Acceptance criteria:**\n- [x] totals in cents\n' });
  say('m2', 'Fixed with reduce', 80000);
  const [green] = stop();
  assert.equal(green.code, 0, 'green: the gate lets the turn end');
  assert.equal(cli(dir, ['gate', 'status', '--json']).json.active, false, 'and turns itself off');

  // 5. Commit — a secret is refused, the clean commit goes through.
  const AWS = 'AKIA' + 'Q3EXZ7RT2LMN4PVW';
  writeFiles(dir, { 'src/config.js': `export const key = "${AWS}";\n` });
  assert.equal(bash(SECRET_GATE, 'git add -A && git commit -m "feat(SHOP-7): totals"').code, 2, 'secret refused');
  writeFiles(dir, { 'src/config.js': 'export const key = process.env.KEY;\n' });
  assert.equal(bash(SECRET_GATE, 'git add -A && git commit -m "feat(SHOP-7): totals"').code, 0);
  gitc(dir, ['add', '-A'], ['commit', '-qm', 'feat(SHOP-7): order totals in cents']);

  // 6. Push before any review — stopped, Claude asks the user, the review first.
  const first = bash(REVIEW_GATE, 'git push -u origin feat/SHOP-7-order-totals');
  assert.equal(first.code, 2);
  assert.match(first.stderr, /1\. "Run the review \(Recommended\)"/);

  // 7. /kaizen:review — agent-skills' skill loads (PostToolUse Skill), writes its review, the turn ends.
  run(REVIEW_HOOKS, { tool_name: 'Skill', tool_input: { skill: 'kaizen:code-review-and-quality' } }, ['--evidence']);
  say('m3', '## Review Summary\n\n**Verdict:** APPROVE\n\n### Critical Issues\n- None\n', 60000);
  stop();
  const st = cli(dir, ['review', 'status']).json;
  assert.equal(st.review.verdict, 'ready');
  assert.equal(st.push.allowed, true);
  assert.deepEqual(next(), ['/kaizen:ship']);

  // 8. /kaizen:ship — the push now goes out without a question.
  const second = bash(REVIEW_GATE, 'git push -u origin feat/SHOP-7-order-totals');
  assert.equal(second.code, 0);
  assert.equal(second.stdout, '', 'no prompt: the branch is reviewed');

  // 9. Measured — the work item's cost, and every stop of the cycle.
  assert.equal(cli(dir, ['cost', 'current']).json.item, 'SHOP-7', 'the Jira key of the branch names the work item');
  assert.equal(cli(dir, ['cost', 'SHOP-7', '--json']).json.tokens, 260000, 'every turn of the cycle charged to it');
  const kinds = cli(dir, ['metrics', '--no-github']).json.friction;
  assert.equal(kinds.push.stopped, 1);
  assert.equal(kinds.reviews_recorded, 1);
  assert.equal(kinds.quality.blocked, 1);
  assert.equal(kinds.secrets.refused, 1);
  cleanup(dir);
});
