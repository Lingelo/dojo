// /kaizen:setup check: health check without writes; spots a gate left active.
import { SHOP } from '../fixtures.mjs';

export default {
  name: 'setup-check',
  timeoutMinutes: 10,
  files: SHOP,
  steps: [{ run: ['init'] }, { run: ['gate', 'on'] }, { files: { '.kaizen/.keep': '' }, commit: 'chore: kaizen init' }],
  prompt: '/kaizen:setup check',
  checks: [
    ['active gate reported with the fix', (out) => /gate/i.test(out) && /gate off/.test(out)],
    ['report per point', (out) => (out.match(/✔|⚠|✅|❌/g) || []).length >= 3],
    ['no writes', (_, c) => c.git('status', '--porcelain').split('\n').filter((l) => l.trim() && !/eval-output|\.kaizen\/(state|runs)/.test(l)).length === 0],
    ['gate left as is (proposed, not done)', (_, c) => /"active":\s*true/.test(c.kaizen('gate', 'status').out)],
  ],
};
