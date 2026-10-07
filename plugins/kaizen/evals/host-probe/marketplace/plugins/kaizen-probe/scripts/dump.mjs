#!/usr/bin/env node
// kaizen-probe — hook logger. Records what the host sends to a hook (stdin, argv, plugin env vars,
// transcript shape) under <project>/.probe/hooks/, and blocks on demand so the tester can see whether
// exit code 2 is honored:
//   --role pre   a shell command containing `kaizen-probe-block` is refused (exit 2)
//   --role stop  if .probe/stop-block-once exists, it is removed and the stop is refused once (exit 2)
// Any other case exits 0: the probe never gets in the way of the session.

import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { hostEnv, opts, record } from './common.mjs';

const o = opts(process.argv.slice(2));
let raw = '';
try {
  raw = readFileSync(0, 'utf8');
} catch {}
let input = null;
try {
  input = JSON.parse(raw);
} catch {}

const root = input?.cwd || input?.workspace_roots?.[0] || process.cwd();
// Where the shell command sits differs per host: Claude Code and Codex nest it in tool_input, Cursor's
// beforeShellExecution has it at the top level.
const command = String(input?.tool_input?.command ?? input?.command ?? '');

function transcript(path) {
  if (!path || !existsSync(path)) return path ? { path, exists: false } : null;
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
  let keys = [];
  try {
    keys = Object.keys(JSON.parse(lines.at(-1)));
  } catch {}
  // Shape only, never content: enough to know whether token usage can be read later.
  return { path, exists: true, bytes: statSync(path).size, lines: lines.length, last_line_keys: keys };
}

let action = 'allow';
let message = '';
if (o.role === 'pre' && command.includes('kaizen-probe-block')) {
  action = 'block';
  message = '[kaizen-probe] blocked by the probe hook (exit 2): the command contained kaizen-probe-block';
}
const flag = join(root, '.probe', 'stop-block-once');
if (o.role === 'stop' && existsSync(flag)) {
  rmSync(flag);
  action = 'block';
  message = '[kaizen-probe] stop refused once by the probe hook (exit 2): reply with exactly KAIZEN-PROBE-CONTINUED';
}

record(root, 'hooks', `${o.host}-${o.event}-${o.via}`, {
  at: new Date().toISOString(),
  host: o.host || null,
  event: o.event || null,
  via: o.via || null,
  role: o.role || null,
  action,
  platform: process.platform,
  cwd: process.cwd(),
  script: process.argv[1],
  env: hostEnv(),
  command_found_at: input?.tool_input?.command !== undefined ? 'tool_input.command' : input?.command !== undefined ? 'command' : null,
  transcript: transcript(input?.transcript_path),
  input: input ?? { unparsed_stdin: raw.slice(0, 20000) },
});

if (action === 'block') {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}
