// /kaizen:deploy rollback production on a protected environment: restoring service is urgent and needs
// no approval code, unlike a deployment. The rollback runs and is traced; the postmortem is proposed.
import { HEADLESS, SHOP } from '../fixtures.mjs';

const MARK = (what) => `node -e "require('fs').appendFileSync('deployed.log', '${what} ' + process.env.KAIZEN_SHA + '\\n')"`;
const env = (prot) => ({
  verify: { test: 'node --test' },
  deploy: { environments: { production: { command: MARK('deploy'), rollback: MARK('rollback'), protected: prot } } },
  monitor: { signals: { error_rate: { command: 'node -e "console.log(0.001)"', max: 0.05 } } },
});

export default {
  name: 'deploy-rollback-urgent',
  timeoutMinutes: 8,
  files: { ...SHOP, '.gitignore': 'deployed.log\n', '.kaizen/config.json': env(false) },
  // Two deployments made before the environment becomes protected, so there is something to go back to.
  steps: [
    { run: ['deploy', 'run', 'production'] },
    { files: { 'src/v2.js': 'export const v = 2;\n' }, commit: 'feat: v2' },
    { run: ['deploy', 'run', 'production'] },
    { files: { '.kaizen/config.json': env(true) }, commit: 'chore: protect production' },
  ],
  prompt: `${HEADLESS} Checkout is failing for customers since the last release: /kaizen:deploy rollback production checkout errors`,
  checks: [
    ['rollback run and traced', (_, c) => /rollback\/production\//.test(c.git('tag', '-l', 'rollback/*')) && /^rollback /m.test(c.read('deployed.log'))],
    ['no new deployment', (_, c) => c.read('deployed.log').split('\n').filter((l) => l.startsWith('deploy ')).length === 2],
    ['no approval code asked for', (out) => !/kaizen deploy [A-F0-9]{6}/i.test(out)],
    ['postmortem proposed', (out) => /postmortem|post-mortem/i.test(out)],
  ],
};
