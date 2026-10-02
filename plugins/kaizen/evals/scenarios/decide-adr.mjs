// /kaizen:decide compare de vraies options et écrit un ADR, sans toucher au code.
import { SHOP, HEADLESS } from '../fixtures.mjs';

export default {
  name: 'decide-adr',
  timeoutMinutes: 20,
  files: SHOP,
  prompt: `/kaizen:decide Faut-il remplacer node:test par vitest pour nos tests ? ${HEADLESS}`,
  checks: [
    ['un ADR a été écrit', (_, c) => c.ls('docs/adr').some((f) => f.endsWith('.md'))],
    ['au moins deux options dont le statu quo', (_, c) => { const t = c.read(`docs/adr/${c.ls('docs/adr').find((f) => f.endsWith('.md'))}`); return /node:test/.test(t) && /vitest/i.test(t) && /(ne rien faire|statu quo|garder|conserver)/i.test(t); }],
    ['verdict et confiance', (_, c) => /confiance/i.test(c.read(`docs/adr/${c.ls('docs/adr').find((f) => f.endsWith('.md'))}`))],
    ['aucun code ni dépendance modifiés', (_, c) => c.git('status', '--porcelain', 'src', 'package.json').trim() === ''],
  ],
};
