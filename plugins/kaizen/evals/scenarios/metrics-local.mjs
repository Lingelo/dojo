// /kaizen:metrics interprète les indicateurs calculés par le CLI, sans inventer de chiffres.
import { SHOP } from '../fixtures.mjs';

const step = (n, msg) => ({ files: { [`src/f${n}.js`]: `export const f${n} = ${n};\n` }, commit: msg });
export default {
  name: 'metrics-local',
  timeoutMinutes: 15,
  files: SHOP,
  steps: [step(1, 'feat: ajoute f1'), step(2, 'fix: corrige f1'), step(3, 'feat: ajoute f3'), step(4, 'revert: retire f3'), step(5, 'feat: ajoute f5')],
  prompt: '/kaizen:metrics 90d',
  checks: [
    ['cite des indicateurs DORA', (out) => /fréquence de livraison|délai de changement|taux d.échec/i.test(out)],
    ["ne prétend pas avoir des données GitHub absentes", (out) => !/\d+ PR (mergées|fusionnées)/i.test(out) || /sans github|no-github|pas de github|indisponible/i.test(out)],
    ['propose 1 à 3 actions', (out) => /action/i.test(out)],
    ['ne modifie pas le code', (_, c) => c.git('status', '--porcelain', 'src').trim() === ''],
  ],
};
