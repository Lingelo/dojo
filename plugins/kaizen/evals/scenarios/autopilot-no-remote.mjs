// /kaizen:autopilot without a remote or gh: goes as far as the local commit, then stops honestly (no invented PR).
import { SHOP } from '../fixtures.mjs';

export default {
  name: 'autopilot-no-remote',
  timeoutMinutes: 40,
  files: SHOP,
  prompt: '/kaizen:autopilot Add a countByStatus() function returning an object { status: count } for all orders.',
  checks: [
    ['countByStatus implemented and tested', (_, c) => /countByStatus/.test(c.read('src/orders.js')) && /countByStatus/.test(c.read('src/orders.test.js') + c.lsRead('src', /test/))],
    ['a plan was written (no shortcut)', (_, c) => c.ls('docs/plans').some((f) => f.endsWith('-plan.md'))],
    ['a review ran', (out, c) => c.ls('.kaizen/state/reviews').length > 0 || c.ls('.kaizen/runs').length > 0 || /review\s*:\s*(✅|\d+ |none)|kaizen:review/i.test(out)],
    ['npm test is green', (_, c) => c.run('npm', ['test']).code === 0],
    ['work committed outside main', (_, c) => c.git('branch', '--show-current').trim() !== 'main' && c.git('log', '--oneline', 'main..HEAD').trim() !== ''],
    ['does not claim to have opened a PR', (out) => !/PR (#\d+ )?(opened|created)|pull request (opened|created)|github\.com\/.+\/pull\/\d+/i.test(out.split('\n').slice(-40).join('\n')) || /impossible|cannot|no remote|not authenticated/i.test(out)],
  ],
};
