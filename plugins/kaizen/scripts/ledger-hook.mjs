#!/usr/bin/env node
// Kaizen — Stop hook: charges the turn's tokens to the work item in progress (see ledger.mjs).
// Only in a Kaizen repo; never blocks, any error lets the turn end.

import { readFileSync } from 'node:fs';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {}

try {
  const { repoRoot } = await import('./lib.mjs');
  const root = repoRoot(input.cwd || process.cwd());
  if (root) {
    const { account } = await import('./ledger.mjs');
    account(root, input);
  }
} catch {}
process.exit(0);
