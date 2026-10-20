// Review estimate: tokens and relative cost of a selection of reviewers, before launching them.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BASE_TOKENS, MIN_HISTORY_AGENTS, TOKENS_PER_LINE } from '../scripts/estimate.mjs';
import { cleanup, cli, gitc, tempRepo, writeFiles } from './helpers.mjs';

const lines = (n) => `${Array.from({ length: n }, (_, i) => `line ${i}`).join('\n')}\n`;

test('review estimate: heuristic on the diff (new files included), models of the profile, cost per model', () => {
  const dir = tempRepo({ '.kaizen/config.json': { profile: 'product' }, 'src/a.ts': lines(10) });
  gitc(dir, ['checkout', '-qb', 'feat/x']);
  writeFiles(dir, { 'src/a.ts': lines(30), 'src/b.ts': lines(20) });
  const e = cli(dir, ['review', 'estimate', '--reviewers', 'correctness,security,kaizen:adversarial-reviewer,bogus', '--json']).json;
  assert.equal(e.source, 'heuristic');
  assert.equal(e.lines, 40, '20 tracked + 20 in a new file');
  const per = BASE_TOKENS + TOKENS_PER_LINE * 40;
  assert.deepEqual(e.reviewers.map((r) => [r.name, r.model, r.tokens]), [
    ['correctness-reviewer', 'sonnet', per],
    ['security-reviewer', 'opus', per],
    ['adversarial-reviewer', 'opus', per],
  ]);
  assert.deepEqual(e.unknown, ['bogus']);
  assert.equal(e.by_model.opus.reviewers, 2);
  assert.equal(e.cost, Math.round(((per / 1e6) * 3 + (per / 1e6) * 5 * 2) * 100) / 100);
  assert.equal(e.confirm, false, 'never asks by default');

  const cheap = cli(dir, ['review', 'estimate', '--reviewers', 'correctness,security', '--profile', 'prototype', '--json']).json;
  assert.ok(cheap.reviewers.every((r) => r.model === 'sonnet'), 'the cycle profile sets the models');
  assert.ok(cheap.cost < e.cost);
  assert.notEqual(cli(dir, ['review', 'estimate']).code, 0, 'reviewers required');
  cleanup(dir);
});

test('review estimate: weights and confirmation threshold from the config, history once there is enough', () => {
  const dir = tempRepo({ '.kaizen/config.json': { review: { cost_weights: { opus: 15 }, confirm_above_cost: 0.5 } }, 'x.ts': 'x\n' });
  gitc(dir, ['checkout', '-qb', 'feat/x']);
  let e = cli(dir, ['review', 'estimate', '--reviewers', 'security', '--json']).json;
  assert.equal(e.weights.opus, 15);
  assert.equal(e.confirm, true);
  assert.match(cli(dir, ['review', 'estimate', '--reviewers', 'security']).stdout, /ask before launching/);

  const cycle = (agents, tokens) => JSON.stringify({ ended: new Date().toISOString(), subagents: { by_role: { review: { input_tokens: tokens, agents }, research: { input_tokens: 999999, agents: 1 } } } });
  writeFiles(dir, { '.kaizen/state/cycles.jsonl': `${cycle(2, 200000)}\n` });
  e = cli(dir, ['review', 'estimate', '--reviewers', 'security', '--json']).json;
  assert.equal(e.source, 'heuristic', `fewer than ${MIN_HISTORY_AGENTS} agents`);
  assert.match(e.method, /history: 2\/5/);
  writeFiles(dir, { '.kaizen/state/cycles.jsonl': `${cycle(2, 200000)}\nnot json\n${cycle(4, 200000)}\n` });
  e = cli(dir, ['review', 'estimate', '--reviewers', 'security', '--json']).json;
  assert.equal(e.source, 'history');
  assert.equal(e.reviewers[0].tokens, Math.round(400000 / 6), 'research agents are not review agents');
  cleanup(dir);
});
