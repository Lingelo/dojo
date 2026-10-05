// The review records the reviewed state with evidence that reviewers actually ran (hook on the Agent
// tool): without it, the branch push would be refused.
import { SHOP } from '../fixtures.mjs';

const DISCOUNT = `import { orders } from './orders.js';

// Applies a promo code to an order: percentage or fixed amount.
export function applyDiscount(orderId, code) {
  const order = orders.find((o) => o.id === orderId);
  if (!order) throw new Error('unknown order');
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
  steps: [{ branch: 'feat/SHOP-9-promo', files: { 'src/discount.js': DISCOUNT }, commit: 'feat(SHOP-9): promo codes' }],
  prompt: '/kaizen:review',
  checks: [
    ['review recorded for the branch', (_, c) => {
      const st = JSON.parse(c.kaizen('review', 'status').out);
      return { ok: Boolean(st.review), note: st.review ? `${st.review.verdict}, ${st.review.depth}` : 'none' };
    }],
    ['reviewers actually launched (hook evidence)', (_, c) => {
      const st = JSON.parse(c.kaizen('review', 'status').out);
      const ev = c.read('.kaizen/state/review-evidence.json');
      return { ok: st.review?.depth === 'agents' && st.review.reviewers.includes('correctness-reviewer') && ev.includes('correctness-reviewer'), note: (st.review?.reviewers || []).join(', ') };
    }],
    ['discount > subtotal or unbounded percentage reported', (out) => /negative|exceed|greater than|> ?100|bound|cap|clamp/i.test(out)],
    ['push allowed after the review', (_, c) => c.kaizen('review', 'check').code === 0 || /⛔|blocked/.test(c.kaizen('review', 'check').out)],
  ],
};
