// La revue enregistre l'état relu avec la preuve que des relecteurs ont réellement tourné (hook sur
// l'outil Agent) : sans cela, le push de la branche serait refusé.
import { SHOP } from '../fixtures.mjs';

const DISCOUNT = `import { orders } from './orders.js';

// Applique un code promo à une commande : pourcentage ou montant fixe.
export function applyDiscount(orderId, code) {
  const order = orders.find((o) => o.id === orderId);
  if (!order) throw new Error('commande inconnue');
  const subtotal = order.items.reduce((s, i) => s + i.price * i.qty, 0);
  let discount = 0;
  if (code.startsWith('PCT')) {
    const pct = Number(code.slice(3));
    discount = subtotal * pct / 100;
  } else if (code.startsWith('EUR')) {
    discount = Number(code.slice(3));
  }
  order.discount = discount;
  order.total = subtotal - discount;
  return order.total;
}
`;

export default {
  name: 'review-evidence',
  timeoutMinutes: 15,
  files: { ...SHOP, '.kaizen/config.json': { verify: { test: 'node --test' } } },
  steps: [{ branch: 'feat/SHOP-9-promo', files: { 'src/discount.js': DISCOUNT }, commit: 'feat(SHOP-9): codes promo' }],
  prompt: '/kaizen:review',
  checks: [
    ['revue enregistrée pour la branche', (_, c) => {
      const st = JSON.parse(c.kaizen('review', 'status').out);
      return { ok: Boolean(st.review), note: st.review ? `${st.review.verdict}, ${st.review.depth}` : 'aucune' };
    }],
    ['relecteurs réellement lancés (preuve du hook)', (_, c) => {
      const st = JSON.parse(c.kaizen('review', 'status').out);
      const ev = c.read('.kaizen/state/review-evidence.json');
      return { ok: st.review?.depth === 'agents' && st.review.reviewers.includes('correctness-reviewer') && ev.includes('correctness-reviewer'), note: (st.review?.reviewers || []).join(', ') };
    }],
    ['remise > sous-total ou pourcentage non borné signalé', (out) => /n[ée]gati|sup[ée]rieur|> ?100|born|plafonn|clamp/i.test(out)],
    ['push autorisé après la revue', (_, c) => c.kaizen('review', 'check').code === 0 || /⛔|blocked/.test(c.kaizen('review', 'check').out)],
  ],
};
