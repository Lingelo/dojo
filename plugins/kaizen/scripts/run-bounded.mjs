#!/usr/bin/env node
// Kaizen — lance une commande shell avec un délai, et tue tout son arbre de processus s'il est dépassé.
//
//   node run-bounded.mjs <délai ms> <commande>
//
// `spawnSync(cmd, { shell: true, timeout })` ne tue que le shell : sous Windows, le processus que la
// commande a lancé (node, runner de tests…) survit, consomme du CPU et verrouille des fichiers. Ce
// lanceur, appelé de façon synchrone par `runBounded` (lib.mjs), tue l'arbre entier : `taskkill /T /F`
// sous Windows, le groupe de processus (`detached`) sous POSIX.
// Sorties de la commande transmises telles quelles ; le bilan ({ timedOut, code, signal }) part sur le
// descripteur 3, pour ne pas se confondre avec un code de sortie choisi par la commande.

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

// Lanceur tué de l'extérieur (délai du hook) : il n'abandonne pas la commande derrière lui.
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
