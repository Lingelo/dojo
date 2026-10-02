// /kaizen:brainstorm sans interlocuteur : écrit un contrat produit (R/AE) avec ses hypothèses, aucun code.
import { SHOP, HEADLESS } from '../fixtures.mjs';

export default {
  name: 'brainstorm-headless',
  timeoutMinutes: 20,
  files: SHOP,
  prompt: `/kaizen:brainstorm J'aimerais que les clients fidèles aient une remise. ${HEADLESS}`,
  checks: [
    ['un plan a été écrit', (_, c) => c.ls('docs/plans').some((f) => f.endsWith('-plan.md'))],
    ['contrat produit avec R-IDs et exemples', (_, c) => { const p = c.read(`docs/plans/${c.ls('docs/plans').find((f) => f.endsWith('-plan.md'))}`); return /kaizen-plan\/v1/.test(p) && /\bR1\./.test(p) && /\bAE1\./.test(p); }],
    ['hypothèses consignées', (_, c) => /hypoth|à clarifier|suppos/i.test(c.read(`docs/plans/${c.ls('docs/plans').find((f) => f.endsWith('-plan.md'))}`))],
    ['aucun code de production écrit', (_, c) => c.git('status', '--porcelain', 'src').trim() === ''],
  ],
};
