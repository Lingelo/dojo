#!/usr/bin/env node
// Kaizen — PreToolUse hook (Bash): no `git push` of a branch without a recorded review.
//
// Stops the push until agent-skills' review (`/kaizen:review` or `/kaizen:ship`) has recorded the pushed
// state: the first push makes Claude ask the user, the review first; a second push of the same commit
// reaches Claude Code's own permission prompt, where only the user can let it go out unreviewed.
// It also refuses direct writes to the review state files and manual calls to the evidence hooks:
// these states are only written by the CLI and the hooks.
// Only active in a repo initialized by Kaizen (.kaizen/config.json). Exit 2 = block.
// Any internal error lets the command through: a broken gate must never block the work.

import { readFileSync } from 'node:fs';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {}

const command = String(input.tool_input?.command || '');
const filePath = String(input.tool_input?.file_path || input.tool_input?.notebook_path || '');
// Cheap filters before any import: this hook sees every Bash command and every write.
// `git push`, also through a path (`/usr/bin/git`) or after global options (`--no-pager`, `-C dir`).
const PUSH = /(^|[\s;&|(])(\S*\/)?git(\s+(-[cC]\s+\S+|--[\w-]+(=\S+)?))*\s+push(\s|$)/;
const TAMPER = /(reviews|review-pending|hooks-seen|push-offers)\.json|review-hooks\.mjs/;
const tamper = input.tool_name === 'Bash'
  ? TAMPER.test(command) && /\.kaizen|review-hooks\.mjs/.test(command)
  : /\.kaizen[\\/]state[\\/]/.test(filePath) && TAMPER.test(filePath);
const isBash = !input.tool_name || input.tool_name === 'Bash';

// The user's approval goes through Claude Code's own permission prompt ("ask"). In bypass-permissions
// mode nothing guarantees that prompt is shown: refuse instead, the safe option stays open.
function askUser(reason, safe, context = null) {
  if (input.permission_mode === 'bypassPermissions') {
    process.stderr.write(`${reason}\n[kaizen] Claude Code is in bypass-permissions mode: the user cannot be asked. ${safe}, or the user leaves that mode and you retry.\n`);
    process.exit(2);
  }
  const out = { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason };
  if (context) out.additionalContext = context;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: out }));
  process.exit(0);
}
if (!tamper && (!isBash || !PUSH.test(command))) process.exit(0);

try {
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { repoRoot } = await import('./lib.mjs');
  const root = repoRoot(input.cwd || process.cwd());
  if (!root || !existsSync(join(root, '.kaizen', 'config.json'))) process.exit(0);
  const { logFriction } = await import('./lib.mjs');
  if (tamper) {
    logFriction(root, { gate: 'state', kind: 'refused', source: 'claude' });
    process.stderr.write(
      '[kaizen] Review evidence (.kaizen/state/reviews.json, review-pending.json, hooks-seen.json, push-offers.json) is only written ' +
        'by the hooks. To read the state: `review status`. To push without a review: push, and the user confirms it in Claude Code\'s prompt.\n',
    );
    process.exit(2);
  }
  // Deleting a remote branch or pushing only tags publishes no new code.
  const pushPart = command.slice(command.search(PUSH)).split(/[;&|]/)[0];
  if (/\s(--delete|-d|--tags)(\s|$)/.test(pushPart) || /\s:\S+/.test(pushPart)) process.exit(0);

  const { checkPush } = await import('./review-state.mjs');
  const res = checkPush(root);
  if (res.allowed) process.exit(0);

  const { pushReasonKey } = await import('./lib.mjs');
  const { pushOffer, askQuestion } = await import('./review-state.mjs');
  // First push of this commit: Claude asks the user, review first. Second one: they chose to skip it —
  // Claude Code's own permission prompt, which Claude cannot answer for them. Approving it is logged,
  // never recorded as a review.
  if (!pushOffer(root, res.branch, { take: true })) {
    logFriction(root, { gate: 'push', kind: 'asked', reason: pushReasonKey(res), branch: res.branch, source: 'claude' });
    process.stderr.write(askQuestion(res));
    process.exit(2);
  }
  logFriction(root, { gate: 'push', kind: 'skip_confirm', reason: pushReasonKey(res), branch: res.branch, source: 'claude' });
  askUser(
    `[kaizen] ${res.branch}: ${res.reason}. You chose to push without a review — confirm? (No: Claude runs /kaizen:review.)`,
    'Run /kaizen:review, then push',
    '[kaizen] If the user declined this push, they want the review after all — run /kaizen:review on the ' +
      'branch now (Critical fixes), then push again. If they approved, the push went out unreviewed.',
  );
} catch (err) {
  process.stderr.write(`[kaizen] review-gate: ${err.message} — push let through.\n`);
  process.exit(0);
}
