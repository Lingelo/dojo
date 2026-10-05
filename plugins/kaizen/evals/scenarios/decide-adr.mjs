// /kaizen:decide compares real options and writes an ADR, without touching the code.
import { SHOP, HEADLESS } from '../fixtures.mjs';

const adr = (c) => c.read(`docs/adr/${c.ls('docs/adr').find((f) => f.endsWith('.md'))}`);

export default {
  name: 'decide-adr',
  timeoutMinutes: 20,
  files: {
    ...SHOP,
    'README.md': '# Shop\n\nOrder ids (sequential integers) are stored in the database shared by three services, printed on invoices and given to customers over the phone.\n',
  },
  prompt: `/kaizen:decide Should order ids move from sequential integers to UUIDs? ${HEADLESS}`,
  checks: [
    ['an ADR was written', (_, c) => c.ls('docs/adr').some((f) => f.endsWith('.md'))],
    ['at least two options including the status quo', (_, c) => { const t = adr(c); return /uuid/i.test(t) && /(do nothing|status quo|keep)/i.test(t) && (t.match(/^### [A-D]\. /gm) || []).length >= 2; }],
    ['verdict and confidence', (_, c) => /confidence/i.test(adr(c))],
    ['no code or dependency changed', (_, c) => c.git('status', '--porcelain', 'src', 'package.json').trim() === ''],
  ],
};
