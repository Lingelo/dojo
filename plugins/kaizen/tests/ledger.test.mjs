// Ledger: every turn's tokens charged to the work item in progress — what a feature or a fix costs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PRICES, costByKind, itemCosts, jiraKey, kindOf, pricingOf, readNew, usageCost } from '../scripts/ledger.mjs';
import { PLUGIN, cleanup, cli, gitc, tempRepo, writeFiles } from './helpers.mjs';

const HOOK = join(PLUGIN, 'scripts', 'ledger-hook.mjs');
const msg = (id, model, input, extra = '') => `${JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { id, model, usage: { input_tokens: input, output_tokens: 0 } } })}\n${extra}`;
const stop = (dir, transcript) => spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ cwd: dir, session_id: 'S1', transcript_path: transcript }), encoding: 'utf8' });
const ledger = (dir) => readFileSync(join(dir, '.kaizen', 'state', 'ledger.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('jiraKey and kindOf: from the branch and the plan type', () => {
  assert.equal(jiraKey('feat/SHOP-412-csv-export'), 'SHOP-412');
  assert.equal(jiraKey('SHOP-9'), 'SHOP-9');
  assert.equal(jiraKey('feat/csv-export'), null);
  assert.equal(jiraKey('feat/utf-8-fix'), null, 'lowercase is not a key');
  assert.equal(kindOf('feat'), 'feature');
  assert.equal(kindOf('hotfix'), 'fix');
  assert.equal(kindOf('wip'), null);
});

test('readNew: only complete lines, each message once, offsets carried over', () => {
  const dir = tempRepo({});
  const file = join(dir, 't.jsonl');
  writeFiles(dir, { 't.jsonl': msg('m1', 'claude-opus-5-5', 10) + msg('m1', 'claude-opus-5-5', 10) + '{"partial":' });
  const a = readNew(file, {});
  assert.equal(a.usage.input_tokens, 10, 'blocks of one message counted once, partial line left');
  appendFileSync(file, `"x"}\n${msg('m2', 'claude-sonnet-5-5', 5)}`);
  const b = readNew(file, a.state);
  assert.equal(b.usage.input_tokens, 5);
  assert.deepEqual(Object.keys(b.usage.by_model), ['sonnet']);
  assert.equal(readNew(file, b.state).usage.messages, 0, 'nothing new');
  cleanup(dir);
});

test('Stop hook: default branch unattributed, then a feature branch and a fix branch, subagents', () => {
  const dir = tempRepo({ '.kaizen/config.json': {}, 'app.js': 'a\n' });
  const proj = join(dir, '..', `${dir.split(/[\\/]/).pop()}-proj`);
  mkdirSync(join(proj, 'S1', 'subagents'), { recursive: true });
  const transcript = join(proj, 'S1.jsonl');

  // Nothing identifies the work yet.
  writeFiles(proj, { 'S1.jsonl': msg('a1', 'claude-opus-5-5', 100000) });
  stop(dir, transcript);
  // A feature branch: its Jira key names the item, agent-skills' spec its title.
  gitc(dir, ['checkout', '-qb', 'feat/SHOP-412-export']);
  writeFiles(dir, { 'SPEC.md': '# Spec: CSV export\n' });
  appendFileSync(transcript, msg('a2', 'claude-opus-5-5', 2000000));
  stop(dir, transcript);
  // A fix branch: subagent tokens are charged too.
  gitc(dir, ['add', '-A'], ['commit', '-qm', 'docs: spec'], ['checkout', '-q', 'main'], ['checkout', '-qb', 'fix/SHOP-7-crash']);
  appendFileSync(transcript, msg('a3', 'claude-sonnet-5-5', 50000));
  writeFiles(join(proj, 'S1', 'subagents'), { 'agent-x.jsonl': msg('s1', 'claude-haiku-5-5', 1000000) });
  stop(dir, transcript);
  stop(dir, transcript); // nothing new: no entry

  const entries = ledger(dir);
  assert.deepEqual(entries.map((e) => [e.item, e.kind]), [['unattributed', 'other'], ['SHOP-412', 'feature'], ['SHOP-7', 'fix']]);
  assert.equal(entries[1].title, 'CSV export');
  assert.equal(entries[2].usage.input_tokens, 50000, 'only the new tokens');
  assert.equal(entries[2].subagents.agents, 1);
  assert.equal(entries[2].subagents.usage.input_tokens, 1000000);
  assert.ok(existsSync(join(dir, '.kaizen', 'state', '.gitignore')));

  const items = cli(dir, ['cost', '--json']).json;
  assert.deepEqual(items.items.map((i) => i.item), ['SHOP-412', 'unattributed', 'SHOP-7'], 'by cost: opus 2M input ($8) > opus 100k ($0.40) > sonnet 50k + haiku 1M ($0.10 + $0.10)');
  assert.equal(items.items[2].cost, 0.2);
  assert.deepEqual(items.items[2].cost_by_model, { sonnet: 0.1, haiku: 0.1 });
  assert.equal(items.items[0].unit, '$');
  assert.equal(items.summary.items, 2);
  assert.equal(items.summary.unattributed_share, Math.round((100000 / 3150000) * 100) / 100);
  assert.equal(cli(dir, ['cost', 'shop-7', '--json']).json.tokens, 1050000);
  assert.equal(cli(dir, ['cost', 'current']).json.item, 'SHOP-7');
  assert.notEqual(cli(dir, ['cost', 'NOPE-1']).code, 0);
  assert.match(cli(dir, ['cost']).stdout, /SHOP-412 +feature/);
  assert.match(cli(dir, ['cost']).stdout, /\$ at Anthropic API list prices/);
  // The deprecated weights still work, in relative units, and say so.
  writeFiles(dir, { '.kaizen/config.json': { review: { cost_weights: { opus: 5 } } } });
  assert.equal(cli(dir, ['cost', 'SHOP-412', '--json']).json.cost, 10, 'opus 2M × 5');
  assert.match(cli(dir, ['cost']).stdout, /relative units.*review\.cost_weights is deprecated/);
  cleanup(dir);
  cleanup(proj);
});

test('no ledger outside a Kaizen repo', () => {
  const dir = tempRepo({ 'app.js': 'a\n' });
  writeFiles(dir, { 't.jsonl': msg('a', 'claude-opus-5-5', 1) });
  assert.equal(stop(dir, join(dir, 't.jsonl')).status, 0);
  assert.equal(existsSync(join(dir, '.kaizen')), false);
  cleanup(dir);
});

test('usageCost: every token type at its price — a cache read is not an output token', () => {
  const opus = usageCost({ input_tokens: 1e6, cache_creation_input_tokens: 2e6, cache_creation_1h_input_tokens: 1e6, cache_read_input_tokens: 10e6, output_tokens: 1e6 }, PRICES.opus);
  assert.deepEqual(opus.byType, { input: 4, cache_write: 13, cache_read: 2, output: 20 }, '5 min write $5 + 1 h write $8');
  assert.equal(opus.total, 39);
  const sonnet = usageCost({ input_tokens: 1e6, cache_creation_input_tokens: 2e6, cache_creation_1h_input_tokens: 1e6, cache_read_input_tokens: 10e6, output_tokens: 1e6 }, PRICES.sonnet);
  assert.equal(sonnet.total * 2, opus.total, 'Sonnet 5.5 is half Opus 5.5 for every type');
  assert.equal(usageCost({ input_tokens: 1 }, undefined), null);
});

test('pricingOf: list prices, cost.prices overrides, review.cost_weights as a deprecated alias', () => {
  assert.equal(pricingOf({}).unit, '$');
  assert.equal(pricingOf({}).prices.opus.output, 20);
  const custom = pricingOf({ cost: { prices: { opus: { output: 25 }, other: { input: 1, output: 1 } } } });
  assert.deepEqual(custom.prices.opus, { ...PRICES.opus, output: 25 });
  assert.equal(custom.prices.other.input, 1);
  const legacy = pricingOf({ review: { cost_weights: { opus: 6 } } });
  assert.equal(legacy.unit, 'relative');
  assert.deepEqual(legacy.prices.opus, { input: 6, cache_write: 6, cache_write_1h: 6, cache_read: 6, output: 6 });
  assert.equal(legacy.prices.sonnet.output, 3, 'former defaults for the others');
  assert.match(legacy.deprecated, /deprecated/);
  assert.equal(pricingOf({ review: { cost_weights: { opus: 6 } }, cost: { prices: { opus: { output: 25 } } } }).unit, '$', 'cost.prices wins');
});

test('itemCosts and costByKind: per item, per model and token type, median per kind, unpriced share', () => {
  const e = (item, kind, usage, model) => ({ at: '2026-10-01T00:00:00Z', session: item, item, kind, usage: { ...usage, ...(model ? { by_model: { [model]: usage } } : {}) } });
  const items = itemCosts([
    e('A-1', 'feature', { cache_read_input_tokens: 10e6, output_tokens: 1e5 }, 'opus'),
    e('A-2', 'feature', { input_tokens: 1e6, output_tokens: 1e6 }, 'sonnet'),
    e('A-3', 'fix', { input_tokens: 1e6 }, 'sonnet'),
    e('A-3', 'fix', { input_tokens: 1e6 }),
    e('A-4', 'fix', { input_tokens: 1e6 }, 'other'),
    e('unattributed', 'other', { input_tokens: 9e6 }, 'opus'),
  ]);
  const a1 = items.find((i) => i.item === 'A-1');
  assert.equal(a1.cost, 4, '10M cache reads ($2) + 100k output ($2): the reads are most tokens, not most of the cost');
  assert.deepEqual(a1.cost_by_type, { input: 0, cache_write: 0, cache_read: 2, output: 2 });
  assert.deepEqual(a1.cost_by_model, { opus: 4 });
  assert.equal(items.find((i) => i.item === 'A-2').cost, 12);
  const a3 = items.find((i) => i.item === 'A-3');
  assert.equal(a3.cost, 2);
  assert.equal(a3.priced_share, 0.5);
  const a4 = items.find((i) => i.item === 'A-4');
  assert.deepEqual([a4.cost, a4.priced_share], [0, 0], 'a model without a price is not priced');
  assert.deepEqual(costByKind(items), { feature: { items: 2, cost_median: 8, cost_total: 16 }, fix: { items: 2, cost_median: 1, cost_total: 2 } });
});

test('readNew: the 1-hour cache writes Claude Code reports are kept apart', () => {
  const dir = tempRepo({});
  const line = JSON.stringify({ type: 'assistant', message: { id: 'w', model: 'claude-opus-5-5', usage: { input_tokens: 1, cache_creation_input_tokens: 300, cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 200 }, output_tokens: 2 } } });
  writeFiles(dir, { 't.jsonl': `${line}\n` });
  const { usage } = readNew(join(dir, 't.jsonl'), {});
  assert.equal(usage.cache_creation_input_tokens, 300);
  assert.equal(usage.cache_creation_1h_input_tokens, 200);
  assert.equal(usage.by_model.opus.cache_creation_1h_input_tokens, 200);
  cleanup(dir);
});
