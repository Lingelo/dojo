// /kaizen:debug finds the real cause of a rounding bug, fixes it test first, without touching the rest.
import { SHOP } from '../fixtures.mjs';

export default {
  name: 'debug-rounding',
  timeoutMinutes: 20,
  files: {
    ...SHOP,
    'src/orders.js': SHOP['src/orders.js'].replace('return Math.round(net * 1.2);', 'const gross = net * 1.2;\n  return Math.floor(gross);'),
    'BUG.md': 'Ticket SHOP-77: an order of one item at 0.52 € (×2) shows 1.24 € including tax instead of 1.25 €.\n',
  },
  prompt: '/kaizen:debug mode:return Ticket SHOP-77 (see BUG.md): an order of one item at 0.52 € ×2 shows a wrong total including tax (1.24 € instead of 1.25 €).',
  checks: [
    ['npm test is green', (_, c) => c.run('npm', ['test']).code === 0],
    ['the bug is fixed (125 cents)', (_, c) => c.run('node', ['-e', "import('./src/orders.js').then(m=>process.exit(m.totalCents({items:[{priceCents:52,qty:2}]})===125?0:1))"]).code === 0],
    ['a regression test covers the case', (_, c) => /52|125|1[.,]25/.test(c.read('src/orders.test.js'))],
    ['the cause is located (file:line or floor)', (out) => /orders\.js:\d+|Math\.floor|floor/i.test(out)],
  ],
};
