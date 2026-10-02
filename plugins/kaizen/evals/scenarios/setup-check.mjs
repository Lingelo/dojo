// /kaizen:setup check : bilan de santé sans écriture ; repère un garde-fou resté actif.
import { SHOP } from '../fixtures.mjs';

export default {
  name: 'setup-check',
  timeoutMinutes: 10,
  files: SHOP,
  steps: [{ run: ['init'] }, { run: ['gate', 'on'] }, { files: { '.kaizen/.keep': '' }, commit: 'chore: kaizen init' }],
  prompt: '/kaizen:setup check',
  checks: [
    ['garde-fou actif signalé avec la correction', (out) => /garde-fou|gate/i.test(out) && /gate off/.test(out)],
    ['rapport par point', (out) => (out.match(/✔|⚠|✅|❌/g) || []).length >= 3],
    ['aucune écriture', (_, c) => c.git('status', '--porcelain').split('\n').filter((l) => l.trim() && !/eval-output|\.kaizen\/(state|runs)/.test(l)).length === 0],
    ['garde-fou laissé tel quel (proposé, pas fait)', (_, c) => /"active":\s*true/.test(c.kaizen('gate', 'status').out)],
  ],
};
