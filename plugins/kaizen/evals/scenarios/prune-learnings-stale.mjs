// /kaizen:prune-learnings détecte une leçon périmée et un doublon, sans toucher au code produit.
import { SHOP } from '../fixtures.mjs';

const lesson = (title, body, extra = '') => `---
title: ${title}
date: 2026-09-10
category: logic-errors
module: orders
problem_type: logic_error
component: tooling
severity: medium
tags: [arrondi, tva]
${extra}---

# ${title}

${body}
`;
export default {
  name: 'prune-learnings-stale',
  timeoutMinutes: 20,
  files: {
    ...SHOP,
    'docs/learnings/logic-errors/arrondi-tva.md': lesson('Arrondir le TTC une seule fois', "Le total TTC doit être arrondi une seule fois, à la fin, dans `totalCents` (`src/orders.js`). Arrondir chaque ligne fait dériver le total.\n"),
    'docs/learnings/logic-errors/arrondi-tva-bis.md': lesson('Arrondi du total TTC', "Même constat : n'arrondir qu'une fois, sur le total, dans `totalCents`.\n"),
    'docs/learnings/logic-errors/remise-fidelite.md': lesson('Remise fidélité appliquée avant la TVA', "La remise se calcule dans `applyLoyaltyDiscount` de `src/discounts.js`, avant la TVA.\n"),
  },
  prompt: '/kaizen:prune-learnings mode:auto',
  checks: [
    ['la leçon sur un fichier disparu est traitée', (out, c) => { const t = c.read('docs/learnings/logic-errors/remise-fidelite.md'); return t === '' || /stale|périm|obsol|supprim/i.test(t) || /remise-fidelite/.test(out) && /périm|introuvable|n'existe|absent/i.test(out); }],
    ['le doublon est signalé ou fusionné', (out, c) => c.read('docs/learnings/logic-errors/arrondi-tva-bis.md') === '' || /doublon|fusion|chevauch/i.test(out)],
    ['code produit intact', (_, c) => c.git('status', '--porcelain', 'src', 'package.json').trim() === ''],
  ],
};
