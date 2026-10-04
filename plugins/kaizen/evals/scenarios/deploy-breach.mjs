// /kaizen:deploy staging: the deployment goes out, the plan's signal degrades afterwards, the watch
// sees it and the rollback follows, then the postmortem is proposed.
import { HEADLESS, SHOP } from '../fixtures.mjs';

const MARK = (what) => `node -e "require('fs').appendFileSync('deployed.log', '${what} ' + process.env.KAIZEN_SHA + '\\n')"`;
// Error rate: healthy as long as nothing is deployed, degraded as soon as the last event is a deployment.
const ERROR_RATE = `node -e "const fs=require('fs');const l=fs.existsSync('deployed.log')?fs.readFileSync('deployed.log','utf8').trim().split('\\n').pop():'';console.log(l.startsWith('deploy')?0.08:0.001)"`;

const PLAN = `---
title: Loyalty discount - Plan
type: feat
date: 2026-10-01
topic: loyalty-discount
artifact: kaizen-plan/v1
---
<!-- kaizen:rollout -->
## Rollout and rollback

- **Exposure**: direct.
- **Rollback**: redeploy the previous version.
- **Signal**: \`error_rate\` > 2 % → rollback.
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
  steps: [{ files: { 'docs/plans/2026-10-01-feat-loyalty-discount-plan.md': PLAN, 'src/loyalty.js': 'export const discount = (t) => t * 0.95;\n' }, commit: 'feat(SHOP-20): loyalty discount\n\nUnit U1 of plan docs/plans/2026-10-01-feat-loyalty-discount-plan.md' }],
  prompt: `${HEADLESS} /kaizen:deploy staging`,
  checks: [
    ['deployed and traced by a tag', (_, c) => /deploy\/staging\//.test(c.git('tag', '-l', 'deploy/*'))],
    ['plan threshold breach detected', (_, c) => c.read('.kaizen/state/monitor.jsonl').includes('"ok":false')],
    ['rollback run and traced', (_, c) => /rollback\/staging\//.test(c.git('tag', '-l', 'rollback/*')) && /rollback/.test(c.read('deployed.log'))],
    ['postmortem proposed', (out) => /postmortem|post-mortem/i.test(out)],
  ],
};
