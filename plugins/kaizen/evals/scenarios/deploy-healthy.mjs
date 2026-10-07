// /kaizen:deploy staging on the happy path: the deployment goes out, the signals stay within their
// thresholds for the whole watch, and nothing is rolled back — a watch must not cry wolf.
import { HEADLESS, SHOP } from '../fixtures.mjs';

const MARK = (what) => `node -e "require('fs').appendFileSync('deployed.log', '${what} ' + process.env.KAIZEN_SHA + '\\n')"`;

export default {
  name: 'deploy-healthy',
  timeoutMinutes: 10,
  files: {
    ...SHOP,
    '.gitignore': 'deployed.log\n',
    '.kaizen/config.json': {
      verify: { test: 'node --test' },
      deploy: { environments: { staging: { command: MARK('deploy'), rollback: MARK('rollback') } }, watch_minutes: 1 },
      monitor: { signals: { error_rate: { command: 'node -e "console.log(0.001)"', max: 0.05 } }, interval_seconds: 5, consecutive: 2 },
    },
  },
  steps: [{ files: { 'src/loyalty.js': 'export const discount = (t) => t * 0.95;\n' }, commit: 'feat(SHOP-21): loyalty discount' }],
  prompt: `${HEADLESS} /kaizen:deploy staging`,
  checks: [
    ['deployed once and traced by a tag', (_, c) => {
      const log = c.read('deployed.log').trim().split('\n').filter(Boolean);
      return { ok: log.length === 1 && log[0].startsWith('deploy ') && /deploy\/staging\//.test(c.git('tag', '-l', 'deploy/*')), note: JSON.stringify(log) };
    }],
    ['signals watched', (_, c) => c.read('.kaizen/state/monitor.jsonl').includes('"ok":true')],
    ['no rollback, no incident', (_, c) => !c.git('tag', '-l', 'rollback/*', 'incident/*').trim() && !/^rollback /m.test(c.read('deployed.log'))],
  ],
};
