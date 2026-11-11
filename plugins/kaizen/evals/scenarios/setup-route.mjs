// /kaizen:setup says where the repo stands: we want to "ship", but the branch has not been reviewed,
// so the right command is the review before ship. Nothing is reviewed or pushed on the way.
import { SHOP } from '../fixtures.mjs';

export default {
  name: 'setup-route',
  timeoutMinutes: 8,
  files: { ...SHOP, '.kaizen/config.json': { verify: { test: 'node --test' } } },
  steps: [{ branch: 'feat/SHOP-7-discount', files: { 'src/discount.js': 'export const discount = (t) => t * 0.9;\n' }, commit: 'feat(SHOP-7): discount' }],
  prompt: '/kaizen:setup check I want to ship my branch, what do I run?',
  checks: [
    ['recommends the review before shipping', (out) => /\/kaizen:review/.test(out) && /\/kaizen:ship/.test(out) && out.indexOf('/kaizen:review') < out.lastIndexOf('/kaizen:ship')],
    ['explains why (not reviewed yet / push refused)', (out) => /review|push/i.test(out)],
    ['nothing changed', (_, c) => c.git('status', '--porcelain').trim() === '' && !c.read('.kaizen/state/reviews.json')],
  ],
};
