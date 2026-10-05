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
import { join } from 'node:path';
import { changedLines, defaultBranch, diffBase, git, loadConfig, worktreeTree } from './lib.mjs';

export const VERDICTS = ['ready', 'concerns', 'blocked'];
// Verdict names used before Kaizen 3.0, still accepted.
const VERDICT_ALIASES = { reserves: 'concerns' };
export const LIGHT_MAX_LINES = 20;
const EVIDENCE_MAX_AGE_MS = 12 * 3600 * 1000;
const WAIVER_MAX_AGE_MS = 30 * 60 * 1000;
// State files only the CLI and the hooks write (the PreToolUse hook refuses direct writes).
export const PROTECTED_STATE = ['reviews.json', 'review-evidence.json', 'waivers.json'];

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

function branchLines(root, config) {
  const base = diffBase(root);
  return base ? changedLines(root, base, 'HEAD', config.pr.ignore) ?? 0 : 0;
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

function evidenceSince(root, since) {
  const from = Math.max(since ? Date.parse(since) : 0, Date.now() - EVIDENCE_MAX_AGE_MS);
  return readJson(root, 'review-evidence.json', []).filter((e) => Date.parse(e.at) > from);
}

// --- Recording a review ----------------------------------------------------------------------------

export function recordReview(root, { verdict, run = null } = {}) {
  verdict = VERDICT_ALIASES[verdict] || verdict;
  const branch = currentBranch(root);
  if (!branch) throw new Error('detached HEAD: a review is recorded on a branch');
  if (!VERDICTS.includes(verdict)) throw new Error(`--verdict expected: ${VERDICTS.join(' | ')}`);
  const config = loadConfig(root);
  const state = readJson(root, 'reviews.json', {});
  const previous = state[branch];
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
    return entry;
  }
  if (!reviewers.length && lines > LIGHT_MAX_LINES) {
    throw new Error(
      `no Kaizen reviewer launched since the last review of ${branch} (${lines} lines on the branch, ` +
        `light review only up to ${LIGHT_MAX_LINES}): run /kaizen:review, which runs the reviewers, before recording`,
    );
  }
  const entry = { ...snapshot(root, branch), verdict, depth: reviewers.length ? 'agents' : 'light', reviewers, models, run, at: new Date().toISOString() };
  state[branch] = entry;
  writeJson(root, 'reviews.json', state);
  return entry;
}

// --- Waiver: requested by the agent, confirmed by the user ----------------------------------------

export function requestWaiver(root, { reason }) {
  const branch = currentBranch(root);
  if (!branch) throw new Error('detached HEAD: a waiver applies to a branch');
  if (!reason) throw new Error('review waive requires --reason "<the user\'s request>"');
  const code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
  const now = Date.now();
  const pending = readJson(root, 'waivers.json', []).filter((w) => now - Date.parse(w.at) < WAIVER_MAX_AGE_MS && w.branch !== branch);
  pending.push({ code, reason, ...snapshot(root, branch), at: new Date(now).toISOString() });
  writeJson(root, 'waivers.json', pending);
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
  const entry = {
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
  return entry;
}

// --- Decision at push time ---------------------------------------------------------------------------

// Decides whether the branch's current state may be pushed. Always { allowed, reason, ... }.
export function checkPush(root, config = loadConfig(root)) {
  if (config.review.require_before_push === false) return { allowed: true, reason: 'review.require_before_push disabled' };
  const branch = currentBranch(root);
  if (!branch) return { allowed: true, reason: 'detached HEAD' };
  if (branch === defaultBranch(root)) return { allowed: true, reason: 'default branch (guarded by the git plugin)' };
  if (!diffBase(root)) return { allowed: true, reason: 'base not found' };
  const lines = branchLines(root, config);
  if (!lines) return { allowed: true, reason: 'no code change on the branch' };

  const max = Number(config.review.max_unreviewed_lines ?? 80);
  const rec = readJson(root, 'reviews.json', {})[branch];
  if (!rec) return { allowed: false, branch, reason: 'no review recorded for this branch', branch_lines: lines };
  const since = changedLines(root, rec.tree, 'HEAD', config.pr.ignore);
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
