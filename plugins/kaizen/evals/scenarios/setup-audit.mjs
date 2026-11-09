// /kaizen:setup audit on an incomplete project: diagnosis by priority, guided fixes (scaffolds from
// the stack), nothing existing overwritten, and no deployment configuration (removed in 6.0).
import { HEADLESS, SHOP } from '../fixtures.mjs';

export default {
  name: 'setup-audit',
  timeoutMinutes: 15,
  files: {
    ...SHOP,
    '.gitignore': 'node_modules\n',
    'fly.toml': 'app = "shop"\n\n[[http_service.checks]]\n  path = "/health"\n',
    'CLAUDE.md': '# Shop\n\nHouse rules: do not touch src/legacy/.\n',
  },
  prompt: `${HEADLESS} /kaizen:setup audit`,
  checks: [
    ['diagnosis by priority shown', (out) => /P1|priorit/i.test(out) && /CI|continuous integration/i.test(out)],
    ['CI generated from the stack (install, then the detected test command)', (_, c) => { const ci = c.read('.github/workflows/ci.yml'); return { ok: /run: npm (ci|install)\n/.test(ci) && /run: npm test/.test(ci), note: ci.split('\n').filter((l) => /run:/.test(l)).join(' | ') }; }],
    ['.env ignored, existing content kept', (_, c) => /^node_modules\n/.test(c.read('.gitignore')) && /\n\.env\n/.test(c.read('.gitignore'))],
    ['no deployment nor monitoring written to the config (Kaizen 6.0 does not deploy)', (_, c) => {
      let cfg = {};
      try {
        cfg = JSON.parse(c.read('.kaizen/config.json'));
      } catch {}
      return { ok: !('deploy' in cfg) && !('monitor' in cfg), note: Object.keys(cfg).join(', ') };
    }],
    ['existing CLAUDE.md kept', (_, c) => c.read('CLAUDE.md').includes('do not touch src/legacy/')],
    ['administration setting left to the human', (out) => /protection|protect/i.test(out)],
  ],
};
