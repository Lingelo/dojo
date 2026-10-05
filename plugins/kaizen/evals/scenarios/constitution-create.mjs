// /kaizen:constitution creates a valid constitution from the repo, without anyone to answer.
import { SHOP, HEADLESS } from '../fixtures.mjs';

const { 'CONSTITUTION.md': _drop, ...NOCONST } = SHOP;
export default {
  name: 'constitution-create',
  timeoutMinutes: 20,
  files: { ...NOCONST, 'README.md': '# Shop\n\nSmall orders library. A team of 3 people, we ship every week. We already had an incident: a wrong rounding on totals.\n' },
  prompt: `/kaizen:constitution ${HEADLESS}`,
  checks: [
    ['CONSTITUTION.md passes constitution check', (_, c) => { const r = c.kaizen('constitution', 'check'); return { ok: r.code === 0, note: r.out.split('\n')[0] }; }],
    ['5 to 9 articles, each with a Check', (_, c) => { const t = c.read('CONSTITUTION.md'); const a = (t.match(/^### [IVX]+\./gm) || []).length; const k = (t.match(/\*\*(Check|Control):\*\*/g) || []).length; return { ok: a >= 5 && a <= 9 && k >= a, note: `${a} articles, ${k} checks` }; }],
    ['an AI policy', (_, c) => /## AI policy/i.test(c.read('CONSTITUTION.md'))],
  ],
};
