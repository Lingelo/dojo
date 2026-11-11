// Demo project shared by the evaluations: a small shop (orders, totals), in dependency-free
// JavaScript, tested with node:test.

export const SHOP = {
  'package.json': { name: 'shop', version: '1.0.0', type: 'module', scripts: { test: 'node --test' } },
  'src/orders.js': `export const orders = [];

export function addOrder({ customer, items, status = 'new' }) {
  const order = { id: orders.length + 1, customer, items, status, date: '2026-09-15' };
  orders.push(order);
  return order;
}

// Total including tax, in cents: unit price (cents) × quantity, 20 % VAT.
export function totalCents(order) {
  const net = order.items.reduce((sum, it) => sum + it.priceCents * it.qty, 0);
  return Math.round(net * 1.2);
}

export function byStatus(status) {
  return orders.filter((o) => o.status === status);
}
`,
  'src/orders.test.js': `import test from 'node:test';
import assert from 'node:assert/strict';
import { addOrder, totalCents, byStatus } from './orders.js';

test('total including tax', () => {
  const o = addOrder({ customer: 'Ana', items: [{ priceCents: 1000, qty: 2 }] });
  assert.equal(totalCents(o), 2400);
});

test('filter by status', () => {
  addOrder({ customer: 'Bo', items: [], status: 'shipped' });
  assert.equal(byStatus('shipped').length, 1);
});
`,
  '.gitignore': 'node_modules\n',
};

export const HEADLESS = 'Nobody is available to answer your questions during this session: whenever you would ask, take your recommendation and record it as an assumption in the deliverable.';
