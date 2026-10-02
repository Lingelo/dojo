// /kaizen:debug trouve la vraie cause d'un bug d'arrondi, corrige test d'abord, sans toucher au reste.
import { SHOP } from '../fixtures.mjs';

export default {
  name: 'debug-rounding',
  timeoutMinutes: 20,
  files: {
    ...SHOP,
    'src/orders.js': SHOP['src/orders.js'].replace('return Math.round(ht * 1.2);', 'const ttc = ht * 1.2;\n  return Math.floor(ttc);'),
    'BUG.md': "Ticket SHOP-77 : une commande d'un article à 0,35 € (×3) affiche 1,25 € TTC au lieu de 1,26 €.\n",
  },
  prompt: "/kaizen:debug mode:return Ticket SHOP-77 (voir BUG.md) : une commande d'un article à 0,35 € ×3 affiche un total TTC faux (1,25 € au lieu de 1,26 €).",
  checks: [
    ['npm test est vert', (_, c) => c.run('npm', ['test']).code === 0],
    ['le bug est corrigé (126 centimes)', (_, c) => c.run('node', ['-e', "import('./src/orders.js').then(m=>process.exit(m.totalCents({items:[{priceCents:35,qty:3}]})===126?0:1))"]).code === 0],
    ['un test de non-régression couvre le cas', (_, c) => /35|126|1,26/.test(c.read('src/orders.test.js'))],
    ['la cause est localisée (fichier:ligne ou floor)', (out) => /orders\.js:\d+|Math\.floor|floor/i.test(out)],
  ],
};
