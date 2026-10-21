// /kaizen:review launches each reviewer with the policy's model of the cycle's effective profile
// (product here: regular review on sonnet, security on opus) — checked through the evidence hook, not
// through the agent's account. The file touches no risk surface (no auth, no payment), so the profile is
// not raised: a file named auth.js would make the cycle critical and every reviewer opus.
import { SHOP } from '../fixtures.mjs';

const REPORT = `import { execSync } from 'node:child_process';
// Orders of one customer, for the monthly report.
export function exportFor(customer) {
  return execSync(\`grep "\${customer}" data/orders.csv\`).toString();
}
`;

export default {
  name: 'review-models',
  timeoutMinutes: 15,
  files: { ...SHOP, '.kaizen/config.json': { verify: { test: 'node --test' } } },
  steps: [{ branch: 'feat/SHOP-30-report', files: { 'src/report.js': REPORT }, commit: 'feat(SHOP-30): customer report export' }],
  prompt: '/kaizen:review',
  checks: [
    ['reviewers launched with the policy model', (_, c) => {
      let ev = [];
      try {
        ev = JSON.parse(c.read('.kaizen/state/review-evidence.json'));
      } catch {}
      const { effective } = JSON.parse(c.kaizen('profile', '--json').out);
      const policy = JSON.parse(c.kaizen('models', '--json', '--profile', effective).out).agents;
      const wrong = ev.filter((e) => policy[e.reviewer] && policy[e.reviewer].model !== 'inherit' && e.model !== policy[e.reviewer].model);
      return { ok: ev.length > 0 && wrong.length === 0, note: `${effective}: ${ev.map((e) => `${e.reviewer}=${e.model}`).join(', ')}` };
    }],
    ['profile not raised (no risk surface), regular reviewers on sonnet', (_, c) => JSON.parse(c.kaizen('profile', '--json').out).effective === 'product' && /"reviewer":\s*"correctness-reviewer",\s*"model":\s*"sonnet"/.test(c.read('.kaizen/state/review-evidence.json'))],
    ['security reviewer launched (on opus)', (_, c) => /"reviewer":\s*"security-reviewer",\s*"model":\s*"opus"/.test(c.read('.kaizen/state/review-evidence.json'))],
    ['command injection found', (out) => /injection/i.test(out) && /P0/.test(out)],
  ],
};
