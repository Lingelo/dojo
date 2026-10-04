#!/usr/bin/env node
// Kaizen — hooks qui fournissent à la revue des preuves que l'agent ne peut pas déclarer lui-même.
//
//   --evidence  (PostToolUse, outil Agent/Task) : consigne chaque relecteur de code Kaizen réellement
//               lancé ; `review record` l'exige.
//   --confirm   (UserPromptSubmit) : un message de l'utilisateur contenant `kaizen waive <code>`
//               confirme la renonciation à la revue demandée par `review waive`.
// Toujours exit 0 : ces hooks observent, ils ne bloquent rien. Inactifs hors d'un repo Kaizen.

import { readFileSync } from 'node:fs';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {}

const mode = process.argv.includes('--confirm') ? 'confirm' : 'evidence';
const WAIVE = /\bkaizen\s+waive\s+([A-F0-9]{6})\b/i;

// Filtres bon marché avant tout import : ces hooks voient passer chaque message et chaque sous-agent.
if (mode === 'confirm' && !WAIVE.test(String(input.prompt || ''))) process.exit(0);
if (mode === 'evidence' && !/^(Agent|Task)$/.test(String(input.tool_name || ''))) process.exit(0);

try {
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { repoRoot } = await import('./lib.mjs');
  const root = repoRoot(input.cwd || process.cwd());
  if (!root || !existsSync(join(root, '.kaizen', 'config.json'))) process.exit(0);
  const state = await import('./review-state.mjs');

  if (mode === 'evidence') {
    const reviewer = state.reviewerOf(input.tool_input);
    if (reviewer) state.addEvidence(root, { reviewer, session: input.session_id || null });
  } else {
    const code = WAIVE.exec(String(input.prompt))[1];
    const entry = state.confirmWaiver(root, code, { session: input.session_id || null });
    // Sur UserPromptSubmit, la sortie standard est ajoutée au contexte de Claude.
    process.stdout.write(
      entry
        ? `[kaizen] Renonciation à la revue confirmée par l'utilisateur pour ${entry.branch} (raison : ${entry.reason}). ` +
            'Le push est autorisé ; la PR doit le dire dans une section « Revue écartée ».\n'
        : `[kaizen] Code de renonciation ${code} inconnu ou expiré (30 min) : relance \`review waive --reason\` si l'utilisateur le souhaite toujours.\n`,
    );
  }
} catch (err) {
  process.stderr.write(`[kaizen] review-hooks : ${err.message}\n`);
}
process.exit(0);
