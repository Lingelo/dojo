#!/usr/bin/env node
// Kaizen — hook Stop : refuse de terminer tant que les vérifications sont rouges
// pendant un /kaizen:work (ou /kaizen:autopilot). Inactif en dehors : il ne coûte rien.
//
// Activation : `kaizen.mjs gate on` (posé par /kaizen:work), retrait : `gate off`.
// Exit 0 = laisser terminer ; exit 2 = bloquer (le message stderr est renvoyé à Claude).
// Après `gate.max_blocks` blocages consécutifs, le hook laisse passer en le signalant,
// pour qu'un échec hors de portée ne piège jamais la session dans une boucle.

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, repoRoot, runVerify } from './lib.mjs';

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

const input = readStdin();
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

const config = loadConfig(root);
if (config.gate.enabled === false) process.exit(0);

// Un /kaizen:work interrompu ne doit pas laisser le garde-fou actif indéfiniment.
const maxAgeMs = Number(config.gate.max_age_hours ?? 24) * 3600 * 1000;
if (state.since && Date.now() - Date.parse(state.since) > maxAgeMs) {
  rmSync(stateFile, { force: true });
  process.stderr.write(`[kaizen] Garde-fou expiré (actif depuis ${state.since}) : désactivé.\n`);
  process.exit(0);
}

const results = runVerify(root);
if (!results.length) process.exit(0);

const failed = results.filter((r) => !r.ok);
if (!failed.length) {
  if (state.blocks) writeFileSync(stateFile, `${JSON.stringify({ ...state, blocks: 0 }, null, 2)}\n`);
  process.exit(0);
}

const max = Number(config.gate.max_blocks ?? 3);
const blocks = (state.blocks || 0) + 1;
writeFileSync(stateFile, `${JSON.stringify({ ...state, blocks, last_failure: new Date().toISOString() }, null, 2)}\n`);

const report = failed
  .map((r) => `✘ ${r.name} — \`${r.command}\` (exit ${r.exit})\n${r.output.split('\n').slice(-25).join('\n')}`)
  .join('\n\n');

if (blocks > max) {
  process.stderr.write(
    `[kaizen] Garde-fou : ${failed.length} vérification(s) toujours rouge(s) après ${max} tentatives — je laisse terminer.\n` +
      `Signale explicitement à l'utilisateur ce qui reste rouge et pourquoi, sans prétendre que le travail est vérifié.\n`,
  );
  process.exit(0);
}

process.stderr.write(
  `[kaizen] Garde-fou qualité (${blocks}/${max}) : le travail en cours n'est pas vert.\n\n${report}\n\n` +
    `Corrige la cause racine (pas le test) puis termine. Si l'échec est hors du périmètre du plan, ` +
    `lance \`node "${fileURLToPath(new URL('./kaizen.mjs', import.meta.url))}" gate off\` et explique pourquoi à l'utilisateur.\n`,
);
process.exit(2);
