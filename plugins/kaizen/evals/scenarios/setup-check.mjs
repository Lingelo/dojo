// /kaizen:setup check: health check without writes; spots a quality gate that stopped the last turn.
import { SHOP } from '../fixtures.mjs';

export default {
  name: 'setup-check',
  timeoutMinutes: 10,
  files: SHOP,
  steps: [
    { run: ['init'] },
    { files: { '.kaizen/.keep': '' }, commit: 'chore: kaizen init' },
    { files: { '.kaizen/state/gate.json': { active: true, session: 'earlier', since: new Date().toISOString(), blocks: 2, files: ['src/orders.js'] } } },
  ],
  prompt: '/kaizen:setup check',
  checks: [
    ['blocked gate reported with what to do', (out) => /gate/i.test(out) && /green|verify|gate off/i.test(out)],
    ['report per point', (out) => (out.match(/✔|⚠|✅|❌/g) || []).length >= 3],
    ['no writes', (_, c) => c.git('status', '--porcelain').split('\n').filter((l) => l.trim() && !/eval-output|\.kaizen\/(state|runs)/.test(l)).length === 0],
    ['gate left as is (proposed, not done)', (_, c) => /"active":\s*true/.test(c.kaizen('gate', 'status').out)],
  ],
};
