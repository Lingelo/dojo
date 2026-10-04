#!/usr/bin/env node
// Kaizen — hooks that give the review evidence the agent cannot declare itself.
//
//   --evidence  (PostToolUse, Agent/Task tool): logs every Kaizen code reviewer actually launched;
//               `review record` requires it. During a work/autopilot cycle (gate active), also logs
//               every subagent (role, model, id) to break the cycle's cost down.
//   --confirm   (UserPromptSubmit): a user message containing `kaizen waive <code>` confirms the review
//               waiver requested by `review waive`; `kaizen deploy <code>` approves the deployment to a
//               protected environment requested by `deploy request`.
// Always exit 0: these hooks observe, they block nothing. Inactive outside a Kaizen repo.

import { readFileSync } from 'node:fs';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {}

const mode = process.argv.includes('--confirm') ? 'confirm' : 'evidence';
const WAIVE = /\bkaizen\s+(waive|deploy)\s+([A-F0-9]{6})\b/i;

// Cheap filters before any import: these hooks see every message and every subagent.
if (mode === 'confirm' && !WAIVE.test(String(input.prompt || ''))) process.exit(0);
if (mode === 'evidence' && !/^(Agent|Task)$/.test(String(input.tool_name || ''))) process.exit(0);

try {
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { repoRoot } = await import('./lib.mjs');
  const root = repoRoot(input.cwd || process.cwd());
  if (!root) process.exit(0);
  const state = await import('./review-state.mjs');

  if (mode === 'evidence') {
    const reviewer = state.reviewerOf(input.tool_input);
    if (existsSync(join(root, '.kaizen', 'state', 'gate.json'))) {
      const { recordLaunch } = await import('./cycle-agents.mjs');
      recordLaunch(root, input, reviewer);
    }
    if (!existsSync(join(root, '.kaizen', 'config.json'))) process.exit(0);
    if (reviewer) state.addEvidence(root, { reviewer, session: input.session_id || null, model: input.tool_input?.model || null });
  } else {
    if (!existsSync(join(root, '.kaizen', 'config.json'))) process.exit(0);
    const [, kind, code] = WAIVE.exec(String(input.prompt));
    if (kind.toLowerCase() === 'deploy') {
      const { confirmDeploy } = await import('./deploy.mjs');
      const a = confirmDeploy(root, code, { session: input.session_id || null });
      process.stdout.write(
        a
          ? `[kaizen] Deployment of ${a.sha.slice(0, 7)} to ${a.env} approved by the user (30 min): run \`deploy run ${a.env}\` for this commit, then watch.\n`
          : `[kaizen] Deployment code ${code} unknown or expired (30 min): run \`deploy request\` again if the user still wants it.\n`,
      );
      process.exit(0);
    }
    const entry = state.confirmWaiver(root, code, { session: input.session_id || null });
    // On UserPromptSubmit, standard output is added to Claude's context.
    process.stdout.write(
      entry
        ? `[kaizen] Review waiver confirmed by the user for ${entry.branch} (reason: ${entry.reason}). ` +
            'The push is allowed; the PR must say so in a "Review waived" section.\n'
        : `[kaizen] Waiver code ${code} unknown or expired (30 min): run \`review waive --reason\` again if the user still wants it.\n`,
    );
  }
} catch (err) {
  process.stderr.write(`[kaizen] review-hooks: ${err.message}\n`);
}
process.exit(0);
