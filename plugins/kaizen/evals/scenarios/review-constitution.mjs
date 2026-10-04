// The review applies a constitution article that nothing else checks.
export default {
  name: 'review-constitution',
  timeoutMinutes: 12,
  files: {
    'package.json': { name: 'api', type: 'module', scripts: { test: 'node --test' } },
    'src/users.js': 'export function getUser(db, id) {\n  return db.users.find((u) => u.id === id) ?? null;\n}\n',
    'CONSTITUTION.md': "---\nname: Api\nversion: 1.0.0\nratified: 2026-10-01\nlast_amended: 2026-10-01\nartifact: kaizen-constitution/v1\n---\n# Constitution\n\n## Articles\n\n### I. Structured logging — NON-NEGOTIABLE\nCode in src/ never logs with console.log: it uses the structured logger from src/log.js, without personal data.\n**Check:** does the diff add a console.log or personal data in a log?\n\n## AI policy\n\n### II. Agent autonomy\nAgents never merge.\n**Check:** no reserved action taken alone?\n",
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
    ['constitution article cited', (out) => /CONSTITUTION|article I|Structured logging/i.test(out)],
    ['logged password reported', (out) => /password/i.test(out) && /P0/.test(out)],
  ],
};
