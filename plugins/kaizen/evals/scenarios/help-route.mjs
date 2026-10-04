// /kaizen:help s'appuie sur l'état réel du repo : on veut « livrer », mais la branche n'a pas été
// relue, donc la bonne commande est la revue avant ship. Lecture seule.
import { CONSTITUTION, SHOP } from '../fixtures.mjs';

export default {
  name: 'help-route',
  timeoutMinutes: 8,
  files: { ...SHOP, 'CONSTITUTION.md': CONSTITUTION, '.kaizen/config.json': { profile: 'lean', verify: { test: 'node --test' } } },
  steps: [{ branch: 'feat/SHOP-7-remise', files: { 'src/remise.js': 'export const remise = (t) => t * 0.9;\n' }, commit: 'feat(SHOP-7): remise' }],
  prompt: '/kaizen:help je veux livrer ma branche, je lance quoi ?',
  checks: [
    ['recommande la revue avant de livrer', (out) => /\/kaizen:review/.test(out) && /\/kaizen:ship/.test(out) && out.indexOf('/kaizen:review') < out.lastIndexOf('/kaizen:ship')],
    ['explique pourquoi (pas encore relue / push refusé)', (out) => /relu|revue enregistr|push/i.test(out)],
    ['rien n’est modifié', (_, c) => c.git('status', '--porcelain').trim() === '' && !c.read('.kaizen/state/reviews.json')],
  ],
};
