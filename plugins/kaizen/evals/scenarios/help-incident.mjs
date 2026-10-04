// /kaizen:help on a repo whose production has an open incident (detected outside the post-deployment
// window): restoring comes before the next feature. Read-only.
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
    { run: ['monitor', 'incident', 'open', '--env', 'production', '--source', 'alertmanager alert', '--summary', 'payment error rate at 7 %'] },
  ],
  prompt: "/kaizen:help I'd like to start on the next feature, what do I run?",
  checks: [
    ['points to the open incident first', (out) => /\/kaizen:monitor production|incident/i.test(out) && /restor|roll ?back/i.test(out)],
    ['quotes the incident symptom', (out) => /payment|7\s?%/i.test(out)],
    ['nothing changed, the incident stays open', (_, c) => c.git('status', '--porcelain').trim() === '' && !/resolve\//.test(c.git('tag', '-l', 'resolve/*'))],
  ],
};
