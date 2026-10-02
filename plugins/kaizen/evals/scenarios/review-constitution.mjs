// La revue applique un article de la constitution que rien d'autre ne vérifie.
export default {
  name: 'review-constitution',
  timeoutMinutes: 12,
  files: {
    'package.json': { name: 'api', type: 'module', scripts: { test: 'node --test' } },
    'src/users.js': 'export function getUser(db, id) {\n  return db.users.find((u) => u.id === id) ?? null;\n}\n',
    'CONSTITUTION.md': "---\nname: Api\nversion: 1.0.0\nratified: 2026-10-01\nlast_amended: 2026-10-01\nartifact: kaizen-constitution/v1\n---\n# Constitution\n\n## Articles\n\n### I. Journalisation structurée — NON NÉGOCIABLE\nLe code de src/ ne journalise jamais avec console.log : il utilise le logger structuré de src/log.js, sans donnée personnelle.\n**Contrôle :** le diff ajoute-t-il un console.log ou une donnée personnelle dans un log ?\n\n## Politique IA\n\n### II. Autonomie des agents\nLes agents ne mergent jamais.\n**Contrôle :** aucune action réservée faite seule ?\n",
  },
  steps: [
    {
      branch: 'feat/API-2-login',
      files: {
        'src/users.js':
          "export function getUser(db, id) {\n  return db.users.find((u) => u.id === id) ?? null;\n}\nexport function login(db, email, password) {\n  console.log('login attempt', email, password);\n  const u = db.users.find((x) => x.email === email);\n  return Boolean(u && u.password === password);\n}\n",
      },
      commit: 'feat(API-2): login',
    },
  ],
  prompt: '/kaizen:review',
  checks: [
    ['article de la constitution cité', (out) => /CONSTITUTION|article I|Journalisation/i.test(out)],
    ['mot de passe journalisé signalé', (out) => /mot de passe|password/i.test(out) && /P0/.test(out)],
  ],
};
