// A plan produced in autonomous mode must pass the deterministic check and respect the constitution.
export default {
  name: 'plan-valid',
  timeoutMinutes: 20,
  files: {
    'package.json': { name: 'blog', type: 'module', scripts: { test: 'node --test' } },
    'src/posts.js': "export const posts = [];\nexport function addPost(title, body) {\n  const post = { id: posts.length + 1, title, body };\n  posts.push(post);\n  return post;\n}\n",
    'src/posts.test.js': "import test from 'node:test'; import assert from 'node:assert';\nimport { addPost } from './posts.js';\ntest('add', () => assert.equal(addPost('a','b').id, 1));\n",
    'CONSTITUTION.md': "---\nname: Blog\nversion: 1.0.0\nratified: 2026-10-01\nlast_amended: 2026-10-01\nartifact: kaizen-constitution/v1\n---\n# Constitution\n\n## Articles\n\n### I. Evidence first — NON-NEGOTIABLE\nEvery behavior change comes with a test that failed before.\n**Check:** does each unit have a test-first evidence strategy?\n\n### II. Simplicity\nNo dependency or mechanism nobody asked for.\n**Check:** no dependency added without justification?\n\n## AI policy\n\n### III. Agent autonomy\nAgents never merge.\n**Check:** no reserved action taken alone?\n",
  },
  prompt:
    '/kaizen:plan mode:return Add a unique slug to each post (derived from the title, without accents, lowercase with dashes; on a duplicate, suffix -2, -3…) and a findBySlug function.',
  checks: [
    ['a plan was written', (_, c) => c.ls('docs/plans').some((f) => f.endsWith('-plan.md'))],
    [
      'plan check passes',
      (_, c) => {
        const plan = c.ls('docs/plans').find((f) => f.endsWith('-plan.md'));
        const r = c.kaizen('plan', 'check', `docs/plans/${plan}`);
        return { ok: r.code === 0, note: r.out.split('\n').slice(0, 6).join(' | ') };
      },
    ],
    ['no production code written', (_, c) => c.git('status', '--porcelain', 'src').trim() === ''],
  ],
};
