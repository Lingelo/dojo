// /kaizen:postmortem rebuilds an incident from git, blameless, with actions and a learning.
import { SHOP, HEADLESS } from '../fixtures.mjs';

const doc = (c) => c.read(`docs/postmortems/${c.ls('docs/postmortems').find((f) => f.endsWith('.md'))}`);

export default {
  name: 'postmortem-revert',
  timeoutMinutes: 20,
  files: SHOP,
  steps: [
    { files: { 'src/orders.js': SHOP['src/orders.js'].replace('Math.round(net * 1.2)', 'Math.round(net * 1.02)') }, commit: 'perf: simplify the VAT computation' },
    { files: { 'src/orders.js': SHOP['src/orders.js'] }, commit: 'fix: restore 20 % VAT (revert of the simplified computation)' },
  ],
  prompt: `/kaizen:postmortem Yesterday, for 3 hours, the displayed totals including tax were wrong (2 % VAT instead of 20 %); about 40 orders affected, fixed by a revert. ${HEADLESS}`,
  checks: [
    ['a postmortem was written', (_, c) => c.ls('docs/postmortems').some((f) => f.endsWith('.md'))],
    ['timeline anchored on the commits', (_, c) => { const t = doc(c); const shas = c.git('log', '--format=%h').trim().split('\n'); return shas.some((s) => t.includes(s)) || /simplify the VAT computation/.test(t); }],
    ['blameless: no person blamed', (_, c) => !/\bEval\b|eval@example/.test(doc(c))],
    ['actions with owners', (_, c) => /owner|responsible/i.test(doc(c))],
  ],
};
