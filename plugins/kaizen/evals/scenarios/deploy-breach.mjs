// /kaizen:deploy staging : le déploiement part, le signal du plan se dégrade après coup, la
// surveillance le voit et le retour arrière suit, puis le post-mortem est proposé.
import { HEADLESS, SHOP } from '../fixtures.mjs';

const MARK = (what) => `node -e "require('fs').appendFileSync('deployed.log', '${what} ' + process.env.KAIZEN_SHA + '\\n')"`;
// Taux d'erreur : sain tant que rien n'est déployé, dégradé dès que le dernier événement est un déploiement.
const ERROR_RATE = `node -e "const fs=require('fs');const l=fs.existsSync('deployed.log')?fs.readFileSync('deployed.log','utf8').trim().split('\\n').pop():'';console.log(l.startsWith('deploy')?0.08:0.001)"`;

const PLAN = `---
title: Remise fidélité - Plan
type: feat
date: 2026-10-01
topic: remise-fidelite
artifact: kaizen-plan/v1
---
<!-- kaizen:rollout -->
## Déploiement et retour arrière

- **Exposition** : directe.
- **Retour arrière** : redéploiement de la version précédente.
- **Signal** : \`error_rate\` > 2 % → retour arrière.
`;

export default {
  name: 'deploy-breach',
  timeoutMinutes: 12,
  files: {
    ...SHOP,
    '.gitignore': 'deployed.log\n',
    '.kaizen/config.json': {
      verify: { test: 'node --test' },
      deploy: { environments: { staging: { command: MARK('deploy'), rollback: MARK('rollback'), url: 'https://staging.shop.example' } }, watch_minutes: 1 },
      monitor: { signals: { error_rate: { command: ERROR_RATE, max: 0.05 } }, interval_seconds: 5, consecutive: 2 },
    },
  },
  steps: [{ files: { 'docs/plans/2026-10-01-feat-remise-fidelite-plan.md': PLAN, 'src/fidelite.js': 'export const remise = (t) => t * 0.95;\n' }, commit: 'feat(SHOP-20): remise fidélité\n\nUnité U1 du plan docs/plans/2026-10-01-feat-remise-fidelite-plan.md' }],
  prompt: `${HEADLESS} /kaizen:deploy staging`,
  checks: [
    ['déployé et tracé par un tag', (_, c) => /deploy\/staging\//.test(c.git('tag', '-l', 'deploy/*'))],
    ['seuil du plan franchi détecté', (_, c) => c.read('.kaizen/state/monitor.jsonl').includes('"ok":false')],
    ['retour arrière exécuté et tracé', (_, c) => /rollback\/staging\//.test(c.git('tag', '-l', 'rollback/*')) && /rollback/.test(c.read('deployed.log'))],
    ['post-mortem proposé', (out) => /postmortem|post-mortem/i.test(out)],
  ],
};
