// /kaizen:setup audit sur un projet incomplet : diagnostic par priorité, corrections guidées (gabarits
// depuis la stack, plateforme de déploiement reconnue), rien d'existant écrasé.
import { HEADLESS, SHOP } from '../fixtures.mjs';

export default {
  name: 'setup-audit',
  timeoutMinutes: 15,
  files: {
    ...SHOP,
    '.gitignore': 'node_modules\n',
    'fly.toml': 'app = "boutique"\n\n[[http_service.checks]]\n  path = "/health"\n',
    'CLAUDE.md': '# Boutique\n\nRègles maison : ne pas toucher à src/legacy/.\n',
  },
  prompt: `${HEADLESS} /kaizen:setup audit`,
  checks: [
    ['diagnostic par priorité présenté', (out) => /P1|priorit/i.test(out) && /CI|intégration continue/i.test(out)],
    ['CI générée depuis la stack (installation, puis la commande de test détectée)', (_, c) => { const ci = c.read('.github/workflows/ci.yml'); return { ok: /run: npm (ci|install)\n/.test(ci) && /run: npm test/.test(ci), note: ci.split('\n').filter((l) => /run:/.test(l)).join(' | ') }; }],
    ['.env ignoré, contenu existant conservé', (_, c) => /^node_modules\n/.test(c.read('.gitignore')) && /\n\.env\n/.test(c.read('.gitignore'))],
    ['Fly.io reconnu et configuré avec retour arrière et health-check', (_, c) => {
      let cfg = {};
      try {
        cfg = JSON.parse(c.read('.kaizen/config.json'));
      } catch {}
      const p = cfg.deploy?.environments?.production;
      return { ok: p?.command === 'fly deploy' && Boolean(p.rollback) && /boutique\.fly\.dev\/health/.test(cfg.monitor?.signals?.health?.url || ''), note: JSON.stringify(p || null) };
    }],
    ['CLAUDE.md existant conservé', (_, c) => c.read('CLAUDE.md').includes('ne pas toucher à src/legacy/')],
    ['réglage d’administration laissé à l’humain', (out) => /protection|protég/i.test(out)],
  ],
};
