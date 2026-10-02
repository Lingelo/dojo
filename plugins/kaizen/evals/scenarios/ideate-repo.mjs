// /kaizen:ideate écrit 5 à 7 idées ancrées dans le dépôt, avec des rejets motivés.
import { SHOP, HEADLESS } from '../fixtures.mjs';

export default {
  name: 'ideate-repo',
  timeoutMinutes: 20,
  files: SHOP,
  prompt: `/kaizen:ideate rapide ${HEADLESS}`,
  checks: [
    ['un document d’idéation a été écrit', (_, c) => c.ls('docs/ideation').some((f) => f.endsWith('.md'))],
    ['5 à 7 idées retenues', (_, c) => { const t = c.read(`docs/ideation/${c.ls('docs/ideation').find((f) => f.endsWith('.md'))}`); const n = (t.match(/^#{2,4} *\d+[.)]/gm) || t.match(/^\d+\. \*\*/gm) || []).length; return { ok: n >= 5 && n <= 7, note: `${n} idées détectées` }; }],
    ['ancrées dans le code', (_, c) => /orders\.js|totalCents|byStatus/.test(c.read(`docs/ideation/${c.ls('docs/ideation').find((f) => f.endsWith('.md'))}`))],
    ['rejets motivés', (_, c) => /rejet|écart/i.test(c.read(`docs/ideation/${c.ls('docs/ideation').find((f) => f.endsWith('.md'))}`))],
  ],
};
