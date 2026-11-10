// Kaizen — review state per branch, read by the PreToolUse hook that guards `git push`.
//
// The review itself is agent-skills': its five-axis skill (`/review` loads `code-review-and-quality`
// through the Skill tool) or its `code-reviewer` persona (`/ship` launches it as a subagent). Kaizen never
// asks the agent to declare a review: the hooks see the skill or the persona run, read the verdict it
// wrote (`Verdict: APPROVE | REQUEST CHANGES`, a non-empty **Critical** section) and record the tree it
// reviewed. At push time, that tree is compared to HEAD: beyond `review.max_unreviewed_lines` lines
// changed since, the push waits for a new review.
//
// Human waiver: `review waive` only creates a pending request, with a code. Only the user confirms it: in
// Claude Code's permission prompt (`confirm`, approvals.mjs), or with `approvals: "code"` a message
// containing `kaizen waive <code>` (UserPromptSubmit hook).
//
// Accepted limit: these gates stop forgetfulness and drift, not an agent set on bypassing them (the
// PreToolUse hook does refuse direct writes to these state files).

import { randomBytes } from 'node:crypto';
import { approvalInstruction } from './approvals.mjs';
import { changedLines, defaultBranch, diffBase, git, loadConfig, logFriction, readState, worktreeTree, writeState } from './lib.mjs';

export const VERDICTS = ['ready', 'concerns', 'blocked'];
const PENDING_MAX_AGE_MS = 6 * 3600 * 1000;
const WAIVER_MAX_AGE_MS = 30 * 60 * 1000;

const readJson = readState;
const writeJson = writeState;

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

// --- agent-skills' review, seen by the hooks ------------------------------------------------------------

// The review skill through the Skill tool, or the code-reviewer persona through the Agent tool.
const REVIEW_SKILL = /^(agent-skills:)?code-review-and-quality$/;
const REVIEWER_AGENT = /^(agent-skills:)?code-reviewer$/;
export function reviewSourceOf(toolName, toolInput = {}) {
  if (/^(Agent|Task)$/.test(String(toolName)) && REVIEWER_AGENT.test(String(toolInput.subagent_type || ''))) return 'code-reviewer';
  if (toolName === 'Skill' && REVIEW_SKILL.test(String(toolInput.skill || toolInput.name || toolInput.command || '').replace(/^\//, ''))) return 'code-review-and-quality';
  return null;
}

const NONE = /^(none|n\/a|nothing|—|-|0|no (critical )?(issues?|findings?))(\s+(found|identified|noted|so far))?\.?$/i;
// The verdict of an agent-skills review, from its text: a Critical finding blocks (same as a ⛔ review),
// "REQUEST CHANGES" asks for changes, anything else approves.
export function verdictOf(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  let inCritical = false;
  for (const raw of lines) {
    const line = raw.trim();
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      inCritical = /^critical\b/i.test(heading[1].replace(/\*/g, ''));
      continue;
    }
    const label = /^(?:[-*]\s+)?\**critical\**\s*[:—–]\s*\**\s*(.*)$/i.exec(line);
    if (label && label[1] && !NONE.test(label[1].replace(/\*/g, '').trim())) return 'blocked';
    if (inCritical) {
      const item = /^[-*]\s+(.*)$/.exec(line);
      if (item && !NONE.test(item[1].replace(/[*_`]/g, '').trim())) return 'blocked';
    }
  }
  const t = lines.join('\n');
  if (/verdict\**\s*:?\**\s*(request changes|changes requested)/i.test(t) || /\[x\]\s*\**request changes/i.test(t)) return 'concerns';
  return 'ready';
}

// The Skill tool returns before the review is written: the PostToolUse hook leaves a mark, the Stop hook
// reads the turn's final text and records the review (takePendingReview).
export function markPendingReview(root, { session = null, source }) {
  writeJson(root, 'review-pending.json', { session, source, branch: currentBranch(root), at: new Date().toISOString() });
}

export function takePendingReview(root, session) {
  const p = readJson(root, 'review-pending.json', null);
  if (!p || (p.session && session && p.session !== session) || Date.now() - Date.parse(p.at) > PENDING_MAX_AGE_MS) return null;
  writeJson(root, 'review-pending.json', null);
  return p;
}

// Records the reviewed tree of the current branch.
export function recordReview(root, { verdict, source, session = null }) {
  const branch = currentBranch(root);
  if (!branch) return null;
  if (!VERDICTS.includes(verdict)) throw new Error(`verdict expected: ${VERDICTS.join(' | ')}`);
  const state = readJson(root, 'reviews.json', {});
  const entry = { ...snapshot(root, branch), verdict, depth: 'agent-skills', reviewers: [source], session, at: new Date().toISOString() };
  state[branch] = entry;
  writeJson(root, 'reviews.json', state);
  logFriction(root, { gate: 'push', kind: 'review_recorded', depth: entry.depth, verdict, branch });
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
  logFriction(root, { gate: 'push', kind: 'waiver_requested', branch });
  return {
    pending: true,
    branch,
    code,
    expires_in_minutes: WAIVER_MAX_AGE_MS / 60000,
    instruction: approvalInstruction(root, 'waiver', code, 'push without a review'),
  };
}

// Called by the UserPromptSubmit hook (a user message), or by `confirm` after Claude Code's prompt (approvals.mjs).
// A waiver still waiting for the user, by its code; null if unknown or expired.
export function pendingWaiver(root, code, list = readJson(root, 'waivers.json', [])) {
  const now = Date.now();
  return list.find((x) => x.code === String(code).toUpperCase() && now - Date.parse(x.at) < WAIVER_MAX_AGE_MS) || null;
}

export function confirmWaiver(root, code, { session = null, by = 'user (message)' } = {}) {
  const now = Date.now();
  const pending = readJson(root, 'waivers.json', []);
  const w = pendingWaiver(root, code, pending);
  if (!w) return null;
  const state = readJson(root, 'reviews.json', {});
  const entry = {
    branch: w.branch,
    head: w.head,
    tree: w.tree,
    verdict: 'waived',
    reason: w.reason,
    reviewers: [],
    confirmed_by: by,
    session,
    at: new Date(now).toISOString(),
  };
  state[w.branch] = entry;
  writeJson(root, 'reviews.json', state);
  writeJson(root, 'waivers.json', pending.filter((x) => x !== w));
  logFriction(root, { gate: 'push', kind: 'waiver_confirmed', branch: w.branch });
  return entry;
}

// --- Heartbeat: proof that Claude Code runs Kaizen's hooks here -----------------------------------

export function recordHeartbeat(root, { session = null, source = null } = {}) {
  writeJson(root, 'hooks-seen.json', { at: new Date().toISOString(), session, source });
}

// --- Decision at push time ---------------------------------------------------------------------------

// Decides whether the current branch may be pushed at HEAD. Always { allowed, reason, ... }.
export function checkPush(root, config = loadConfig(root)) {
  const res = decidePush(root, config);
  // `ask`: an unreviewed push is the user's call (Claude Code prompt), not a refusal to act on alone.
  if (!res.allowed && config.review.require_before_push === 'ask') res.ask = true;
  return res;
}

function decidePush(root, config) {
  if (config.review.require_before_push === false) return { allowed: true, reason: 'review.require_before_push disabled' };
  const branch = currentBranch(root);
  const ref = 'HEAD';
  if (!branch) return { allowed: true, reason: 'detached HEAD' };
  if (branch === defaultBranch(root)) return { allowed: true, reason: 'default branch (guarded by the git plugin)' };
  if (!baseOf(root, ref)) return { allowed: true, reason: 'base not found' };
  const lines = branchLines(root, config, ref);
  if (!lines) return { allowed: true, reason: 'no code change on the branch' };

  const max = Number(config.review.max_unreviewed_lines ?? 80);
  const rec = readJson(root, 'reviews.json', {})[branch];
  if (!rec) return { allowed: false, branch, reason: 'no review recorded for this branch', branch_lines: lines };
  // Only what is pushed counts: a file the review read while untracked (a plan, a spec) and HEAD never
  // contained shows up as a full deletion between the reviewed tree and HEAD — it is not part of the push.
  const since = changedLines(root, rec.tree, ref, config.pr.ignore, { onlyIn: ref });
  if (since === null) return { allowed: false, branch, reason: 'the reviewed tree cannot be found (history rewritten?)', review: rec };
  if (rec.verdict === 'blocked' && since === 0) {
    return { allowed: false, branch, reason: 'the last review returned ⛔ and nothing changed since', review: rec, unreviewed_lines: 0 };
  }
  if (since > max) {
    return { allowed: false, branch, reason: `${since} lines changed since the review (ceiling ${max})`, review: rec, unreviewed_lines: since };
  }
  const reason = rec.verdict === 'waived' ? `review waived by the user: ${rec.reason}` : `review ${rec.verdict} (${(rec.reviewers || []).join(', ') || rec.depth})`;
  return { allowed: true, branch, reason, review: rec, unreviewed_lines: since };
}

// `ask` mode, in two steps: the first unreviewed push of a commit is stopped so Claude asks the user a
// question whose first choice is the review; only a second push of that same commit, within 30 min,
// reaches Claude Code's permission prompt — where the user confirms the push without a review. The
// offer is single use: a third push is stopped again.
export function pushOffer(root, branch, { take = false } = {}) {
  const head = git(root, ['rev-parse', 'HEAD'], { allowFail: true });
  const offers = readJson(root, 'push-offers.json', {});
  const o = offers[branch];
  const pending = Boolean(o && o.head === head && Date.now() - Date.parse(o.at) < WAIVER_MAX_AGE_MS);
  if (take) {
    if (pending) delete offers[branch];
    else offers[branch] = { head, at: new Date().toISOString() };
    writeJson(root, 'push-offers.json', offers);
  }
  return pending;
}

export function askQuestion(res) {
  return (
    `[kaizen] ${res.branch}: ${res.reason}. review.require_before_push is "ask": the user decides.\n` +
    'Ask them now with AskUserQuestion (in their language), the review as the FIRST option:\n' +
    '  1. "Run the review (Recommended)" — /kaizen:review on the branch, fix the Critical and Required findings, then push;\n' +
    '  2. "Push without a review" — rerun the same push: Claude Code will ask them to confirm it.\n' +
    'Do not pick for them. Non-interactive or autonomous flow: nobody to ask, run the review.\n'
  );
}

// The refusal the push gate prints.
export function pushRefusal(res, K) {
  return (
    `[kaizen] Push refused on ${res.branch}: ${res.reason}.\n` +
    'A review is required before any push of a branch.\n' +
    '- Run /kaizen:review: Kaizen records the reviewed state by itself. Fix the Critical and Required findings, then push.\n' +
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
