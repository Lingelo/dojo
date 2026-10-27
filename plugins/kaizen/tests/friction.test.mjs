// Friction: every stop by a guard rail is logged, and metrics read what the gates cost.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { friction } from '../scripts/metrics.mjs';
import { pushReasonKey } from '../scripts/lib.mjs';
import { GATE, PLUGIN, REVIEW_GATE, cleanup, cli, gitc, tempRepo, writeFiles } from './helpers.mjs';

const SECRET_GATE = join(PLUGIN, 'scripts', 'secret-gate.mjs');
const run = (script, dir, payload) => spawnSync(process.execPath, [script], { input: JSON.stringify({ cwd: dir, ...payload }), encoding: 'utf8' });
const events = (dir) => readFileSync(join(dir, '.kaizen', 'state', 'friction.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('pushReasonKey: stable keys for the refusals of checkPush', () => {
  assert.equal(pushReasonKey({ reason: 'no review recorded for this branch' }), 'no_review');
  assert.equal(pushReasonKey({ review: {}, unreviewed_lines: 9, reason: '9 lines changed since the review (ceiling 3)' }), 'stale');
  assert.equal(pushReasonKey({ review: {}, unreviewed_lines: 0, reason: 'the last review returned ⛔ and nothing changed since' }), 'blocked_verdict');
});

test('the gates log their stops, and what lifts them', () => {
  const dir = tempRepo({ '.kaizen/config.json': { review: { require_before_push: true }, verify: { test: 'node -e "process.exit(1)"' } }, 'app.js': 'a\n' });
  gitc(dir, ['checkout', '-qb', 'feat/x']);
  writeFiles(dir, { 'app.js': 'a\nb\n' });
  gitc(dir, ['commit', '-qam', 'feat: b']);

  assert.equal(run(REVIEW_GATE, dir, { tool_name: 'Bash', tool_input: { command: 'git push -u origin feat/x' } }).status, 2);
  assert.equal(cli(dir, ['review', 'record', '--verdict', 'ready']).code, 0, 'light review');
  assert.equal(run(SECRET_GATE, dir, { tool_name: 'Bash', tool_input: { command: 'git commit --no-verify -m x' } }).status, 2);
  cli(dir, ['gate', 'on']);
  assert.equal(run(GATE, dir, {}).status, 2);

  assert.deepEqual(events(dir).map((e) => [e.gate, e.kind]), [
    ['push', 'refused'],
    ['push', 'review_recorded'],
    ['secrets', 'no_verify'],
    ['quality', 'blocked'],
  ]);
  const [push, , , quality] = events(dir);
  assert.equal(push.reason, 'no_review');
  assert.equal(push.branch, 'feat/x');
  assert.equal(push.source, 'claude');
  assert.deepEqual(quality.checks, ['test']);
  assert.match(readFileSync(join(dir, '.kaizen', 'state', '.gitignore'), 'utf8'), /\*/, 'never committed');
  cleanup(dir);
});

test('no log outside a Kaizen repo (the secret gate runs everywhere)', () => {
  const dir = tempRepo({ 'app.js': 'a\n' });
  assert.equal(run(SECRET_GATE, dir, { tool_name: 'Bash', tool_input: { command: 'git commit --no-verify -m x' } }).status, 2);
  assert.equal(existsSync(join(dir, '.kaizen')), false);
  cleanup(dir);
});

test('metrics friction: time blocked on push, waiver share, checks that block, still blocked', () => {
  const dir = tempRepo({});
  const t = (min) => new Date(Date.UTC(2026, 9, 1, 10, min)).toISOString();
  const log = [
    { at: t(0), gate: 'push', kind: 'refused', reason: 'no_review', branch: 'a', source: 'claude' },
    { at: t(5), gate: 'push', kind: 'refused', reason: 'no_review', branch: 'a', source: 'claude' },
    { at: t(30), gate: 'push', kind: 'review_recorded', branch: 'a' },
    { at: t(31), gate: 'push', kind: 'refused', reason: 'stale', branch: 'b', source: 'git' },
    { at: t(41), gate: 'push', kind: 'waiver_confirmed', gap: false, branch: 'b' },
    { at: t(42), gate: 'push', kind: 'refused', reason: 'no_review', branch: 'c', source: 'claude' },
    { at: t(43), gate: 'quality', kind: 'blocked', checks: ['lint', 'test'] },
    { at: t(44), gate: 'quality', kind: 'blocked', checks: ['test'] },
    { at: t(45), gate: 'quality', kind: 'released', checks: ['test'] },
    { at: t(46), gate: 'secrets', kind: 'refused', findings: 2 },
    { at: t(47), gate: 'deploy', kind: 'refused', env: 'production' },
    { at: t(48), gate: 'push', kind: 'asked', reason: 'no_review', branch: 'd', source: 'claude' },
  ];
  writeFiles(dir, { '.kaizen/state/friction.jsonl': `${log.map((e) => JSON.stringify(e)).join('\n')}\nnot json\n` });
  const f = friction(dir, new Date(Date.UTC(2026, 8, 1)));
  assert.equal(f.events, 12);
  assert.deepEqual(f.push.by_reason, { no_review: 3, stale: 1 });
  assert.deepEqual(f.push.by_source, { claude: 3, git: 1 });
  assert.equal(f.push.unblocked_median_minutes, 20, 'median of 30 (from the first refusal) and 10');
  assert.equal(f.push.still_blocked, 1);
  assert.equal(f.push.asked, 1, 'an "ask" push is counted apart, never as blocked');
  assert.equal(f.waivers.confirmed, 1);
  assert.equal(f.waivers.share, 0.5);
  assert.deepEqual(f.quality, { blocked: 2, released: 1, by_check: { lint: 1, test: 2 } });
  assert.deepEqual(f.secrets, { refused: 1, no_verify: 0 });
  assert.deepEqual(f.other_refusals, { deploy: 1 });
  assert.equal(friction(dir, new Date(Date.UTC(2026, 10, 1))), null, 'nothing in the window');
  cleanup(dir);
});
