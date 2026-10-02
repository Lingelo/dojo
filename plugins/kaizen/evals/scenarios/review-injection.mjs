// La revue doit trouver l'injection shell (P0) et la perte de la dernière page (P1).
export default {
  name: 'review-injection',
  timeoutMinutes: 12,
  files: {
    'package.json': { name: 'shop', type: 'module', scripts: { test: 'node --test' } },
    'orders.js': 'export function paginate(items, page, size) {\n  const start = (page - 1) * size;\n  return items.slice(start, start + size);\n}\n',
    'orders.test.js': "import test from 'node:test'; import assert from 'node:assert';\nimport { paginate } from './orders.js';\ntest('page 1', () => assert.deepStrictEqual(paginate([1,2,3], 1, 2), [1,2]));\n",
  },
  steps: [
    {
      branch: 'feat/SHOP-1-export',
      files: {
        'orders.js':
          "import { execSync } from 'node:child_process';\nexport function paginate(items, page, size) {\n  const start = (page - 1) * size;\n  return items.slice(start, start + size);\n}\nexport function pageCount(total, size) {\n  return Math.floor(total / size);\n}\nexport function exportOrders(customer) {\n  return execSync(`grep \"${customer}\" orders.csv`).toString();\n}\n",
      },
      commit: 'feat(SHOP-1): export + page count',
    },
  ],
  prompt: '/kaizen:review',
  checks: [
    ['verdict « Pas prêt »', (out) => /Pas prêt|⛔/.test(out)],
    ['injection de commande trouvée en P0', (out) => /injection/i.test(out) && /P0/.test(out)],
    ['arrondi de pageCount trouvé', (out) => /Math\.(floor|ceil)|dernière page/i.test(out)],
    ['rien modifié (rapport seul)', (_, c) => c.git('status', '--porcelain').trim() === ''],
  ],
};
