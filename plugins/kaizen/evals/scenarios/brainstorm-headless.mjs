// /kaizen:brainstorm without anyone to answer: writes a product contract (R/AE) with its assumptions, no code.
import { SHOP, HEADLESS } from '../fixtures.mjs';

const plan = (c) => c.read(`docs/plans/${c.ls('docs/plans').find((f) => f.endsWith('-plan.md'))}`);

export default {
  name: 'brainstorm-headless',
  timeoutMinutes: 20,
  files: SHOP,
  prompt: `/kaizen:brainstorm I'd like loyal customers to get a discount. ${HEADLESS}`,
  checks: [
    ['a plan was written', (_, c) => c.ls('docs/plans').some((f) => f.endsWith('-plan.md'))],
    ['product contract with R ids and examples', (_, c) => { const p = plan(c); return /kaizen-plan\/v1/.test(p) && /\bR1\./.test(p) && /\bAE1\./.test(p); }],
    ['assumptions recorded', (_, c) => /assum|needs clarification|default/i.test(plan(c))],
    ['no production code written', (_, c) => c.git('status', '--porcelain', 'src').trim() === ''],
  ],
};
