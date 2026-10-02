// /kaizen:constitution crée une constitution valide depuis le dépôt, sans interlocuteur.
import { SHOP, HEADLESS } from '../fixtures.mjs';

const { 'CONSTITUTION.md': _drop, ...NOCONST } = SHOP;
export default {
  name: 'constitution-create',
  timeoutMinutes: 20,
  files: { ...NOCONST, 'README.md': "# Boutique\n\nPetite bibliothèque de commandes. Équipe de 3 personnes, on livre chaque semaine. On a déjà eu un incident : un arrondi faux sur les totaux.\n" },
  prompt: `/kaizen:constitution ${HEADLESS}`,
  checks: [
    ['CONSTITUTION.md passe constitution check', (_, c) => { const r = c.kaizen('constitution', 'check'); return { ok: r.code === 0, note: r.out.split('\n')[0] }; }],
    ['5 à 9 articles, chacun avec un Contrôle', (_, c) => { const t = c.read('CONSTITUTION.md'); const a = (t.match(/^### [IVX]+\./gm) || []).length; const k = (t.match(/\*\*Contrôle :\*\*/g) || []).length; return { ok: a >= 5 && a <= 9 && k >= a, note: `${a} articles, ${k} contrôles` }; }],
    ['une politique IA', (_, c) => /## Politique IA/.test(c.read('CONSTITUTION.md'))],
  ],
};
