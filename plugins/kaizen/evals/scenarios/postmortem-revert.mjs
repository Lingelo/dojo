// /kaizen:postmortem reconstitue un incident depuis git, sans coupable, avec actions et leçon.
import { SHOP, HEADLESS } from '../fixtures.mjs';

export default {
  name: 'postmortem-revert',
  timeoutMinutes: 20,
  files: SHOP,
  steps: [
    { files: { 'src/orders.js': SHOP['src/orders.js'].replace('Math.round(ht * 1.2)', 'Math.round(ht * 1.02)') }, commit: 'perf: simplifie le calcul de TVA' },
    { files: { 'src/orders.js': SHOP['src/orders.js'] }, commit: 'fix: rétablit la TVA à 20 % (revert du calcul simplifié)' },
  ],
  prompt: `/kaizen:postmortem Hier, pendant 3 h, les totaux TTC affichés étaient faux (TVA à 2 % au lieu de 20 %) ; environ 40 commandes concernées, corrigé par un revert. ${HEADLESS}`,
  checks: [
    ['un post-mortem a été écrit', (_, c) => c.ls('docs/postmortems').some((f) => f.endsWith('.md'))],
    ['chronologie ancrée sur les commits', (_, c) => { const t = c.read(`docs/postmortems/${c.ls('docs/postmortems').find((f) => f.endsWith('.md'))}`); const shas = c.git('log', '--format=%h').trim().split('\n'); return shas.some((s) => t.includes(s)) || /simplifie le calcul de TVA/.test(t); }],
    ['sans coupable : pas de personne mise en cause', (_, c) => !/\bEval\b|eval@example/.test(c.read(`docs/postmortems/${c.ls('docs/postmortems').find((f) => f.endsWith('.md'))}`))],
    ['actions avec porteur', (_, c) => /porteur|responsable|owner/i.test(c.read(`docs/postmortems/${c.ls('docs/postmortems').find((f) => f.endsWith('.md'))}`))],
  ],
};
