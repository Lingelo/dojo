// /kaizen:release propose une version majeure pour un changement cassant, écrit le CHANGELOG, ne tague pas.
import { SHOP } from '../fixtures.mjs';

const ORDERS = SHOP['src/orders.js'];
const FIXED = ORDERS.replace('export function byStatus', "export function byCustomer(name) {\n  return orders.filter((o) => o.customer === name);\n}\n\nexport function byStatus").replace('order.items.reduce(', '(order.items || []).reduce(');
const BREAKING = FIXED.replace('  return Math.round(ht * 1.2);', '  return { ht, ttc: Math.round(ht * 1.2) };').replace('// Total TTC en centimes', '// Totaux HT et TTC en centimes');

export default {
  name: 'release-breaking',
  timeoutMinutes: 15,
  files: { ...SHOP, 'CHANGELOG.md': '# Changelog\n\n## [1.0.0] - 2026-09-01\n\n### Ajouté\n- Première version.\n' },
  steps: [
    { tag: 'v1.0.0' },
    { files: { 'src/orders.js': ORDERS.replace('export function byStatus', "export function byCustomer(name) {\n  return orders.filter((o) => o.customer === name);\n}\n\nexport function byStatus") }, commit: 'feat: ajoute le filtre par client' },
    { files: { 'src/orders.js': ORDERS.replace('export function byStatus', "export function byCustomer(name) {\n  return orders.filter((o) => o.customer === name);\n}\n\nexport function byStatus").replace('order.items.reduce(', '(order.items || []).reduce(') }, commit: 'fix: une commande sans articles ne fait plus planter le total' },
    { files: { 'src/orders.js': BREAKING, 'src/orders.test.js': SHOP['src/orders.test.js'].replace('assert.equal(totalCents(o), 2400);', 'assert.deepEqual(totalCents(o), { ht: 2000, ttc: 2400 });') }, commit: 'feat!: totalCents renvoie désormais un objet { ht, ttc }\n\nBREAKING CHANGE: les appelants doivent lire .ttc' },
  ],
  prompt: '/kaizen:release',
  checks: [
    ['propose 2.0.0', (out, c) => /2\.0\.0/.test(out + c.read('CHANGELOG.md'))],
    ['CHANGELOG avec la migration', (_, c) => /2\.0\.0/.test(c.read('CHANGELOG.md')) && /\.ttc|migration|cass/i.test(c.read('CHANGELOG.md'))],
    ["aucun tag créé sans accord", (_, c) => c.git('tag').trim() === 'v1.0.0'],
  ],
};
