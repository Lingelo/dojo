#!/usr/bin/env node
// Kaizen — hooks that record what the agent cannot declare itself.
//
//   --evidence  (PostToolUse, Agent/Task/Skill): agent-skills' review. Its code-reviewer persona (`/ship`)
//               returns its review: recorded at once, verdict read from its text. Its review skill
//               (`/kaizen:review`) only loads instructions: a mark is left for --stop.
//   --stop      (Stop): the turn that loaded the review skill has ended — its last message is the review;
//               the verdict is read from it and the reviewed tree recorded.
//   --heartbeat (SessionStart): records that Claude Code runs Kaizen's hooks in this repo
//               (`.kaizen/state/hooks-seen.json`), read by `kaizen doctor`.
//   --confirm   (UserPromptSubmit, `approvals: "code"`): a user message containing `kaizen waive <code>`
//               confirms the review waiver requested by `review waive`.
// Always exit 0: these hooks observe, they block nothing. Inactive outside a Kaizen repo.

import { readFileSync } from 'node:fs';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {}

const mode = ['confirm', 'heartbeat', 'stop'].find((m) => process.argv.includes(`--${m}`)) || 'evidence';
const WAIVE = /\bkaizen\s+waive\s+([A-F0-9]{6})\b/i;

// Cheap filters before any import: these hooks see every message and every tool call.
if (mode === 'confirm' && !WAIVE.test(String(input.prompt || ''))) process.exit(0);
if (mode === 'evidence' && !/^(Agent|Task|Skill)$/.test(String(input.tool_name || ''))) process.exit(0);

// Text of a tool response or of the transcript's last assistant message.
const textOf = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? v.map(textOf).join('\n') : v && typeof v === 'object' ? textOf(v.text ?? v.content ?? v.result ?? '') : '');
function lastAssistantText(file) {
  try {
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const e = JSON.parse(lines[i]);
      if (e.type === 'assistant' || e.message?.role === 'assistant') {
        const t = textOf((e.message?.content || []).filter((c) => c.type === 'text'));
        if (t.trim()) return t;
      }
    }
  } catch {}
  return '';
}

try {
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { repoRoot } = await import('./lib.mjs');
  const root = repoRoot(input.cwd || process.cwd());
  if (!root || !existsSync(join(root, '.kaizen', 'config.json'))) process.exit(0);
  const state = await import('./review-state.mjs');
  const session = input.session_id || null;

  if (mode === 'heartbeat') state.recordHeartbeat(root, { session, source: input.source || null });
  else if (mode === 'evidence') {
    const source = state.reviewSourceOf(input.tool_name, input.tool_input);
    if (source === 'code-reviewer') state.recordReview(root, { verdict: state.verdictOf(textOf(input.tool_response)), source, session });
    else if (source) state.markPendingReview(root, { session, source });
  } else if (mode === 'stop') {
    const p = state.takePendingReview(root, session);
    if (p && input.transcript_path) state.recordReview(root, { verdict: state.verdictOf(lastAssistantText(input.transcript_path)), source: p.source, session });
  } else {
    const [, code] = WAIVE.exec(String(input.prompt));
    const entry = state.confirmWaiver(root, code, { session });
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
