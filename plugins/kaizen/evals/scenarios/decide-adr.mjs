// /kaizen:decide compare de vraies options et écrit un ADR, sans toucher au code.
import { SHOP, HEADLESS } from '../fixtures.mjs';

export default {
  name: 'decide-adr',
  timeoutMinutes: 20,
  files: {
    ...SHOP,
    'README.md': "# Boutique\n\nLes identifiants de commande (entiers séquentiels) sont stockés dans la base partagée par trois services, imprimés sur les factures et communiqués aux clients au téléphone.\n",
  },
  prompt: `/kaizen:decide Faut-il passer les identifiants de commande d'entiers séquentiels à des UUID ? ${HEADLESS}`,
  checks: [
    ['un ADR a été écrit', (_, c) => c.ls('docs/adr').some((f) => f.endsWith('.md'))],
    ['au moins deux options dont le statu quo', (_, c) => { const t = c.read(`docs/adr/${c.ls('docs/adr').find((f) => f.endsWith('.md'))}`); return /uuid/i.test(t) && /(ne rien faire|statu quo|garder|conserver)/i.test(t) && (t.match(/^### [A-D]\. /gm) || []).length >= 2; }],
    ['verdict et confiance', (_, c) => /confiance/i.test(c.read(`docs/adr/${c.ls('docs/adr').find((f) => f.endsWith('.md'))}`))],
    ['aucun code ni dépendance modifiés', (_, c) => c.git('status', '--porcelain', 'src', 'package.json').trim() === ''],
  ],
};
