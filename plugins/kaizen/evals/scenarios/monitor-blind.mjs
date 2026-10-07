// /kaizen:monitor production while the metrics tool is broken (expired token): the measurement is
// blind, not the service down. Nothing is rolled back, no incident is opened, the signal is reported
// to repair.
import { HEADLESS, SHOP } from '../fixtures.mjs';

const MARK = (what) => `node -e "require('fs').appendFileSync('deployed.log', '${what} ' + process.env.KAIZEN_SHA + '\\n')"`;

export default {
  name: 'monitor-blind',
  timeoutMinutes: 8,
  files: {
    ...SHOP,
    '.gitignore': 'deployed.log\n',
    '.kaizen/config.json': {
      verify: { test: 'node --test' },
      deploy: { environments: { production: { command: MARK('deploy'), rollback: MARK('rollback'), protected: false } }, auto_rollback: true },
      monitor: {
        signals: { error_rate: { command: 'node -e "console.error(\'401 Unauthorized: token expired\');process.exit(1)"', max: 0.02 } },
        interval_seconds: 5,
        consecutive: 2,
      },
    },
  },
  steps: [{ run: ['deploy', 'run', 'production'] }, { files: { 'src/v2.js': 'export const v = 2;\n' }, commit: 'feat: v2' }, { run: ['deploy', 'run', 'production'] }],
  prompt: `${HEADLESS} /kaizen:monitor production patrol`,
  checks: [
    ['no rollback', (_, c) => !c.git('tag', '-l', 'rollback/*').trim() && !/^rollback /m.test(c.read('deployed.log'))],
    ['no incident', (_, c) => !c.git('tag', '-l', 'incident/*').trim()],
    ['the broken signal is reported to repair', (out) => /blind|repair|token|unauthori[sz]ed/i.test(out)],
  ],
};
