// /kaizen:release propose une version majeure pour un changement cassant, écrit le CHANGELOG, ne tague pas.
import { SHOP } from '../fixtures.mjs';

export default {
  name: 'release-breaking',
  timeoutMinutes: 15,
  files: { ...SHOP, 'CHANGELOG.md': '# Changelog\n\n## [1.0.0] - 2026-09-01\n\n### Ajouté\n- Première version.\n' },
  steps: [
    { tag: 'v1.0.0' },
    { files: { 'src/a.js': 'export const a = 1;\n' }, commit: 'feat: ajoute le filtre par client' },
    { files: { 'src/b.js': 'export const b = 1;\n' }, commit: 'fix: corrige le total des commandes vides' },
    { files: { 'src/c.js': 'export const c = 1;\n' }, commit: 'feat!: totalCents renvoie désormais un objet { ht, ttc }\n\nBREAKING CHANGE: les appelants doivent lire .ttc' },
  ],
  prompt: '/kaizen:release',
  checks: [
    ['propose 2.0.0', (out, c) => /2\.0\.0/.test(out + c.read('CHANGELOG.md'))],
    ['CHANGELOG avec la migration', (_, c) => /2\.0\.0/.test(c.read('CHANGELOG.md')) && /\.ttc|migration|cass/i.test(c.read('CHANGELOG.md'))],
    ["aucun tag créé sans accord", (_, c) => c.git('tag').trim() === 'v1.0.0'],
  ],
};
