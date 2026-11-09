// Cost dashboard: ledger rows per work item and day, and a self-contained, injection-safe page.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { ledgerRows, renderDashboard } from '../scripts/dashboard.mjs';
import { modelFamily } from '../scripts/lib.mjs';
import { cleanup, cli, tempRepo, writeFiles } from './helpers.mjs';

const u = (n, by_model) => ({ input_tokens: n, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, messages: 1, ...(by_model ? { by_model } : {}) });

test('modelFamily: family from the transcript model id', () => {
  assert.equal(modelFamily('claude-opus-5-5'), 'opus');
  assert.equal(modelFamily('claude-haiku-5-5-20261001'), 'haiku');
  assert.equal(modelFamily(undefined), 'other');
});

test('ledgerRows: turns folded per work item and day, tokens per model', () => {
  const rows = ledgerRows([
    { at: '2026-10-01T10:00:00Z', item: 'SHOP-1', kind: 'feature', title: 'Export', usage: u(100, { opus: u(100) }), subagents: { usage: u(50, { sonnet: u(50) }) } },
    { at: '2026-10-01T11:00:00Z', item: 'SHOP-1', kind: 'other', usage: u(10, { opus: u(10) }) },
    { at: '2026-10-02T09:00:00Z', item: 'SHOP-1', kind: 'feature', usage: u(1) },
  ]);
  assert.equal(rows.length, 2, 'one row per item and day');
  assert.deepEqual([rows[0].day, rows[0].kind, rows[0].title, rows[0].tokens], ['2026-10-01', 'feature', 'Export', 160]);
  assert.deepEqual(rows[0].models, { opus: 110, sonnet: 50 });
});

test('renderDashboard: one page, no external resource, data cannot close the script tag', () => {
  const html = renderDashboard({ repo: 'shop', items: ledgerRows([{ at: '2026-10-01T10:00:00Z', item: '</script><img src=x onerror=alert(1)>', usage: u(1) }]), weights: { opus: 5 } });
  assert.match(html, /^<!doctype html>/);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|https?:\/\/(?!www\.w3\.org)/, 'self-contained');
  assert.equal(html.match(/<\/script>/g).length, 2, 'only the two real script tags close');
  assert.match(html, /\\u003c\/script>\\u003cimg/);
});

test('CLI metrics dashboard: writes the page under .kaizen/state or --out', () => {
  const dir = tempRepo({ '.kaizen/config.json': { review: { cost_weights: { opus: 15 } } }, 'x': 'x' });
  writeFiles(dir, { '.kaizen/state/ledger.jsonl': `${JSON.stringify({ at: new Date().toISOString(), item: 'SHOP-2', kind: 'fix', usage: u(2_000_000, { opus: u(2_000_000) }) })}\nnot json\n` });
  const r = cli(dir, ['metrics', 'dashboard']).json;
  assert.equal(r.friction_events, 0);
  assert.equal(r.ledger_rows, 1);
  assert.ok(!('cycles' in r));
  assert.ok(r.file.endsWith(join('.kaizen', 'state', 'cost-dashboard.html')));
  assert.match(readFileSync(r.file, 'utf8'), /"opus":15/, 'team weights embedded');
  cli(dir, ['metrics', 'dashboard', '--out', 'reports/cost.html']);
  assert.ok(existsSync(join(dir, 'reports', 'cost.html')));
  cleanup(dir);
});
