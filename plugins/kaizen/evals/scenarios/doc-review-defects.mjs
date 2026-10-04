// /kaizen:doc-review fixes what is mechanical (traceability) and surfaces the rest: a dependency
// contrary to the constitution, a reference file that does not exist. No code written.
import { SHOP, CSV_PLAN } from '../fixtures.mjs';

const PLAN = 'docs/plans/2026-10-02-001-feat-orders-csv-export-plan.md';
const DEFECTIVE = CSV_PLAN
  // mechanical: U2 no longer declares what it covers → R3/AE3 orphaned for plan check
  .replace('- **Covers:** R3, AE3\n', '')
  // substance: unjustified dependency, contrary to article II
  .replace('- KTD1. Pure function in `src/csv.js`, no dependency; reuses `totalCents`. Covers R1.',
    '- KTD1. Use the `csv-stringify` library (new dependency) to serialize. Covers R1.')
  // substance: a pattern to follow that does not exist
  .replace('- `src/orders.js` — `totalCents` gives the total including tax in cents.',
    '- `src/orders.js` — `totalCents` gives the total including tax in cents.\n- `src/customers-csv.js` — existing export to imitate (headers, formatting).');

export default {
  name: 'doc-review-defects',
  timeoutMinutes: 25,
  files: { ...SHOP, [PLAN]: DEFECTIVE },
  prompt: `/kaizen:doc-review ${PLAN} mode:auto`,
  checks: [
    ['the starting plan is defective', () => DEFECTIVE.includes('csv-stringify') && !/U2[\s\S]*Covers:\*\* R3/.test(DEFECTIVE)],
    ['plan check passes after the mechanical fix', (_, c) => { const r = c.kaizen('plan', 'check', PLAN); return { ok: r.code === 0, note: r.out.split('\n')[0] }; }],
    ['the dependency is tied to the constitution', (out, c) => /csv-stringify/.test(out + c.read(PLAN)) && /(article II|art\. ?II|Simplicity)/i.test(out)],
    ['the nonexistent reference file is reported', (out) => /customers-csv/.test(out) && /(does not exist|doesn't exist|nonexistent|not found|missing|absent)/i.test(out)],
    ['no production code written', (_, c) => c.git('status', '--porcelain', 'src', 'package.json').trim() === ''],
  ],
};
