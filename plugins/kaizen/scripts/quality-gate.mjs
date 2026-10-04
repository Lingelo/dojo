#!/usr/bin/env node
// Kaizen — Stop hook: refuses to finish while checks are red during a /kaizen:work (or
// /kaizen:autopilot). Inactive otherwise: it costs nothing.
//
// Enabled by `kaizen.mjs gate on` (set by /kaizen:work), removed by `gate off`.
// Exit 0 = let it finish; exit 2 = block (the stderr message is sent back to Claude).
// After `gate.max_blocks` consecutive blocks, the hook lets it through while saying so, so that a
// failure out of reach never traps the session in a loop.
//
// The gate belongs to the session that set it: `--claim` (PostToolUse hook on Bash) records its
// session_id right after `gate on`, and the Stop hook ignores other sessions open on the same repo.
// Checks fit within `gate.budget_seconds`, under the hook timeout (900 s).

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLaunches } from './cycle-agents.mjs';
import { changedFiles, loadConfig, repoRoot, runVerify, subagentUsage, transcriptUsage, withFiles } from './lib.mjs';

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

const input = readStdin();
const claim = process.argv.includes('--claim');
// --claim sees every Bash command: cheap filter before any disk access.
// Skills write `node "$K" gate on`: the subcommand is recognized, not the CLI path.
if (claim && !/\bgate\s+on\b/.test(String(input.tool_input?.command || ''))) process.exit(0);
const root = repoRoot(input.cwd || process.cwd());
if (!root) process.exit(0);

const stateFile = join(root, '.kaizen', 'state', 'gate.json');
if (!existsSync(stateFile)) process.exit(0);

let state;
try {
  state = JSON.parse(readFileSync(stateFile, 'utf8'));
} catch {
  process.exit(0);
}
if (!state.active) process.exit(0);

if (claim) {
  if (input.session_id && !state.session) writeFileSync(stateFile, `${JSON.stringify({ ...state, session: input.session_id }, null, 2)}\n`);
  process.exit(0);
}
// Another session on the same repo is not concerned by this /kaizen:work.
if (state.session && input.session_id && state.session !== input.session_id) process.exit(0);

const config = loadConfig(root);
if (config.gate.enabled === false) process.exit(0);

// An interrupted /kaizen:work must not leave the gate active forever.
const maxAgeMs = Number(config.gate.max_age_hours ?? 24) * 3600 * 1000;
if (state.since && Date.now() - Date.parse(state.since) > maxAgeMs) {
  rmSync(stateFile, { force: true });
  process.stderr.write(`[kaizen] Quality gate expired (active since ${state.since}): disabled.\n`);
  process.exit(0);
}

// Cycle cost: tokens of the main session and its subagents (broken down by role) since `gate on`,
// recorded at the end of every turn; `gate off` logs them in .kaizen/state/cycles.jsonl for
// /kaizen:metrics.
if (input.transcript_path) {
  const usage = transcriptUsage(input.transcript_path, state.since);
  if (usage) {
    const subagents = subagentUsage(input.transcript_path, state.since, readLaunches(root));
    state = { ...state, usage, subagents };
    writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
  }
}

// Targeted checks (gate.targeted, with {files}): at the end of every turn, only what the branch
// touches. The full verification remains the one of /kaizen:work (phase 3) and /kaizen:ship.
const overrides = {};
const targeted = Object.entries(config.gate.targeted || {}).filter(([, cmd]) => cmd);
if (targeted.length) {
  const files = changedFiles(root);
  for (const [name, cmd] of targeted) overrides[name] = files.length ? withFiles(cmd, files) : '';
}
const results = runVerify(root, { budgetSeconds: Number(config.gate.budget_seconds ?? 840), overrides });
if (!results.length) process.exit(0);

const failed = results.filter((r) => !r.ok);
const skipped = results.filter((r) => r.skipped).map((r) => r.name);
if (!failed.length) {
  if (skipped.length) process.stderr.write(`[kaizen] Quality gate budget exhausted: ${skipped.join(', ')} not run — run \`verify\` before shipping.\n`);
  if (state.blocks) writeFileSync(stateFile, `${JSON.stringify({ ...state, blocks: 0 }, null, 2)}\n`);
  process.exit(0);
}

const max = Number(config.gate.max_blocks ?? 3);
const blocks = (state.blocks || 0) + 1;
writeFileSync(stateFile, `${JSON.stringify({ ...state, blocks, blocks_total: (state.blocks_total || 0) + 1, last_failure: new Date().toISOString() }, null, 2)}\n`);

const report = failed
  .map((r) => `✘ ${r.name} — \`${r.command}\` (exit ${r.exit})\n${r.output.split('\n').slice(-25).join('\n')}`)
  .join('\n\n');

if (blocks > max) {
  process.stderr.write(
    `[kaizen] Quality gate: ${failed.length} check(s) still red after ${max} attempts — letting you finish.\n` +
      `Tell the user explicitly what is still red and why, without claiming the work is verified.\n`,
  );
  process.exit(0);
}

process.stderr.write(
  `[kaizen] Quality gate (${blocks}/${max}): the work in progress is not green.\n\n${report}\n\n` +
    `Fix the root cause (not the test), then finish. If the failure is outside the plan's scope, ` +
    `run \`node "${fileURLToPath(new URL('./kaizen.mjs', import.meta.url))}" gate off\` and explain why to the user.\n`,
);
process.exit(2);
