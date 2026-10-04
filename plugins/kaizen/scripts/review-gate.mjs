#!/usr/bin/env node
// Kaizen — hook PreToolUse (Bash) : pas de `git push` d'une branche sans revue enregistrée.
//
// La revue « obligatoire » de work/autopilot/ship ne repose plus sur la seule consigne du prompt :
// ce hook refuse le push tant que `/kaizen:review` n'a pas enregistré l'état poussé (`review record`),
// ou que l'utilisateur n'y a pas lui-même renoncé (`review waive`, confirmé par son message).
// Il refuse aussi l'écriture directe des fichiers d'état de revue et l'appel manuel des hooks de preuve :
// ces états ne s'écrivent que par le CLI et les hooks.
// Actif seulement dans un repo initialisé par Kaizen (.kaizen/config.json). Exit 2 = bloquer.
// Toute erreur interne laisse passer : un garde-fou cassé ne doit jamais bloquer le travail.

import { readFileSync } from 'node:fs';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {}

const command = String(input.tool_input?.command || '');
const filePath = String(input.tool_input?.file_path || input.tool_input?.notebook_path || '');
// Filtres bon marché avant tout import : ce hook voit passer chaque commande Bash et chaque écriture.
const PUSH = /(^|[\s;&|(])git(\s+-[cC]\s+\S+)*\s+push(\s|$)/;
const TAMPER = /(reviews|review-evidence|waivers)\.json|review-hooks\.mjs/;
const tamper = input.tool_name === 'Bash'
  ? TAMPER.test(command) && /\.kaizen|review-hooks\.mjs/.test(command)
  : /\.kaizen[\\/]state[\\/]/.test(filePath) && TAMPER.test(filePath);
if (!tamper && (input.tool_name && input.tool_name !== 'Bash' || !PUSH.test(command))) process.exit(0);

try {
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { repoRoot } = await import('./lib.mjs');
  const root = repoRoot(input.cwd || process.cwd());
  if (!root || !existsSync(join(root, '.kaizen', 'config.json'))) process.exit(0);
  if (tamper) {
    process.stderr.write(
      '[kaizen] Les preuves de revue (.kaizen/state/reviews.json, review-evidence.json, waivers.json) ne s\'écrivent ' +
        'que par le CLI et les hooks. Pour lire l\'état : `review status`. Pour renoncer à la revue : `review waive --reason`, ' +
        'confirmé par l\'utilisateur.\n',
    );
    process.exit(2);
  }
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
      `- Si l'utilisateur a explicitement demandé de s'en passer : \`node "${K}" review waive --reason "<sa demande>"\`, ` +
      "puis demande-lui de taper lui-même le message de confirmation affiché (kaizen waive <code>) ; tu ne peux pas le confirmer à sa place.\n" +
      'Ne contourne pas ce garde-fou autrement, et ne le désactive pas sans demande explicite.\n',
  );
  process.exit(2);
} catch (err) {
  process.stderr.write(`[kaizen] review-gate : ${err.message} — push laissé passer.\n`);
  process.exit(0);
}
