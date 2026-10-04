// /kaizen:help sur un repo dont la production a un incident ouvert (détecté hors de la fenêtre après
// déploiement) : rétablir passe avant la fonctionnalité suivante. Lecture seule.
import { CONSTITUTION, SHOP } from '../fixtures.mjs';

const MARK = `node -e "require('fs').appendFileSync('deployed.log', process.env.KAIZEN_SHA + '\\n')"`;

export default {
  name: 'help-incident',
  timeoutMinutes: 8,
  files: {
    ...SHOP,
    'CONSTITUTION.md': CONSTITUTION,
    '.gitignore': 'deployed.log\n',
    '.kaizen/config.json': { profile: 'lean', verify: { test: 'node --test' }, deploy: { environments: { production: { command: MARK, rollback: MARK, protected: false } } } },
  },
  steps: [
    { run: ['deploy', 'run', 'production'] },
    { run: ['monitor', 'incident', 'open', '--env', 'production', '--source', 'alerte alertmanager', '--summary', 'taux d’erreur du paiement à 7 %'] },
  ],
  prompt: '/kaizen:help je voudrais attaquer la prochaine fonctionnalité, je lance quoi ?',
  checks: [
    ['oriente d’abord vers l’incident ouvert', (out) => /\/kaizen:monitor production|incident/i.test(out) && /rétabli|retour arrière|rollback/i.test(out)],
    ['cite le symptôme de l’incident', (out) => /paiement|7\s?%/i.test(out)],
    ['rien n’est modifié, l’incident reste ouvert', (_, c) => c.git('status', '--porcelain').trim() === '' && !/resolve\//.test(c.git('tag', '-l', 'resolve/*'))],
  ],
};
