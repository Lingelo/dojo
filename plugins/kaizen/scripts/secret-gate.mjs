#!/usr/bin/env node
// Kaizen — PreToolUse hook (Bash): no secret in a commit Claude makes.
//
// Before `git commit` runs, scans what it is about to record — the index, plus the changes a `git add`
// earlier in the same command, `commit -a` or commit paths will bring in — for ~30 kinds of keys and
// tokens (scripts/secrets.mjs). Also refuses `--no-verify`: the repo's own commit hooks are not
// Claude's to skip. Active in every git repo (not only Kaizen-initialized ones), unless
// `secrets.scan: false` in .kaizen/config.json. Exit 2 = block. Any internal error lets the command
// through: a broken gate must never block the work.

import { readFileSync } from 'node:fs';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {}

const command = String(input.tool_input?.command || '');
// Cheap filter before any import: this hook sees every Bash command.
if ((input.tool_name && input.tool_name !== 'Bash') || !/\bgit\b[\s\S]*\bcommit\b/.test(command)) process.exit(0);

try {
  const { commitPlan, formatFindings, scan } = await import('./secrets.mjs');
  const plan = commitPlan(command);
  if (!plan.commit) process.exit(0);
  const { loadConfig, repoRoot } = await import('./lib.mjs');
  const cwd = input.cwd || process.cwd();
  const root = repoRoot(cwd);
  if (!root) process.exit(0);
  const config = loadConfig(root);
  if (config.secrets.scan === false) process.exit(0);

  if (plan.noVerify) {
    process.stderr.write(
      '[kaizen] `git commit --no-verify` refused: the repo\'s commit hooks (lint, secrets, tests) are not skipped by Claude. ' +
        'Fix what the hook reports; if the user really wants to skip it, they run the commit themselves.\n',
    );
    process.exit(2);
  }

  const findings = scan(cwd, { ...plan, ignore: config.secrets.ignore });
  if (!findings.length) process.exit(0);
  process.stderr.write(
    `[kaizen] Commit refused: ${findings.length} possible secret(s) in the changes about to be committed.\n` +
      `${formatFindings(findings.slice(0, 20))}${findings.length > 20 ? `\n  … and ${findings.length - 20} more` : ''}\n` +
      'Remove the value from the code (environment variable, secret manager, untracked .env) and unstage it. ' +
      'If it was already pushed or shared, tell the user it must be rotated. ' +
      'False positive (test fixture, public key): ask the user — they can add the path to `secrets.ignore` in .kaizen/config.json. ' +
      'Never print the secret itself.\n',
  );
  process.exit(2);
} catch {
  process.exit(0);
}
