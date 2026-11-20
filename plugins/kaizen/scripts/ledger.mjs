// Kaizen — what a feature or a fix costs, end to end.
//
// At the end of every turn in a Kaizen repo, the Stop hook (ledger-hook.mjs) reads the tokens added to
// the session's transcripts since its last read (byte offsets, so nothing is counted twice) and charges
// them to the **work item** in progress — spec, plan, build, review, ship, PR follow-up alike.
//
// The work item, in order: the Jira key of the branch (`feat/SHOP-412-…` → SHOP-412); the branch
// (`branch:<name>`); otherwise `unattributed` — never a guess. Its kind (feature, fix, …) comes from the
// branch prefix, its title from agent-skills' SPEC.md.

import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultBranch, emptyUsage, git, readUsage, subagentTranscripts, usageTotal } from './lib.mjs';

// What a million tokens cost, per model family and per token type: Anthropic API list prices, in $.
// Source: https://platform.claude.com/docs/en/about-claude/pricing, "Model pricing" (checked 2026-11-20):
// Fable 5.2, Opus 5.5, Sonnet 5.5, Haiku 5.5 (prompts up to 100K tokens; beyond, Haiku costs 5× this).
// A cache read costs 1/20 of an input token on Opus and Sonnet 5.5 and 1/100 of an output token: pricing
// every type alike would make the cost a count of context read again. cache_write is the 5-minute write,
// cache_write_1h the 1-hour one (Claude Code's main conversation on a subscription). `cost.prices` in the
// configuration overrides it, family by family, type by type.
export const PRICES = {
  fable: { input: 8, cache_write: 10, cache_write_1h: 16, cache_read: 0.2, output: 40 },
  opus: { input: 4, cache_write: 5, cache_write_1h: 8, cache_read: 0.2, output: 20 },
  sonnet: { input: 2, cache_write: 2.5, cache_write_1h: 4, cache_read: 0.1, output: 10 },
  haiku: { input: 0.1, cache_write: 0.125, cache_write_1h: 0.2, cache_read: 0.01, output: 0.5 },
};

// Deprecated: the former pricing, one relative weight per family, every token type alike (`review.cost_weights`).
// Still honoured when set and `cost.prices` is not — in relative units, as before, and said so.
export const LEGACY_WEIGHTS = { haiku: 1, sonnet: 3, opus: 5 };

// How to price the ledger for this configuration: list prices ($), or the deprecated weights.
export function pricingOf(config = {}) {
  const prices = config.cost?.prices || {};
  const weights = config.review?.cost_weights || {};
  if (Object.keys(weights).length && !Object.keys(prices).length) {
    const flat = Object.fromEntries(Object.entries({ ...LEGACY_WEIGHTS, ...weights }).map(([m, w]) => [m, { input: w, cache_write: w, cache_write_1h: w, cache_read: w, output: w }]));
    return { unit: 'relative', prices: flat, deprecated: 'review.cost_weights is deprecated: every token type weighted alike — set cost.prices ($ per million tokens per type) or remove it for list prices' };
  }
  const merged = { ...PRICES };
  for (const [m, row] of Object.entries(prices)) merged[m] = { ...(PRICES[m] || {}), ...row };
  return { unit: '$', prices: merged, deprecated: null };
}

// Cost of a usage ({ input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens,
// cache_creation_1h_input_tokens }) at a family's prices, split by token type. Null for an unknown family.
export function usageCost(usage, row) {
  if (!row || !usage) return null;
  const n = (k) => Number(usage[k]) || 0;
  const write1h = Math.min(n('cache_creation_1h_input_tokens'), n('cache_creation_input_tokens'));
  const price = (k) => Number(row[k]) || 0;
  const byType = {
    input: (n('input_tokens') * price('input')) / 1e6,
    cache_write: ((n('cache_creation_input_tokens') - write1h) * price('cache_write') + write1h * (price('cache_write_1h') || price('cache_write'))) / 1e6,
    cache_read: (n('cache_read_input_tokens') * price('cache_read')) / 1e6,
    output: (n('output_tokens') * price('output')) / 1e6,
  };
  return { total: Object.values(byType).reduce((a, b) => a + b, 0), byType };
}
import { readAgentSkills } from './agentskills.mjs';

export const LEDGER = join('.kaizen', 'state', 'ledger.jsonl');
const CURSOR = join('.kaizen', 'state', 'ledger-cursor.json');
// Message ids kept per transcript: the blocks of one message share its id and usage.
const KEEP_IDS = 200;

const JIRA = /(?:^|[/_-])([A-Z][A-Z0-9]+-\d+)(?=$|[/_-])/;
const KINDS = { feat: 'feature', feature: 'feature', fix: 'fix', bugfix: 'fix', hotfix: 'fix', bug: 'fix', refactor: 'refactor', perf: 'perf', docs: 'docs', chore: 'chore', spike: 'spike' };

export function jiraKey(branch) {
  return JIRA.exec(String(branch || ''))?.[1] || null;
}

export function kindOf(type) {
  return KINDS[String(type || '').toLowerCase()] || null;
}

export function workItem(root) {
  const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD'], { allowFail: true });
  const onDefault = !branch || branch === 'HEAD' || branch === defaultBranch(root);
  if (onDefault) return { item: 'unattributed', kind: 'other', title: null, branch: branch || null, source: 'none' };
  const kind = kindOf(/^([a-z]+)\//i.exec(branch)?.[1]) || 'other';
  const title = readAgentSkills(root).spec?.title || null;
  const key = jiraKey(branch);
  return key ? { item: key, kind, title, branch, source: 'branch-jira' } : { item: `branch:${branch}`, kind, title, branch, source: 'branch' };
}

// Tokens appended to a transcript since `state` ({ offset, ids }), up to its last complete line.
export function readNew(file, state = {}) {
  let fd;
  try {
    fd = openSync(file, 'r');
  } catch {
    return null;
  }
  try {
    const size = fstatSync(fd).size;
    let offset = Number(state.offset) || 0;
    if (offset > size) offset = 0; // rewritten transcript
    const buf = Buffer.alloc(size - offset);
    if (buf.length) readSync(fd, buf, 0, buf.length, offset);
    const end = buf.lastIndexOf(0x0a) + 1;
    const seen = new Set(state.ids || []);
    const before = seen.size;
    const usage = readUsage(buf.subarray(0, end).toString('utf8'), 0, seen, emptyUsage());
    const ids = [...seen].slice(-KEEP_IDS);
    return { usage, state: { offset: offset + end, ids }, added: seen.size - before };
  } finally {
    closeSync(fd);
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function addInto(into, u) {
  for (const k of ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'messages']) into[k] = (into[k] || 0) + (Number(u[k]) || 0);
  if (Number(u.cache_creation_1h_input_tokens)) into.cache_creation_1h_input_tokens = (into.cache_creation_1h_input_tokens || 0) + Number(u.cache_creation_1h_input_tokens);
  for (const [m, mu] of Object.entries(u.by_model || {})) {
    into.by_model ||= {};
    into.by_model[m] = addInto(into.by_model[m] || {}, mu);
  }
  return into;
}

// Stop hook: charge the turn's new tokens (main session + subagents) to the work item.
export function account(root, { session_id: session = null, transcript_path: transcript } = {}) {
  if (!transcript || !existsSync(join(root, '.kaizen', 'config.json'))) return null;
  const dir = join(root, '.kaizen', 'state');
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, '.gitignore'))) writeFileSync(join(dir, '.gitignore'), '*\n');
  const cursorFile = join(root, CURSOR);
  const cursor = readJson(cursorFile, {});
  const main = readNew(transcript, cursor[transcript]);
  if (!main) return null;
  cursor[transcript] = main.state;
  const sub = emptyUsage();
  let agents = 0;
  for (const path of subagentTranscripts(transcript)) {
    const r = readNew(path, cursor[path]);
    if (!r) continue;
    cursor[path] = r.state;
    if (r.usage.messages) {
      agents++;
      addInto(sub, r.usage);
    }
  }
  writeFileSync(cursorFile, `${JSON.stringify(cursor)}\n`);
  if (!main.usage.messages && !sub.messages) return null;
  const entry = { at: new Date().toISOString(), session, ...workItem(root), usage: main.usage, subagents: { agents, usage: sub } };
  writeFileSync(join(root, LEDGER), `${JSON.stringify(entry)}\n`, { flag: 'a' });
  return entry;
}

export function readLedger(root) {
  let lines = [];
  try {
    lines = readFileSync(join(root, LEDGER), 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
  return lines
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((e) => e && e.item && !Number.isNaN(Date.parse(e.at)));
}

// One row per work item: tokens, tokens per model, cost (pricingOf: $ at list prices, or the deprecated
// relative units) per model and per token type, sessions, turns, span.
export function itemCosts(entries, pricing = pricingOf()) {
  const items = new Map();
  const round = (x) => Math.round(x * 100) / 100;
  for (const e of entries) {
    const it = items.get(e.item) || { item: e.item, kind: e.kind, title: null, sessions: new Set(), turns: 0, tokens: 0, subagent_tokens: 0, models: {}, usage: {}, first: e.at, last: e.at };
    if (e.title) it.title = e.title;
    if (e.kind && e.kind !== 'other') it.kind = e.kind;
    if (e.session) it.sessions.add(e.session);
    it.turns++;
    const main = usageTotal(e.usage);
    const sub = usageTotal(e.subagents?.usage);
    it.tokens += main + sub;
    it.subagent_tokens += sub;
    for (const u of [e.usage, e.subagents?.usage]) {
      for (const [m, mu] of Object.entries(u?.by_model || {})) {
        it.models[m] = (it.models[m] || 0) + usageTotal(mu);
        it.usage[m] = addInto(it.usage[m] || {}, mu);
      }
    }
    if (e.at < it.first) it.first = e.at;
    if (e.at > it.last) it.last = e.at;
    items.set(e.item, it);
  }
  return [...items.values()]
    .map(({ usage, ...it }) => {
      let priced = 0;
      let cost = 0;
      const costByModel = {};
      const costByType = { input: 0, cache_write: 0, cache_read: 0, output: 0 };
      for (const [m, u] of Object.entries(usage)) {
        const c = usageCost(u, pricing.prices[m]);
        if (!c) continue; // a model family without a price is not priced
        priced += usageTotal(u);
        cost += c.total;
        costByModel[m] = round(c.total);
        for (const [k, v] of Object.entries(c.byType)) costByType[k] += v;
      }
      return {
        ...it,
        sessions: it.sessions.size,
        cost: round(cost),
        unit: pricing.unit,
        cost_by_model: costByModel,
        cost_by_type: Object.fromEntries(Object.entries(costByType).map(([k, v]) => [k, round(v)])),
        // Tokens without a known, priced model (older transcripts) are not priced: the share says how much.
        priced_share: it.tokens ? Math.round((priced / it.tokens) * 100) / 100 : null,
      };
    })
    .sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);
}

// Median cost per kind, attributed items only: what a feature or a fix usually costs here.
export function costByKind(items) {
  const by = {};
  for (const it of items.filter((x) => x.item !== 'unattributed')) (by[it.kind] ||= []).push(it.cost);
  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  return Object.fromEntries(Object.entries(by).map(([k, xs]) => [k, { items: xs.length, cost_median: Math.round(median(xs) * 100) / 100, cost_total: Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100 }]));
}
