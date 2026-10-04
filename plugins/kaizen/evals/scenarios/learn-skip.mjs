// Le test de durabilité : une faute de frappe corrigée ne mérite pas de leçon.
export default {
  name: 'learn-skip',
  timeoutMinutes: 8,
  files: { 'README.md': '# Projet\n\nUn petit projt.\n', 'docs/learnings/.gitkeep': '' },
  steps: [{ files: { 'README.md': '# Projet\n\nUn petit projet.\n' }, commit: 'docs: corrige une faute de frappe (projt → projet)' }],
  prompt: "/kaizen:learn mode:auto J'ai corrigé une faute de frappe dans le README (projt → projet).",
  checks: [
    ['signal « Leçon non écrite »', (out) => /Leçon non écrite/i.test(out)],
    ['aucune leçon créée', (_, c) => c.ls('docs/learnings').filter((f) => f.endsWith('.md')).length === 0],
  ],
};
