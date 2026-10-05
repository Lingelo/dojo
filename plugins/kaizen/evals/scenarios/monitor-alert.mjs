// /kaizen:monitor receives an Alertmanager alert fired after the last deployment: the incident is
// recorded with the alert's time, the rollback follows (prudent default with nobody to answer), then
// the postmortem is proposed.
import { HEADLESS, SHOP } from '../fixtures.mjs';

const MARK = (what) => `node -e "require('fs').appendFileSync('deployed.log', '${what} ' + process.env.KAIZEN_SHA + '\\n')"`;
// Alert later than the steps' deployments (run just before the session).
const STARTS = new Date(Date.now() + 5000).toISOString().replace(/\.\d+Z$/, 'Z');

export default {
  name: 'monitor-alert',
  timeoutMinutes: 10,
  files: {
    ...SHOP,
    '.gitignore': 'deployed.log\nerror_rate.txt\n',
    'error_rate.txt': '0.07\n',
    '.kaizen/config.json': {
      verify: { test: 'node --test' },
      deploy: { environments: { production: { command: MARK('deploy'), rollback: MARK('rollback'), protected: false } } },
      // Error rate read from a metrics export (here a file): degraded since the alert.
      monitor: { signals: { error_rate: { command: 'node -e "console.log(require(\'fs\').readFileSync(\'error_rate.txt\', \'utf8\').trim())"', max: 0.02 } } },
    },
    'alert.json': {
      status: 'firing',
      commonLabels: { alertname: 'PaymentErrors', severity: 'critical' },
      commonAnnotations: { summary: 'Payment error rate at 7 %' },
      alerts: [{ status: 'firing', labels: { alertname: 'PaymentErrors' }, startsAt: STARTS }],
    },
  },
  steps: [{ run: ['deploy', 'run', 'production'] }, { files: { 'src/v2.js': 'export const v = 2;\n' }, commit: 'feat: v2' }, { run: ['deploy', 'run', 'production'] }],
  prompt: `${HEADLESS} /kaizen:monitor production — an alert from the team just arrived, its payload is in alert.json.`,
  checks: [
    ['incident recorded, dated by the alert', (_, c) => {
      const list = JSON.parse(c.kaizen('monitor', 'incident', 'list', '--env', 'production').out || '[]');
      return { ok: list.length === 1 && list[0].detected_at === STARTS, note: JSON.stringify(list.map((i) => [i.detected_at, i.source, i.resolved_by])) };
    }],
    ['rollback run and traced', (_, c) => /rollback\/production\//.test(c.git('tag', '-l', 'rollback/*')) && /^rollback /m.test(c.read('deployed.log'))],
    ['the rollback resolves the incident', (_, c) => JSON.parse(c.kaizen('monitor', 'incident', 'list', '--env', 'production').out || '[]')[0]?.resolved_by === 'rollback'],
    ['postmortem proposed', (out) => /postmortem|post-mortem/i.test(out)],
  ],
};
