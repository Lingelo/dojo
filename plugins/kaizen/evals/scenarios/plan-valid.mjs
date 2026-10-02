// Un plan produit en mode autonome doit passer le contrôle déterministe et respecter la constitution.
export default {
  name: 'plan-valid',
  timeoutMinutes: 20,
  files: {
    'package.json': { name: 'blog', type: 'module', scripts: { test: 'node --test' } },
    'src/posts.js': "export const posts = [];\nexport function addPost(title, body) {\n  const post = { id: posts.length + 1, title, body };\n  posts.push(post);\n  return post;\n}\n",
    'src/posts.test.js': "import test from 'node:test'; import assert from 'node:assert';\nimport { addPost } from './posts.js';\ntest('add', () => assert.equal(addPost('a','b').id, 1));\n",
    'CONSTITUTION.md': "---\nname: Blog\nversion: 1.0.0\nratified: 2026-10-01\nlast_amended: 2026-10-01\nartifact: kaizen-constitution/v1\n---\n# Constitution\n\n## Articles\n\n### I. Preuve d'abord — NON NÉGOCIABLE\nTout changement de comportement arrive avec un test qui échouait avant.\n**Contrôle :** chaque unité a-t-elle une stratégie de preuve test d'abord ?\n\n### II. Simplicité\nPas de dépendance ni de mécanisme non demandé.\n**Contrôle :** aucune dépendance ajoutée sans justification ?\n\n## Politique IA\n\n### III. Autonomie des agents\nLes agents ne mergent jamais.\n**Contrôle :** aucune action réservée faite seule ?\n",
  },
  prompt:
    '/kaizen:plan mode:return Ajouter un slug unique à chaque article (dérivé du titre, sans accents, en minuscules avec tirets ; en cas de doublon suffixe -2, -3…) et une fonction findBySlug.',
  checks: [
    ['un plan a été écrit', (_, c) => c.ls('docs/plans').some((f) => f.endsWith('-plan.md'))],
    [
      'plan check passe',
      (_, c) => {
        const plan = c.ls('docs/plans').find((f) => f.endsWith('-plan.md'));
        const r = c.kaizen('plan', 'check', `docs/plans/${plan}`);
        return { ok: r.code === 0, note: r.out.split('\n').slice(0, 6).join(' | ') };
      },
    ],
    ['aucun code de production écrit', (_, c) => c.git('status', '--porcelain', 'src').trim() === ''],
  ],
};
