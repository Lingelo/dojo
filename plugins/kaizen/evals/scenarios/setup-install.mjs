// /kaizen:setup installs Kaizen in a repo: config, folders, verified commands, findable learnings.
import { SHOP, HEADLESS } from '../fixtures.mjs';

export default {
  name: 'setup-install',
  timeoutMinutes: 15,
  files: { ...SHOP, 'CLAUDE.md': '# CLAUDE.md\n\nOrders library in JavaScript. Tests: `npm test`.\n' },
  prompt: `/kaizen:setup ${HEADLESS}`,
  checks: [
    ['.kaizen/config.json valid', (_, c) => { try { JSON.parse(c.read('.kaizen/config.json')); return true; } catch { return false; } }],
    ['deliverable folders created', (_, c) => ['docs/plans', 'docs/learnings'].every((d) => c.run('test', ['-d', d]).code === 0)],
    ['test command detected and verified', (out, c) => /npm test|node --test/.test(c.kaizen('config').out + out) && c.kaizen('verify').code === 0],
    ['learnings findable from CLAUDE.md', (_, c) => /docs\/learnings/.test(c.read('CLAUDE.md'))],
    ['product code untouched', (_, c) => c.git('status', '--porcelain', 'src', 'package.json').trim() === ''],
  ],
};
