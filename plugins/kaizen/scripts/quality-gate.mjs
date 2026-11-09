#!/usr/bin/env node
// Kaizen — Stop hook: Claude does not end a turn on red checks after editing code.
//
// Turned on by post-edit.mjs as soon as this session edits a code file in a Kaizen repo; nothing to
// run, no skill to remember. At the end of each turn it runs the verification (targeted when
// `gate.targeted` is set): green → the gate turns itself off; red → the turn is blocked (exit 2, the
// report goes back to Claude) up to `gate.max_blocks` times in a row, then it lets the turn end while
// saying so, so that a failure out of reach never traps the session.
// The gate belongs to the session that edited: another session open on the same repo is not concerned.
// Checks fit within `gate.budget_seconds`, under the hook timeout (900 s).

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changedFiles, loadConfig, logFriction, repoRoot, runVerify, withFiles } from './lib.mjs';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {}

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
if (!state?.active) process.exit(0);
if (state.session && input.session_id && state.session !== input.session_id) process.exit(0);

const config = loadConfig(root);
const off = () => rmSync(stateFile, { force: true });
if (config.gate.enabled === false) {
  off();
  process.exit(0);
}

// A session left with a red gate must not keep it forever.
const maxAgeMs = Number(config.gate.max_age_hours ?? 24) * 3600 * 1000;
if (state.since && Date.now() - Date.parse(state.since) > maxAgeMs) {
  off();
  process.stderr.write(`[kaizen] Quality gate expired (on since ${state.since}): off.\n`);
  process.exit(0);
}

// Targeted checks (gate.targeted, with {files}): only what the branch touches.
const overrides = {};
const targeted = Object.entries(config.gate.targeted || {}).filter(([, cmd]) => cmd);
if (targeted.length) {
  const files = changedFiles(root);
  for (const [name, cmd] of targeted) overrides[name] = files.length ? withFiles(cmd, files) : '';
}
const results = runVerify(root, { budgetSeconds: Number(config.gate.budget_seconds ?? 840), overrides });
const failed = results.filter((r) => !r.ok);
if (!failed.length) {
  const skipped = results.filter((r) => r.skipped).map((r) => r.name);
  if (skipped.length) process.stderr.write(`[kaizen] Quality gate budget exhausted: ${skipped.join(', ')} not run — run \`verify\` before pushing.\n`);
  off();
  process.exit(0);
}

const max = Number(config.gate.max_blocks ?? 3);
const blocks = (state.blocks || 0) + 1;
const checks = failed.map((r) => r.name);
if (blocks > max) {
  off();
  logFriction(root, { gate: 'quality', kind: 'released', checks });
  process.stderr.write(
    `[kaizen] Quality gate: ${failed.length} check(s) still red after ${max} attempts — letting you finish.\n` +
      'Tell the user explicitly what is still red and why, without claiming the work is verified.\n',
  );
  process.exit(0);
}
writeFileSync(stateFile, `${JSON.stringify({ ...state, blocks, last_failure: new Date().toISOString() }, null, 2)}\n`);
logFriction(root, { gate: 'quality', kind: 'blocked', checks });

const report = failed.map((r) => `✘ ${r.name} — \`${r.command}\` (exit ${r.exit})\n${r.output.split('\n').slice(-25).join('\n')}`).join('\n\n');
process.stderr.write(
  `[kaizen] Quality gate (${blocks}/${max}): code was edited and the checks are red.\n\n${report}\n\n` +
    'Fix the root cause (never by skipping or weakening a test), then finish. If the failure is outside what ' +
    `you were asked to do, run \`node "${fileURLToPath(new URL('./kaizen.mjs', import.meta.url))}" gate off\` and explain why to the user.\n`,
);
process.exit(2);
