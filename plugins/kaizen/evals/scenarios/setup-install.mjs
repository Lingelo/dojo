// /kaizen:setup installe Kaizen dans un repo : config, dossiers, commandes vérifiées, leçons trouvables.
import { SHOP, HEADLESS } from '../fixtures.mjs';

export default {
  name: 'setup-install',
  timeoutMinutes: 15,
  files: { ...SHOP, 'CLAUDE.md': '# CLAUDE.md\n\nBibliothèque de commandes en JavaScript. Tests : `npm test`.\n' },
  prompt: `/kaizen:setup ${HEADLESS}`,
  checks: [
    ['.kaizen/config.json valide', (_, c) => { try { JSON.parse(c.read('.kaizen/config.json')); return true; } catch { return false; } }],
    ['dossiers de livrables créés', (_, c) => ['docs/plans', 'docs/solutions'].every((d) => c.run('test', ['-d', d]).code === 0)],
    ['commande de test détectée et vérifiée', (out, c) => /npm test|node --test/.test(c.kaizen('config').out + out) && c.kaizen('verify').code === 0],
    ['leçons trouvables depuis CLAUDE.md', (_, c) => /docs\/solutions/.test(c.read('CLAUDE.md'))],
    ['code produit intact', (_, c) => c.git('status', '--porcelain', 'src', 'package.json').trim() === ''],
  ],
};
