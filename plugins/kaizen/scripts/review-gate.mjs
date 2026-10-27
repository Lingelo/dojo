#!/usr/bin/env node
// Kaizen — PreToolUse hook (Bash): no `git push` of a branch without a recorded review.
//
// The "mandatory" review of work/autopilot/ship no longer relies on the prompt alone: this hook
// refuses the push until `/kaizen:review` has recorded the pushed state (`review record`), or the user
// has waived it themselves (`review waive`, confirmed by their message).
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
const PUSH = /(^|[\s;&|(])git(\s+-[cC]\s+\S+)*\s+push(\s|$)/;
const TAMPER = /(reviews|review-evidence|review-launches|hooks-seen|waivers|deploy-approvals|push-offers|confirm-asks)\.json|deployments\.jsonl|review-hooks\.mjs/;
// Hand-made deployment tags: they would distort DORA metrics and postmortems.
const FORGED_TAG = /\bgit\b[^;&|]*\btag\b[^;&|]*\b(deploy|rollback|incident|resolve)\//;
const tamper = input.tool_name === 'Bash'
  ? TAMPER.test(command) && /\.kaizen|review-hooks\.mjs/.test(command)
  : /\.kaizen[\\/]state[\\/]/.test(filePath) && TAMPER.test(filePath);
const isBash = !input.tool_name || input.tool_name === 'Bash';
const forged = isBash && FORGED_TAG.test(command) && !/\s(-d|--delete|-l|--list)\b/.test(command);
// A protected environment's deploy command is only known after reading the config: every non-trivial
// Bash command therefore goes through this check in a Kaizen repo (reading one JSON file).
if (!tamper && !forged && (!isBash || (!PUSH.test(command) && !command.trim()))) process.exit(0);

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
      '[kaizen] Review and deployment evidence (.kaizen/state/reviews.json, review-evidence.json, review-launches.json, hooks-seen.json, waivers.json, push-offers.json, confirm-asks.json, ' +
        'deploy-approvals.json, deployments.jsonl) is only written ' +
        'by the CLI and the hooks. To read the state: `review status`. To waive the review: `review waive --reason`, ' +
        'confirmed by the user.\n',
    );
    process.exit(2);
  }
  if (forged) {
    logFriction(root, { gate: 'tag', kind: 'refused', source: 'claude' });
    process.stderr.write('[kaizen] deploy/…, rollback/…, incident/… and resolve/… tags are only created by `kaizen.mjs deploy` and `kaizen.mjs monitor`: they carry DORA metrics and postmortem timelines.\n');
    process.exit(2);
  }
  // `approvals: "ask"`: the user picked the risky option of Claude's question — Claude Code's own prompt
  // confirms it (Claude cannot answer it); `confirm` only accepts a code asked about here.
  const CONFIRM = /\bkaizen\.mjs["']?\s+confirm\s+([A-Fa-f0-9]{6})\b/.exec(command);
  if (CONFIRM) {
    const { loadConfig } = await import('./lib.mjs');
    const { approvalMode, markAsked, pendingApproval } = await import('./approvals.mjs');
    const p = approvalMode(loadConfig(root)) === 'ask' && pendingApproval(root, CONFIRM[1]);
    if (p) {
      markAsked(root, p.code);
      logFriction(root, { gate: p.kind === 'deploy' ? 'deploy' : 'push', kind: 'confirm_asked', approval: p.kind, source: 'claude' });
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'ask',
            permissionDecisionReason: `[kaizen] You chose to ${p.text} — confirm?`,
          },
        }),
      );
      process.exit(0);
    }
  }
  // Direct deployment of a protected environment: it goes through /kaizen-ops:deploy (approval typed by
  // the user, tag, watch), never through its raw command.
  if (!/kaizen\.mjs/.test(command)) {
    const { loadConfig } = await import('./lib.mjs');
    const envs = loadConfig(root).deploy.environments || {};
    for (const [name, e] of Object.entries(envs)) {
      const prot = e.protected ?? name === 'production';
      if (prot && e.command && command.includes(e.command)) {
        logFriction(root, { gate: 'deploy', kind: 'refused', env: name, source: 'claude' });
        process.stderr.write(
          `[kaizen] Direct deployment of ${name} refused: go through /kaizen-ops:deploy ${name} ` +
            '(approval the user types themselves, deployment tag, signal watch, rollback ready).\n',
        );
        process.exit(2);
      }
    }
  }
  if (!PUSH.test(command)) process.exit(0);
  // Deleting a remote branch or pushing only tags publishes no new code.
  const pushPart = command.slice(command.search(PUSH)).split(/[;&|]/)[0];
  if (/\s(--delete|-d|--tags)(\s|$)/.test(pushPart) || /\s:\S+/.test(pushPart)) process.exit(0);

  const { checkPush } = await import('./review-state.mjs');
  const res = checkPush(root);
  if (res.allowed) process.exit(0);

  const { fileURLToPath } = await import('node:url');
  const { pushRefusal } = await import('./review-state.mjs');
  const { pushReasonKey, loadConfig } = await import('./lib.mjs');
  // `ask`: the user judges each push themselves — Claude Code's own permission prompt, which Claude
  // cannot answer for them. Approving it is their waiver; it is logged, never recorded as a review.
  if (loadConfig(root).review.require_before_push === 'ask') {
    const { pushOffer, askQuestion } = await import('./review-state.mjs');
    // First push of this commit: Claude asks the user, review first. Second one: they chose to skip it.
    if (!pushOffer(root, res.branch, { take: true })) {
      logFriction(root, { gate: 'push', kind: 'asked', reason: pushReasonKey(res), branch: res.branch, source: 'claude' });
      process.stderr.write(askQuestion(res));
      process.exit(2);
    }
    logFriction(root, { gate: 'push', kind: 'skip_confirm', reason: pushReasonKey(res), branch: res.branch, source: 'claude' });
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: `[kaizen] ${res.branch}: ${res.reason}. You chose to push without a review — confirm? (No: Claude runs /kaizen:review.)`,
          additionalContext:
            '[kaizen] If the user declined this push, they want the review after all — run /kaizen:review on the ' +
            'branch now (P0/P1 fixes), then push again. If they approved, the push went out unreviewed.',
        },
      }),
    );
    process.exit(0);
  }
  logFriction(root, { gate: 'push', kind: 'refused', reason: pushReasonKey(res), branch: res.branch, source: 'claude' });
  process.stderr.write(pushRefusal(res, fileURLToPath(new URL('./kaizen.mjs', import.meta.url))));
  process.exit(2);
} catch (err) {
  process.stderr.write(`[kaizen] review-gate: ${err.message} — push let through.\n`);
  process.exit(0);
}
