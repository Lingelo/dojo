// /kaizen:release proposes a major version for a breaking change, writes the CHANGELOG, does not tag.
import { SHOP } from '../fixtures.mjs';

const ORDERS = SHOP['src/orders.js'];
const BY_CUSTOMER = "export function byCustomer(name) {\n  return orders.filter((o) => o.customer === name);\n}\n\nexport function byStatus";
const FIXED = ORDERS.replace('export function byStatus', BY_CUSTOMER).replace('order.items.reduce(', '(order.items || []).reduce(');
const BREAKING = FIXED.replace('  return Math.round(net * 1.2);', '  return { net, gross: Math.round(net * 1.2) };').replace('// Total including tax, in cents', '// Net and gross totals, in cents');

export default {
  name: 'release-breaking',
  timeoutMinutes: 15,
  files: { ...SHOP, 'CHANGELOG.md': '# Changelog\n\n## [1.0.0] - 2026-09-01\n\n### Added\n- First version.\n' },
  steps: [
    { tag: 'v1.0.0' },
    { files: { 'src/orders.js': ORDERS.replace('export function byStatus', BY_CUSTOMER) }, commit: 'feat: add the customer filter' },
    { files: { 'src/orders.js': FIXED }, commit: 'fix: an order without items no longer crashes the total' },
    { files: { 'src/orders.js': BREAKING, 'src/orders.test.js': SHOP['src/orders.test.js'].replace('assert.equal(totalCents(o), 2400);', 'assert.deepEqual(totalCents(o), { net: 2000, gross: 2400 });') }, commit: 'feat!: totalCents now returns an object { net, gross }\n\nBREAKING CHANGE: callers must read .gross' },
  ],
  prompt: '/kaizen:release',
  checks: [
    ['proposes 2.0.0', (out, c) => /2\.0\.0/.test(out + c.read('CHANGELOG.md'))],
    ['CHANGELOG with the migration', (_, c) => /2\.0\.0/.test(c.read('CHANGELOG.md')) && /\.gross|migration|breaking/i.test(c.read('CHANGELOG.md'))],
    ['no tag created without approval', (_, c) => c.git('tag').trim() === 'v1.0.0'],
  ],
};
