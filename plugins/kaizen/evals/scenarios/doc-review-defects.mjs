// /kaizen:doc-review corrige le mécanique (traçabilité) et remonte le reste : dépendance contraire
// à la constitution, fichier de référence inexistant. Aucun code écrit.
import { SHOP, CSV_PLAN } from '../fixtures.mjs';

const PLAN = 'docs/plans/2026-10-02-001-feat-export-csv-commandes-plan.md';
const DEFECTIVE = CSV_PLAN
  // mécanique : U2 ne déclare plus ce qu'elle couvre → R3/AE3 orphelins pour plan check
  .replace('- **Couvre :** R3, AE3\n', '')
  // fond : dépendance non justifiée, contraire à l'article II
  .replace("- KTD1. Fonction pure dans \\`src/csv.js\\`, sans dépendance ; réutilise \\`totalCents\\`. Couvre R1.".replace(/\\`/g, '`'),
    '- KTD1. Utiliser la bibliothèque `csv-stringify` (nouvelle dépendance) pour sérialiser. Couvre R1.')
  // fond : motif à suivre qui n'existe pas
  .replace('- `src/orders.js` — `totalCents` donne le total TTC en centimes.',
    '- `src/orders.js` — `totalCents` donne le total TTC en centimes.\n- `src/customers-csv.js` — export existant à imiter (en-têtes, formatage).');

export default {
  name: 'doc-review-defects',
  timeoutMinutes: 25,
  files: { ...SHOP, [PLAN]: DEFECTIVE },
  prompt: `/kaizen:doc-review ${PLAN} mode:auto`,
  checks: [
    ['le plan de départ est bien défectueux', () => DEFECTIVE.includes('csv-stringify') && !/U2[\s\S]*Couvre :\*\* R3/.test(DEFECTIVE)],
    ['plan check passe après correction mécanique', (_, c) => { const r = c.kaizen('plan', 'check', PLAN); return { ok: r.code === 0, note: r.out.split('\n')[0] }; }],
    ['la dépendance est rattachée à la constitution', (out, c) => /csv-stringify/.test(out + c.read(PLAN)) && /(article II|art\. ?II|Simplicité)/i.test(out)],
    ['le fichier de référence inexistant est signalé', (out) => /customers-csv/.test(out) && /(n'existe|inexistant|introuvable|absent|n.est pas dans)/i.test(out)],
    ['aucun code de production écrit', (_, c) => c.git('status', '--porcelain', 'src', 'package.json').trim() === ''],
  ],
};
