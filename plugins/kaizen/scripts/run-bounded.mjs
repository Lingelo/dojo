#!/usr/bin/env node
// Kaizen — runs a shell command with a timeout, and kills its whole process tree when it is exceeded.
//
//   node run-bounded.mjs <timeout ms> <command>
//
// `spawnSync(cmd, { shell: true, timeout })` only kills the shell: on Windows, the process the command
// started (node, a test runner…) survives, burns CPU and locks files. This launcher, called
// synchronously by `runBounded` (lib.mjs), kills the whole tree: `taskkill /T /F` on Windows, the
// process group (`detached`) on POSIX.
// The command's output is passed through as is; the summary ({ timedOut, code, signal }) goes to file
// descriptor 3, so it cannot be confused with an exit code chosen by the command.

import { spawn, spawnSync } from 'node:child_process';
import { writeSync } from 'node:fs';

const [delay, command] = process.argv.slice(2);
const win = process.platform === 'win32';
const child = spawn(command, { shell: true, stdio: 'inherit', detached: !win, windowsHide: true });
let timedOut = false;

function killTree() {
  if (!child.pid) return;
  if (win) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {}
  }
}

function report(result) {
  try {
    writeSync(3, JSON.stringify(result));
  } catch {}
}

const timer = setTimeout(() => {
  timedOut = true;
  killTree();
}, Number(delay) || 1);

// Launcher killed from outside (hook timeout): it does not leave the command behind.
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(sig, () => {
    killTree();
    process.exit(1);
  });
}

child.on('error', (err) => {
  clearTimeout(timer);
  process.stderr.write(`${err.message}\n`);
  report({ timedOut: false, code: 127, signal: null });
  process.exit(127);
});

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  report({ timedOut, code, signal });
  process.exit(code ?? 1);
});
