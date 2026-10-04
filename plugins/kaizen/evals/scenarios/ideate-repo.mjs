// /kaizen:ideate writes 5 to 7 ideas grounded in the repo, with motivated rejections.
import { SHOP, HEADLESS } from '../fixtures.mjs';

const doc = (c) => c.read(`docs/ideation/${c.ls('docs/ideation').find((f) => f.endsWith('.md'))}`);

export default {
  name: 'ideate-repo',
  timeoutMinutes: 20,
  files: SHOP,
  prompt: `/kaizen:ideate quick ${HEADLESS}`,
  checks: [
    ['an ideation document was written', (_, c) => c.ls('docs/ideation').some((f) => f.endsWith('.md'))],
    ['5 to 7 ideas kept', (_, c) => { const t = doc(c); const n = (t.match(/^#{2,4} *\d+[.)]/gm) || t.match(/^\d+\. \*\*/gm) || []).length; return { ok: n >= 5 && n <= 7, note: `${n} ideas detected` }; }],
    ['grounded in the code', (_, c) => /orders\.js|totalCents|byStatus/.test(doc(c))],
    ['motivated rejections', (_, c) => /reject/i.test(doc(c))],
  ],
};
