// Kaizen — what a feature or a fix costs, end to end.
//
// A cycle (`gate on` → `gate off`) only covers implementation. The ledger covers everything: at the
// end of every turn in a Kaizen repo, the Stop hook (ledger-hook.mjs) reads the tokens added to the
// session's transcripts since its last read (byte offsets, so nothing is counted twice) and charges them
// to the **work item** in progress — brainstorm and plan on the default branch, debug, review, ship,
// PR follow-up alike, gate or not.
//
// The work item, in order: the Jira key of the branch (`feat/SHOP-412-…` → SHOP-412); the plan being
// written or implemented (its `jira:`, otherwise `plan:<topic>`); the branch; otherwise `unattributed`
// — never a guess. Its kind (feature, fix, …) comes from the plan's `type:` or the branch prefix.

import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { changedFiles, defaultBranch, diffBase, docsRoot, emptyUsage, git, parseFrontmatter, readUsage, subagentTranscripts, usageTotal } from './lib.mjs';

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

function readPlan(root, rel) {
  try {
    const data = parseFrontmatter(readFileSync(join(root, rel), 'utf8')).data || {};
    return { path: rel.split(sep).join('/'), jira: data.jira || null, topic: data.topic || null, type: data.type || null, title: data.title || null };
  } catch {
    return null;
  }
}

// The plan this turn works on: the one the gate names, otherwise the most recently modified plan the
// branch (or the working tree, on the default branch) touches.
function currentPlan(root, branch, onDefault) {
  try {
    const gate = JSON.parse(readFileSync(join(root, '.kaizen', 'state', 'gate.json'), 'utf8'));
    if (gate.active && gate.plan) return readPlan(root, gate.plan);
  } catch {}
  let plansDir;
  try {
    plansDir = relative(root, join(docsRoot(root), 'plans')).split(sep).join('/');
  } catch {
    return null;
  }
  const files = changedFiles(root, onDefault ? 'HEAD' : diffBase(root))
    .map((f) => f.split(sep).join('/'))
    .filter((f) => f.startsWith(`${plansDir}/`) && f.endsWith('.md'));
  if (!files.length) return null;
  const latest = files.sort((a, b) => statSync(join(root, b)).mtimeMs - statSync(join(root, a)).mtimeMs)[0];
  return readPlan(root, latest);
}

export function workItem(root) {
  const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD'], { allowFail: true });
  const onDefault = !branch || branch === 'HEAD' || branch === defaultBranch(root);
  const plan = currentPlan(root, branch, onDefault);
  const prefix = onDefault ? null : /^([a-z]+)\//i.exec(branch)?.[1];
  const kind = kindOf(plan?.type) || kindOf(prefix) || 'other';
  const title = plan?.title?.replace(/\s+-\s+Plan$/, '') || null;
  const fromBranch = onDefault ? null : jiraKey(branch);
  if (fromBranch) return { item: fromBranch, kind, title, branch, source: 'branch-jira' };
  if (plan?.jira) return { item: plan.jira, kind, title, branch, source: 'plan-jira' };
  if (plan?.topic) return { item: `plan:${plan.topic}`, kind, title, branch, source: 'plan' };
  if (!onDefault) return { item: `branch:${branch}`, kind, title, branch, source: 'branch' };
  return { item: 'unattributed', kind: 'other', title: null, branch: branch || null, source: 'none' };
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

// One row per work item: tokens, tokens per model, cost (relative units), sessions, turns, span.
export function itemCosts(entries, weights) {
  const weightOf = (m) => weights[m] ?? Math.max(...Object.values(weights));
  const items = new Map();
  for (const e of entries) {
    const it = items.get(e.item) || { item: e.item, kind: e.kind, title: null, sessions: new Set(), turns: 0, tokens: 0, subagent_tokens: 0, models: {}, first: e.at, last: e.at };
    if (e.title) it.title = e.title;
    if (e.kind && e.kind !== 'other') it.kind = e.kind;
    if (e.session) it.sessions.add(e.session);
    it.turns++;
    const main = usageTotal(e.usage);
    const sub = usageTotal(e.subagents?.usage);
    it.tokens += main + sub;
    it.subagent_tokens += sub;
    for (const u of [e.usage, e.subagents?.usage]) for (const [m, mu] of Object.entries(u?.by_model || {})) it.models[m] = (it.models[m] || 0) + usageTotal(mu);
    if (e.at < it.first) it.first = e.at;
    if (e.at > it.last) it.last = e.at;
    items.set(e.item, it);
  }
  return [...items.values()]
    .map((it) => {
      const priced = Object.values(it.models).reduce((a, b) => a + b, 0);
      const cost = Object.entries(it.models).reduce((n, [m, t]) => n + (t / 1e6) * weightOf(m), 0);
      return {
        ...it,
        sessions: it.sessions.size,
        cost: Math.round(cost * 100) / 100,
        // Tokens without a known model (older transcripts) are not priced: the share says how much.
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
