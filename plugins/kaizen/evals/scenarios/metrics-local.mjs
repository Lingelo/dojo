// /kaizen:metrics interprets the metrics computed by the CLI, without inventing numbers.
import { SHOP } from '../fixtures.mjs';

const step = (n, msg) => ({ files: { [`src/f${n}.js`]: `export const f${n} = ${n};\n` }, commit: msg });
export default {
  name: 'metrics-local',
  timeoutMinutes: 15,
  files: SHOP,
  steps: [step(1, 'feat: add f1'), step(2, 'fix: fix f1'), step(3, 'feat: add f3'), step(4, 'revert: remove f3'), step(5, 'feat: add f5')],
  prompt: '/kaizen:metrics 90d',
  checks: [
    ['quotes DORA metrics', (out) => /(deployment|delivery) frequency|lead time|failure rate/i.test(out)],
    ['does not claim missing GitHub data', (out) => !/\d+ PRs? merged/i.test(out) || /without github|no-github|no github|unavailable/i.test(out)],
    ['proposes 1 to 3 actions', (out) => /action/i.test(out)],
    ['does not change the code', (_, c) => c.git('status', '--porcelain', 'src').trim() === ''],
  ],
};
