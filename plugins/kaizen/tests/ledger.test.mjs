// Ledger: every turn's tokens charged to the work item in progress — what a feature or a fix costs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { costByKind, itemCosts, jiraKey, kindOf, readNew } from '../scripts/ledger.mjs';
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

test('Stop hook: plan on the default branch, then its fix branch, subagents, unattributed', () => {
  const dir = tempRepo({ '.kaizen/config.json': {}, 'app.js': 'a\n' });
  const proj = join(dir, '..', `${dir.split(/[\\/]/).pop()}-proj`);
  mkdirSync(join(proj, 'S1', 'subagents'), { recursive: true });
  const transcript = join(proj, 'S1.jsonl');

  // Nothing identifies the work yet.
  writeFiles(proj, { 'S1.jsonl': msg('a1', 'claude-opus-5-5', 100000) });
  stop(dir, transcript);
  // A plan is being written on the default branch: its jira key names the item.
  writeFiles(dir, { 'docs/plans/2026-10-20-export.md': '---\ntitle: CSV export - Plan\ntype: feat\ntopic: csv-export\njira: SHOP-412\n---\n# CSV export - Plan\n' });
  appendFileSync(transcript, msg('a2', 'claude-opus-5-5', 2000000));
  stop(dir, transcript);
  // A fix branch: the branch key wins; subagent tokens are charged too.
  gitc(dir, ['add', '-A'], ['commit', '-qm', 'docs: plan'], ['checkout', '-qb', 'fix/SHOP-7-crash']);
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
  assert.deepEqual(items.items.map((i) => i.item), ['SHOP-412', 'SHOP-7', 'unattributed'], 'by cost: opus 2M (10) > sonnet 50k + haiku 1M (1.15) > opus 100k (0.5)');
  assert.equal(items.summary.items, 2);
  assert.equal(items.summary.unattributed_share, Math.round((100000 / 3150000) * 100) / 100);
  assert.equal(cli(dir, ['cost', 'shop-7', '--json']).json.tokens, 1050000);
  assert.equal(cli(dir, ['cost', 'current']).json.item, 'SHOP-7');
  assert.notEqual(cli(dir, ['cost', 'NOPE-1']).code, 0);
  assert.match(cli(dir, ['cost']).stdout, /SHOP-412 +feature/);
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

test('itemCosts and costByKind: per item, median per kind, unpriced share', () => {
  const e = (item, kind, tokens, model) => ({ at: '2026-10-01T00:00:00Z', session: item, item, kind, usage: { input_tokens: tokens, ...(model ? { by_model: { [model]: { input_tokens: tokens } } } : {}) } });
  const items = itemCosts([e('A-1', 'feature', 1e6, 'opus'), e('A-2', 'feature', 3e6, 'sonnet'), e('A-3', 'fix', 1e6, 'sonnet'), e('A-3', 'fix', 1e6), e('unattributed', 'other', 9e6, 'opus')], { opus: 5, sonnet: 3 });
  const a3 = items.find((i) => i.item === 'A-3');
  assert.equal(a3.cost, 3);
  assert.equal(a3.priced_share, 0.5);
  assert.deepEqual(costByKind(items), { feature: { items: 2, cost_median: 7, cost_total: 14 }, fix: { items: 1, cost_median: 3, cost_total: 3 } });
});
