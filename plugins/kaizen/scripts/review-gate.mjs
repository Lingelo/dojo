#!/usr/bin/env node
// Kaizen — hook PreToolUse (Bash) : pas de `git push` d'une branche sans revue enregistrée.
//
// La revue « obligatoire » de work/autopilot/ship ne repose plus sur la seule consigne du prompt :
// ce hook refuse le push tant que `/kaizen:review` n'a pas enregistré l'état poussé (`review record`),
// ou que l'utilisateur n'y a pas explicitement renoncé (`review waive --reason`).
// Actif seulement dans un repo initialisé par Kaizen (.kaizen/config.json). Exit 2 = bloquer.
// Toute erreur interne laisse passer : un garde-fou cassé ne doit jamais bloquer le travail.

import { readFileSync } from 'node:fs';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {}

const command = String(input.tool_input?.command || '');
// Filtre bon marché avant tout import : ce hook voit passer chaque commande Bash.
const PUSH = /(^|[\s;&|(])git(\s+-[cC]\s+\S+)*\s+push(\s|$)/;
if (!PUSH.test(command)) process.exit(0);

try {
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { repoRoot } = await import('./lib.mjs');
  const root = repoRoot(input.cwd || process.cwd());
  if (!root || !existsSync(join(root, '.kaizen', 'config.json'))) process.exit(0);
  // Supprimer une branche distante ou ne pousser que des tags ne publie aucun code nouveau.
  const pushPart = command.slice(command.search(PUSH)).split(/[;&|]/)[0];
  if (/\s(--delete|-d|--tags)(\s|$)/.test(pushPart) || /\s:\S+/.test(pushPart)) process.exit(0);

  const { checkPush } = await import('./review-state.mjs');
  const res = checkPush(root);
  if (res.allowed) process.exit(0);

  const { fileURLToPath } = await import('node:url');
  const K = fileURLToPath(new URL('./kaizen.mjs', import.meta.url));
  process.stderr.write(
    `[kaizen] Push refusé sur ${res.branch} : ${res.reason}.\n` +
      'La revue est obligatoire avant tout push (constitution du cycle Kaizen).\n' +
      `- Lance /kaizen:review (elle enregistre l'état relu via \`node "${K}" review record\`), applique les correctifs P0/P1, puis pousse.\n` +
      `- Si l'utilisateur a explicitement demandé de s'en passer dans cette session : \`node "${K}" review waive --reason "<sa demande>"\`.\n` +
      'Ne contourne pas ce garde-fou autrement, et ne le désactive pas sans demande explicite.\n',
  );
  process.exit(2);
} catch (err) {
  process.stderr.write(`[kaizen] review-gate : ${err.message} — push laissé passer.\n`);
  process.exit(0);
}
