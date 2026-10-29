// Kaizen — the user's approvals (review waiver, review gap, protected deployment), by code or by question.
//
// `approvals: "ask"` (default): Claude asks the user a question whose FIRST option is the safe one; if
// they pick the risky one, Claude runs `node "$K" confirm <code>`, which the PreToolUse review hook turns
// into Claude Code's own permission prompt (Claude cannot answer it) and marks as asked here. The CLI
// only confirms a code asked about within ASK_MAX_AGE_MS, once. `approvals: "code"`: the user types
// `kaizen waive|deploy <code>` themselves (UserPromptSubmit hook). Like the rest of the review state, a
// protection against reflexes and drift, not against an agent set on bypassing it.

import { pendingDeploy } from './deploy.mjs';
import { loadConfig, readState as read, writeState as write } from './lib.mjs';
import { pendingWaiver } from './review-state.mjs';

const ASK_MAX_AGE_MS = 10 * 60 * 1000;

export const approvalMode = (config) => (config.approvals === 'ask' ? 'ask' : 'code');

// What a pending code would approve, in words the user can judge — the same lookups (and lifetimes) as
// confirmWaiver and confirmDeploy, so the hook never asks about a code the CLI would reject.
export function pendingApproval(root, code) {
  const c = String(code).toUpperCase();
  const w = pendingWaiver(root, c);
  if (w?.kind === 'gap') return { kind: 'gap', code: c, text: `record the review of ${w.branch} without ${w.review.gaps.join(', ')}` };
  if (w) return { kind: 'waiver', code: c, text: `push ${w.branch} without a review (${w.reason})` };
  const d = pendingDeploy(root, c);
  if (d) return { kind: 'deploy', code: c, text: `deploy ${d.sha.slice(0, 7)} to ${d.env}` };
  return null;
}

const CHOICES = {
  waiver: ['Run the review (Recommended)', 'Push without a review'],
  gap: ['Relaunch the missing reviewer(s) (Recommended)', 'Accept the gap'],
  deploy: ['Not now (Recommended)', 'Deploy'],
};

// What `review waive`, `review record --allow-missing` and `deploy request` tell Claude to do.
export function approvalInstruction(root, kind, code, what) {
  if (approvalMode(loadConfig(root)) === 'code') return `Ask the user to type it themselves: kaizen ${kind === 'deploy' ? 'deploy' : 'waive'} ${code}`;
  const [safe, risky] = CHOICES[kind];
  return (
    `approvals is "ask": ask the user with AskUserQuestion (in their language) whether to ${what}, the safe option FIRST — ` +
    `1. "${safe}", 2. "${risky}". Never pick for them. Only if they choose "${risky}": run \`node "$K" confirm ${code}\` on its own; ` +
    'Claude Code then asks them to confirm (decline = the safe option). Non-interactive: nobody to ask, take the safe option.'
  );
}

// PreToolUse hook, before `kaizen.mjs confirm <code>` runs.
export function markAsked(root, code) {
  const now = Date.now();
  const asks = Object.fromEntries(Object.entries(read(root, 'confirm-asks.json', {})).filter(([, at]) => now - Date.parse(at) < ASK_MAX_AGE_MS));
  asks[String(code).toUpperCase()] = new Date(now).toISOString();
  write(root, 'confirm-asks.json', asks);
}

// `kaizen.mjs confirm <code>`: only after the hook asked the user about this very code.
export async function confirmAsked(root, code, { session = null } = {}) {
  if (approvalMode(loadConfig(root)) !== 'ask') throw new Error('approvals is "code": the user types `kaizen waive|deploy <code>` themselves');
  const c = String(code).toUpperCase();
  const asks = read(root, 'confirm-asks.json', {});
  if (!asks[c] || Date.now() - Date.parse(asks[c]) >= ASK_MAX_AGE_MS) throw new Error(`${c} was not confirmed in Claude Code's permission prompt (or the prompt is older than 10 min)`);
  delete asks[c];
  write(root, 'confirm-asks.json', asks);
  const p = pendingApproval(root, c);
  if (!p) throw new Error(`code ${c} unknown or expired (30 min)`);
  if (p.kind === 'deploy') {
    const { confirmDeploy } = await import('./deploy.mjs');
    return { ...p, approval: confirmDeploy(root, c, { session, by: 'user (prompt)' }) };
  }
  const { confirmWaiver } = await import('./review-state.mjs');
  return { ...p, entry: confirmWaiver(root, c, { session, by: 'user (prompt)' }) };
}
