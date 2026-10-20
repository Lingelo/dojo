// Cost dashboard: rows per cycle (role groups, models, cost) and a self-contained, injection-safe page.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { cycleRows, renderDashboard } from '../scripts/dashboard.mjs';
import { modelFamily } from '../scripts/lib.mjs';
import { cleanup, cli, tempRepo, writeFiles } from './helpers.mjs';

const u = (n, by_model) => ({ input_tokens: n, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, messages: 1, ...(by_model ? { by_model } : {}) });

test('modelFamily: family from the transcript model id', () => {
  assert.equal(modelFamily('claude-opus-5-5'), 'opus');
  assert.equal(modelFamily('claude-haiku-5-5-20261001'), 'haiku');
  assert.equal(modelFamily(undefined), 'other');
});

test('cycleRows: roles folded into groups, tokens per model, cost only when models are known', () => {
  const rows = cycleRows([
    { ended: '2026-10-02T10:00:00Z', plan: 'p2', usage: u(100), subagents: { agents: 1, usage: u(50), by_role: { research: u(50) } } },
    {
      ended: '2026-10-01T10:00:00Z', plan: 'p1', minutes: 30, gate_blocks: 2,
      usage: u(1_000_000, { opus: u(1_000_000) }),
      subagents: { agents: 3, usage: u(3_000_000, { sonnet: u(3_000_000) }), by_role: { review: u(1_000_000), review_critical: u(1_000_000), unknown: u(1_000_000) } },
    },
  ]);
  assert.deepEqual(rows.map((r) => r.plan), ['p1', 'p2'], 'sorted by end date');
  assert.deepEqual(rows[0].groups, { main: 1_000_000, implement: 0, research: 0, review: 2_000_000, plan_review: 0, other: 1_000_000 });
  assert.equal(rows[0].tokens, 4_000_000);
  assert.deepEqual(rows[0].models, { opus: 1_000_000, sonnet: 3_000_000 });
  assert.equal(rows[0].cost, 5 + 9, 'opus 1M × 5 + sonnet 3M × 3');
  assert.equal(rows[1].cost, null, 'no tokens per model: not priced');
});

test('renderDashboard: one page, no external resource, data cannot close the script tag', () => {
  const html = renderDashboard({ repo: 'shop', rows: cycleRows([{ ended: '2026-10-01T10:00:00Z', plan: '</script><img src=x onerror=alert(1)>', usage: u(1) }]), weights: { opus: 5 } });
  assert.match(html, /^<!doctype html>/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|https?:\/\/(?!www\.w3\.org)/, 'self-contained');
  assert.equal(html.match(/<\/script>/g).length, 2, 'only the two real script tags close');
  assert.match(html, /\\u003c\/script>\\u003cimg/);
});

test('CLI metrics dashboard: writes the page under .kaizen/state or --out', () => {
  const dir = tempRepo({ '.kaizen/config.json': { review: { cost_weights: { opus: 15 } } }, 'x': 'x' });
  writeFiles(dir, { '.kaizen/state/cycles.jsonl': `${JSON.stringify({ ended: new Date().toISOString(), usage: u(2_000_000, { opus: u(2_000_000) }) })}\nnot json\n` });
  const r = cli(dir, ['metrics', 'dashboard']).json;
  assert.equal(r.cycles, 1);
  assert.equal(r.priced, 1);
  assert.ok(r.file.endsWith(join('.kaizen', 'state', 'cost-dashboard.html')));
  assert.match(readFileSync(r.file, 'utf8'), /"opus":15/, 'team weights embedded');
  cli(dir, ['metrics', 'dashboard', '--out', 'reports/cost.html']);
  assert.ok(existsSync(join(dir, 'reports', 'cost.html')));
  cleanup(dir);
});
