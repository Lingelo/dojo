// /kaizen:constitution creates a valid draft constitution from the repo, without anyone to answer.
import { SHOP, HEADLESS } from '../fixtures.mjs';

const { 'CONSTITUTION.md': _drop, ...NOCONST } = SHOP;
export default {
  name: 'constitution-create',
  timeoutMinutes: 20,
  files: { ...NOCONST, 'README.md': '# Shop\n\nSmall orders library. A team of 3 people, we ship every week. We already had an incident: a wrong rounding on totals.\n' },
  prompt: `/kaizen:constitution ${HEADLESS}`,
  checks: [
    ['CONSTITUTION.md passes constitution check', (_, c) => { const r = c.kaizen('constitution', 'check'); return { ok: r.code === 0, note: r.out.split('\n')[0] }; }],
    // Headless, the skill writes a draft: 3 to 6 evidence-backed articles plus the AI policy article.
    ['4 to 7 articles, each with a Check', (_, c) => { const t = c.read('CONSTITUTION.md'); const a = (t.match(/^### [IVX]+\./gm) || []).length; const k = (t.match(/\*\*(Check|Control):\*\*/g) || []).length; return { ok: a >= 4 && a <= 7 && k >= a, note: `${a} articles, ${k} checks` }; }],
    ['a draft, not ratified', (_, c) => { const t = c.read('CONSTITUTION.md'); return /^status: draft$/m.test(t) && !/^ratified:/m.test(t); }],
    ['every article outside the AI policy cites its evidence', (_, c) => { const t = c.read('CONSTITUTION.md').split(/^## AI policy/im)[0]; const a = (t.match(/^### [IVX]+\./gm) || []).length; const e = (t.match(/_Evidence:_/g) || []).length; return { ok: a >= 3 && e >= a, note: `${a} articles, ${e} evidence lines` }; }],
    ['an AI policy', (_, c) => /## AI policy/i.test(c.read('CONSTITUTION.md'))],
  ],
};
