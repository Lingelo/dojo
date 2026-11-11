// Kaizen — review state per branch, read by the PreToolUse hook that guards `git push`.
//
// The review itself is agent-skills': its five-axis skill (`/review` loads `code-review-and-quality`
// through the Skill tool) or its `code-reviewer` persona (`/ship` launches it as a subagent). Kaizen never
// asks the agent to declare a review: the hooks see the skill or the persona run, read the verdict it
// wrote (`Verdict: APPROVE | REQUEST CHANGES`, a non-empty **Critical** section) and record the tree it
// reviewed. At push time, that tree is compared to HEAD: beyond `review.max_unreviewed_lines` lines
// changed since, the push waits for a new review.
//
// Skipping the review is the user's call: the push is stopped once so Claude asks them, the review
// first; pushing again reaches Claude Code's own permission prompt, which Claude cannot answer.
//
// Accepted limit: these gates stop forgetfulness and drift, not an agent set on bypassing them (the
// PreToolUse hook does refuse direct writes to these state files).

import { changedLines, defaultBranch, diffBase, git, loadConfig, logFriction, readState, worktreeTree, writeState } from './lib.mjs';

export const VERDICTS = ['ready', 'concerns', 'blocked'];
const PENDING_MAX_AGE_MS = 6 * 3600 * 1000;
const OFFER_MAX_AGE_MS = 30 * 60 * 1000;

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

// --- Heartbeat: proof that Claude Code runs Kaizen's hooks here -----------------------------------

export function recordHeartbeat(root, { session = null, source = null } = {}) {
  writeJson(root, 'hooks-seen.json', { at: new Date().toISOString(), session, source });
}

// --- Decision at push time ---------------------------------------------------------------------------

// Decides whether the current branch may be pushed at HEAD. Always { allowed, reason, ... }.
export function checkPush(root, config = loadConfig(root)) {
  const res = decidePush(root, config);
  // An unreviewed push is the user's call (Claude Code prompt), not a refusal to act on alone.
  if (!res.allowed) res.ask = true;
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
  return { allowed: true, branch, reason: `review ${rec.verdict} (${(rec.reviewers || []).join(', ') || rec.depth})`, review: rec, unreviewed_lines: since };
}

// In two steps: the first unreviewed push of a commit is stopped so Claude asks the user a
// question whose first choice is the review; only a second push of that same commit, within 30 min,
// reaches Claude Code's permission prompt — where the user confirms the push without a review. The
// offer is single use: a third push is stopped again.
export function pushOffer(root, branch, { take = false } = {}) {
  const head = git(root, ['rev-parse', 'HEAD'], { allowFail: true });
  const offers = readJson(root, 'push-offers.json', {});
  const o = offers[branch];
  const pending = Boolean(o && o.head === head && Date.now() - Date.parse(o.at) < OFFER_MAX_AGE_MS);
  if (take) {
    if (pending) delete offers[branch];
    else offers[branch] = { head, at: new Date().toISOString() };
    writeJson(root, 'push-offers.json', offers);
  }
  return pending;
}

export function askQuestion(res) {
  return (
    `[kaizen] ${res.branch}: ${res.reason}. Pushing without a review is the user's call.\n` +
    'Ask them now with AskUserQuestion (in their language), the review as the FIRST option:\n' +
    '  1. "Run the review (Recommended)" — /kaizen:review on the branch, fix the Critical and Required findings, then push;\n' +
    '  2. "Push without a review" — rerun the same push: Claude Code will ask them to confirm it.\n' +
    'Do not pick for them. Non-interactive or autonomous flow: nobody to ask, run the review.\n'
  );
}

export function reviewStatus(root) {
  const branch = currentBranch(root);
  return {
    branch,
    review: branch ? readJson(root, 'reviews.json', {})[branch] || null : null,
    push: checkPush(root),
  };
}
