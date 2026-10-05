// /kaizen:prune-learnings detects a stale learning and a duplicate, without touching product code.
import { SHOP } from '../fixtures.mjs';

const lesson = (title, body, extra = '') => `---
title: ${title}
date: 2026-09-10
category: logic-errors
module: orders
problem_type: logic_error
component: tooling
severity: medium
tags: [rounding, vat]
${extra}---

# ${title}

${body}
`;
export default {
  name: 'prune-learnings-stale',
  timeoutMinutes: 20,
  files: {
    ...SHOP,
    'docs/learnings/logic-errors/vat-rounding.md': lesson('Round the total including tax only once', 'The total including tax must be rounded only once, at the end, in `totalCents` (`src/orders.js`). Rounding each line makes the total drift.\n'),
    'docs/learnings/logic-errors/vat-rounding-bis.md': lesson('Rounding of the total including tax', 'Same finding: round only once, on the total, in `totalCents`.\n'),
    'docs/learnings/logic-errors/loyalty-discount.md': lesson('Loyalty discount applied before VAT', 'The discount is computed in `applyLoyaltyDiscount` in `src/discounts.js`, before VAT.\n'),
  },
  prompt: '/kaizen:prune-learnings mode:auto',
  checks: [
    ['the learning about a vanished file is handled', (out, c) => { const t = c.read('docs/learnings/logic-errors/loyalty-discount.md'); return t === '' || /stale|obsolete|deleted/i.test(t) || /loyalty-discount/.test(out) && /stale|not found|does not exist|doesn't exist|missing/i.test(out); }],
    ['the duplicate is reported or merged', (out, c) => c.read('docs/learnings/logic-errors/vat-rounding-bis.md') === '' || /duplicate|merge|overlap/i.test(out)],
    ['product code untouched', (_, c) => c.git('status', '--porcelain', 'src', 'package.json').trim() === ''],
  ],
};
