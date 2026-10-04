// /kaizen:review lance chaque relecteur avec le modèle de la politique (profil standard : revue
// courante en sonnet, sécurité en opus) — vérifié par le hook de preuve, pas par le récit de l'agent.
import { SHOP } from '../fixtures.mjs';

const LOGIN = `import { execSync } from 'node:child_process';
export function login(db, email, password) {
  console.log('login', email, password);
  const u = db.users.find((x) => x.email === email);
  return Boolean(u && u.password === password);
}
export function exportFor(customer) {
  return execSync(\`grep "\${customer}" data/orders.csv\`).toString();
}
`;

export default {
  name: 'review-models',
  timeoutMinutes: 15,
  files: { ...SHOP, '.kaizen/config.json': { verify: { test: 'node --test' } } },
  steps: [{ branch: 'feat/SHOP-30-login', files: { 'src/auth.js': LOGIN }, commit: 'feat(SHOP-30): connexion et export' }],
  prompt: '/kaizen:review',
  checks: [
    ['relecteurs lancés avec le modèle de la politique', (_, c) => {
      let ev = [];
      try {
        ev = JSON.parse(c.read('.kaizen/state/review-evidence.json'));
      } catch {}
      const policy = JSON.parse(c.kaizen('models', '--json').out).agents;
      const wrong = ev.filter((e) => policy[e.reviewer] && policy[e.reviewer].model !== 'inherit' && e.model !== policy[e.reviewer].model);
      return { ok: ev.length > 0 && wrong.length === 0, note: ev.map((e) => `${e.reviewer}=${e.model}`).join(', ') };
    }],
    ['relecteur sécurité lancé (en opus)', (_, c) => /"reviewer":\s*"security-reviewer",\s*"model":\s*"opus"/.test(c.read('.kaizen/state/review-evidence.json'))],
    ['injection de commande trouvée', (out) => /injection/i.test(out) && /P0/.test(out)],
  ],
};
