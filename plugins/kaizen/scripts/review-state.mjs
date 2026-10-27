// Kaizen — review state per branch, read by the PreToolUse hook that guards `git push`.
//
// A review records the tree it actually read (committed + uncommitted). At push time, that tree is
// compared to HEAD: beyond `review.max_unreviewed_lines` lines changed since, the push waits for a
// new review.
//
// What does not rely on the agent's word:
// - **Review evidence.** The PostToolUse hook on the Agent tool logs every Kaizen code reviewer
//   actually launched (`review-evidence.json`). `review record` requires at least one reviewer
//   launched since the branch's previous review — except for a light review (branch diff ≤
//   LIGHT_MAX_LINES), which the skill does without subagents, and except for an update after fixes
//   (≤ max_unreviewed_lines since the reviewed tree, reviewers carried over from the previous review).
// - **Human waiver.** `review waive` only creates a pending request, with a code. Only a user message
//   containing `kaizen waive <code>` (UserPromptSubmit hook) confirms it.
//
// Accepted limit: these gates stop forgetfulness and drift, not an agent set on bypassing them
// (the PreToolUse hook does refuse direct writes to these state files).

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { changedLines, defaultBranch, diffBase, git, loadConfig, logFriction, worktreeTree } from './lib.mjs';

export const VERDICTS = ['ready', 'concerns', 'blocked'];
// Verdict names used before Kaizen 3.0, still accepted.
const VERDICT_ALIASES = { reserves: 'concerns' };
export const LIGHT_MAX_LINES = 20;
const EVIDENCE_MAX_AGE_MS = 12 * 3600 * 1000;
const WAIVER_MAX_AGE_MS = 30 * 60 * 1000;
// State files only the CLI and the hooks write (the PreToolUse hook refuses direct writes).
export const PROTECTED_STATE = ['reviews.json', 'review-evidence.json', 'waivers.json', 'hooks-seen.json', 'review-launches.json'];

function stateDir(root) {
  const dir = join(root, '.kaizen', 'state');
  mkdirSync(dir, { recursive: true });
  const gi = join(dir, '.gitignore');
  if (!existsSync(gi)) writeFileSync(gi, '*\n');
  return dir;
}

function readJson(root, name, fallback) {
  try {
    return JSON.parse(readFileSync(join(stateDir(root), name), 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(root, name, value) {
  writeFileSync(join(stateDir(root), name), `${JSON.stringify(value, null, 2)}\n`);
}

export function currentBranch(root) {
  const b = git(root, ['rev-parse', '--abbrev-ref', 'HEAD'], { allowFail: true });
  return b && b !== 'HEAD' ? b : null;
}

// Merge base of `ref` with the default branch (diffBase is HEAD's).
function baseOf(root, ref) {
  if (ref === 'HEAD') return diffBase(root);
  const def = defaultBranch(root);
  if (!def) return null;
  for (const b of [`origin/${def}`, def]) {
    const mb = git(root, ['merge-base', ref, b], { allowFail: true });
    if (mb) return mb;
  }
  return null;
}

function branchLines(root, config, ref = 'HEAD') {
  const base = baseOf(root, ref);
  return base ? changedLines(root, base, ref, config.pr.ignore) ?? 0 : 0;
}

function snapshot(root, branch) {
  return { branch, head: git(root, ['rev-parse', 'HEAD']), tree: worktreeTree(root) };
}

// --- Evidence: reviewers actually launched ---------------------------------------------------------

// Kaizen code reviewer in an Agent tool call: `kaizen:<name>-reviewer` (excluding plan reviewers), or
// `general-purpose` with the review skill's prompt (fallback provided for by the conventions).
export function reviewerOf(toolInput = {}) {
  const type = String(toolInput.subagent_type || '');
  const m = /^kaizen:([a-z-]+-reviewer)$/.exec(type);
  if (m) return m[1].startsWith('plan-') ? null : m[1];
  const prompt = String(toolInput.prompt || '');
  if (prompt.includes('<review-context>') || prompt.includes('<contexte-de-revue>')) {
    const r = /(?:Reviewer|Relecteur)\s*:\s*(?:kaizen:)?([a-z-]+)/.exec(prompt);
    if (r && !r[1].startsWith('plan-')) return r[1].endsWith('-reviewer') ? r[1] : `${r[1]}-reviewer`;
  }
  return null;
}

export function addEvidence(root, { reviewer, session = null, model = null }) {
  const now = Date.now();
  const list = readJson(root, 'review-evidence.json', []).filter((e) => now - Date.parse(e.at) < EVIDENCE_MAX_AGE_MS);
  list.push({ reviewer, model, session, at: new Date(now).toISOString() });
  writeJson(root, 'review-evidence.json', list);
}

// Launches (PreToolUse on Agent): a reviewer that dies (rate limit, error) never reaches PostToolUse,
// so only the launch log knows it was expected. Its prompt may name a slice ("Slice: S2") and the run
// folder ("Run: <dir>").
export function addLaunch(root, toolInput = {}, { session = null } = {}) {
  const reviewer = reviewerOf(toolInput);
  if (!reviewer) return null;
  const prompt = String(toolInput.prompt || '');
  const slice = /^\s*Slice\s*:\s*(S\d+)\b/m.exec(prompt)?.[1] || null;
  const run = /^\s*Run\s*:\s*(\S+)/m.exec(prompt)?.[1] || null;
  const now = Date.now();
  const list = readJson(root, 'review-launches.json', []).filter((e) => now - Date.parse(e.at) < EVIDENCE_MAX_AGE_MS);
  const entry = { reviewer, slice, run, branch: currentBranch(root), session, at: new Date(now).toISOString() };
  list.push(entry);
  writeJson(root, 'review-launches.json', list);
  return entry;
}

const outputName = (l) => `${l.reviewer.replace(/-reviewer$/, '')}${l.slice ? `-${l.slice}` : ''}`;

// Reviewers launched by /kaizen:review on `branch` since `since` with no valid output in the run folder
// their own prompt named (`<run>/<name>[-<slice>].json` holding the contract's `findings` array) —
// never a folder the caller picks. Launches without a `Run:` line (an ad-hoc reviewer outside a review)
// are not part of a run.
export function missingOutputs(root, branch, since) {
  const from = Math.max(since ? Date.parse(since) : 0, Date.now() - EVIDENCE_MAX_AGE_MS);
  const launches = readJson(root, 'review-launches.json', []).filter((l) => l.run && l.branch === branch && Date.parse(l.at) > from);
  const missing = new Set();
  for (const l of launches) {
    const name = outputName(l);
    const dir = resolve(root, l.run);
    const ok = [`${name}.json`, `${l.reviewer}${l.slice ? `-${l.slice}` : ''}.json`].some((f) => {
      try {
        return Array.isArray(JSON.parse(readFileSync(join(dir, f), 'utf8')).findings);
      } catch {
        return false;
      }
    });
    if (!ok) missing.add(name);
  }
  return { launched: launches.length, runs: [...new Set(launches.map((l) => l.run))], missing: [...missing].sort() };
}

function evidenceSince(root, since) {
  const from = Math.max(since ? Date.parse(since) : 0, Date.now() - EVIDENCE_MAX_AGE_MS);
  return readJson(root, 'review-evidence.json', []).filter((e) => Date.parse(e.at) > from);
}

// --- Recording a review ----------------------------------------------------------------------------

export function recordReview(root, { verdict, run = null, allowMissing = [] } = {}) {
  verdict = VERDICT_ALIASES[verdict] || verdict;
  const branch = currentBranch(root);
  if (!branch) throw new Error('detached HEAD: a review is recorded on a branch');
  if (!VERDICTS.includes(verdict)) throw new Error(`--verdict expected: ${VERDICTS.join(' | ')}`);
  const config = loadConfig(root);
  const state = readJson(root, 'reviews.json', {});
  const previous = state[branch];
  // Every reviewer launched for this branch since its last record left its output — or the user accepts
  // the gap.
  const { runs, missing: gaps } = missingOutputs(root, branch, previous?.at);
  const unaccepted = gaps.filter((m) => !allowMissing.includes(m));
  if (unaccepted.length) {
    throw new Error(
      `launched reviewer(s) without a valid output in ${runs.join(', ')}: ${unaccepted.join(', ')} — resume or relaunch them ` +
        '(their JSON saved as <name>[-<slice>].json in that run folder); if the user accepts the gap: --allow-missing <names>',
    );
  }
  const evidence = evidenceSince(root, previous?.at);
  const reviewers = [...new Set(evidence.map((e) => e.reviewer))].sort();
  // Model actually requested for each reviewer (`model` parameter of the Agent call, otherwise the one
  // from the agent's definition).
  const models = Object.fromEntries(evidence.map((e) => [e.reviewer, e.model || 'agent default']));
  const lines = branchLines(root, config);
  // Update after the review's own fixes: without a new reviewer, only if what changed since the
  // reviewed tree stays under the unreviewed-lines ceiling.
  const tree = worktreeTree(root);
  const sincePrevious = previous && previous.verdict !== 'waived' ? changedLines(root, previous.tree, tree, config.pr.ignore) : null;
  const max = Number(config.review.max_unreviewed_lines ?? 80);
  if (!reviewers.length && sincePrevious !== null && sincePrevious <= max) {
    const entry = { ...snapshot(root, branch), verdict, depth: 'update', reviewers: previous.reviewers || [], run: run || previous.run || null, updated_lines: sincePrevious, at: new Date().toISOString() };
    state[branch] = entry;
    writeJson(root, 'reviews.json', state);
    logFriction(root, { gate: 'push', kind: 'review_recorded', depth: 'update', branch });
    return entry;
  }
  if (!reviewers.length && lines > LIGHT_MAX_LINES) {
    throw new Error(
      `no Kaizen reviewer launched since the last review of ${branch} (${lines} lines on the branch, ` +
        `light review only up to ${LIGHT_MAX_LINES}): run /kaizen:review, which runs the reviewers, before recording`,
    );
  }
  const entry = { ...snapshot(root, branch), verdict, depth: reviewers.length ? 'agents' : 'light', reviewers, models, run, at: new Date().toISOString() };
  // A gap is the user's call, never the agent's: it goes through the same typed code as a waiver.
  if (gaps.length) return requestWaiver(root, { reason: `review recorded without ${gaps.join(', ')}`, gap: { ...entry, gaps } });
  state[branch] = entry;
  writeJson(root, 'reviews.json', state);
  logFriction(root, { gate: 'push', kind: 'review_recorded', depth: entry.depth, branch });
  return entry;
}

// --- Waiver: requested by the agent, confirmed by the user ----------------------------------------

export function requestWaiver(root, { reason, gap = null }) {
  const branch = currentBranch(root);
  if (!branch) throw new Error('detached HEAD: a waiver applies to a branch');
  if (!reason) throw new Error('review waive requires --reason "<the user\'s request>"');
  const code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
  const now = Date.now();
  const pending = readJson(root, 'waivers.json', []).filter((w) => now - Date.parse(w.at) < WAIVER_MAX_AGE_MS && w.branch !== branch);
  pending.push({ code, reason, ...snapshot(root, branch), ...(gap ? { kind: 'gap', review: gap } : {}), at: new Date(now).toISOString() });
  writeJson(root, 'waivers.json', pending);
  logFriction(root, { gate: 'push', kind: 'waiver_requested', gap: Boolean(gap), branch });
  return {
    pending: true,
    branch,
    code,
    expires_in_minutes: WAIVER_MAX_AGE_MS / 60000,
    instruction: `Ask the user to type it themselves: kaizen waive ${code}`,
  };
}

// Called by the UserPromptSubmit hook: only a user message reaches this path.
export function confirmWaiver(root, code, { session = null } = {}) {
  const now = Date.now();
  const pending = readJson(root, 'waivers.json', []);
  const w = pending.find((x) => x.code === String(code).toUpperCase() && now - Date.parse(x.at) < WAIVER_MAX_AGE_MS);
  if (!w) return null;
  const state = readJson(root, 'reviews.json', {});
  const entry = w.kind === 'gap' ? { ...w.review, confirmed_by: 'user (message)', session, at: new Date(now).toISOString() } : {
    branch: w.branch,
    head: w.head,
    tree: w.tree,
    verdict: 'waived',
    reason: w.reason,
    reviewers: [],
    confirmed_by: 'user (message)',
    session,
    at: new Date(now).toISOString(),
  };
  state[w.branch] = entry;
  writeJson(root, 'reviews.json', state);
  writeJson(root, 'waivers.json', pending.filter((x) => x !== w));
  logFriction(root, { gate: 'push', kind: 'waiver_confirmed', gap: w.kind === 'gap', branch: w.branch });
  return entry;
}

// --- Heartbeat: proof that Claude Code runs Kaizen's hooks here -----------------------------------

export function recordHeartbeat(root, { session = null, source = null } = {}) {
  writeJson(root, 'hooks-seen.json', { at: new Date().toISOString(), session, source });
}

// --- Decision at push time ---------------------------------------------------------------------------

// Decides whether a branch state may be pushed: the current branch at HEAD by default, or the
// `branch` and commit `sha` a git pre-push hook received. Always { allowed, reason, ... }.
export function checkPush(root, config = loadConfig(root), opts = {}) {
  const res = decidePush(root, config, opts);
  // `ask`: an unreviewed push is the user's call (Claude Code prompt), not a refusal to act on alone.
  if (!res.allowed && config.review.require_before_push === 'ask') res.ask = true;
  return res;
}

function decidePush(root, config, { branch = null, sha = null } = {}) {
  if (config.review.require_before_push === false) return { allowed: true, reason: 'review.require_before_push disabled' };
  branch = branch || currentBranch(root);
  const ref = sha || 'HEAD';
  if (!branch) return { allowed: true, reason: 'detached HEAD' };
  if (branch === defaultBranch(root)) return { allowed: true, reason: 'default branch (guarded by the git plugin)' };
  if (!baseOf(root, ref)) return { allowed: true, reason: 'base not found' };
  const lines = branchLines(root, config, ref);
  if (!lines) return { allowed: true, reason: 'no code change on the branch' };

  const max = Number(config.review.max_unreviewed_lines ?? 80);
  const rec = readJson(root, 'reviews.json', {})[branch];
  if (!rec) return { allowed: false, branch, reason: 'no review recorded for this branch', branch_lines: lines };
  // Only what is pushed counts: a file the review read while untracked (a plan, a constitution) and HEAD never
  // contained shows up as a full deletion between the reviewed tree and HEAD — it is not part of the push.
  const since = changedLines(root, rec.tree, ref, config.pr.ignore, { onlyIn: ref });
  if (since === null) return { allowed: false, branch, reason: 'the reviewed tree cannot be found (history rewritten?)', review: rec };
  if (rec.verdict === 'blocked' && since === 0) {
    return { allowed: false, branch, reason: 'the last review returned ⛔ and nothing changed since', review: rec, unreviewed_lines: 0 };
  }
  if (since > max) {
    return { allowed: false, branch, reason: `${since} lines changed since the review (ceiling ${max})`, review: rec, unreviewed_lines: since };
  }
  const reason = rec.verdict === 'waived' ? `review waived by the user: ${rec.reason}` : `review ${rec.verdict} (${rec.depth === 'light' ? 'light' : rec.reviewers.join(', ')})`;
  return { allowed: true, branch, reason, review: rec, unreviewed_lines: since };
}

// The refusal both push gates print (Claude Code hook and git pre-push hook).
export function pushRefusal(res, K) {
  return (
    `[kaizen] Push refused on ${res.branch}: ${res.reason}.\n` +
    'A review is mandatory before any push (Kaizen cycle constitution).\n' +
    `- Run /kaizen:review (it records the reviewed state via \`node "${K}" review record\`), apply the P0/P1 fixes, then push.\n` +
    `- If the user explicitly asked to skip it: \`node "${K}" review waive --reason "<their request>"\`, ` +
    'then ask them to type the displayed confirmation message themselves (kaizen waive <code>); you cannot confirm it for them.\n' +
    'Do not bypass this gate any other way, and do not disable it without an explicit request.\n'
  );
}

export function reviewStatus(root) {
  const branch = currentBranch(root);
  const pending = readJson(root, 'waivers.json', []).filter((w) => w.branch === branch && Date.now() - Date.parse(w.at) < WAIVER_MAX_AGE_MS);
  return {
    branch,
    review: branch ? readJson(root, 'reviews.json', {})[branch] || null : null,
    pending_waiver: pending.length ? { reason: pending[0].reason, at: pending[0].at } : null,
    push: checkPush(root),
  };
}
