// /kaizen:monitor reçoit une alerte Alertmanager tombée après le dernier déploiement : l'incident
// est tracé avec l'heure de l'alerte, le retour arrière suit (défaut prudent sans personne pour
// répondre), puis le post-mortem est proposé.
import { HEADLESS, SHOP } from '../fixtures.mjs';

const MARK = (what) => `node -e "require('fs').appendFileSync('deployed.log', '${what} ' + process.env.KAIZEN_SHA + '\\n')"`;
// Alerte postérieure aux déploiements des étapes (lancés juste avant la session).
const STARTS = new Date(Date.now() + 5000).toISOString().replace(/\.\d+Z$/, 'Z');

export default {
  name: 'monitor-alert',
  timeoutMinutes: 10,
  files: {
    ...SHOP,
    '.gitignore': 'deployed.log\nerror_rate.txt\n',
    'error_rate.txt': '0.07\n',
    '.kaizen/config.json': {
      verify: { test: 'node --test' },
      deploy: { environments: { production: { command: MARK('deploy'), rollback: MARK('rollback'), protected: false } } },
      // Taux d'erreur lu dans un export de métriques (ici un fichier) : dégradé depuis l'alerte.
      monitor: { signals: { error_rate: { command: 'node -e "console.log(require(\'fs\').readFileSync(\'error_rate.txt\', \'utf8\').trim())"', max: 0.02 } } },
    },
    'alert.json': {
      status: 'firing',
      commonLabels: { alertname: 'PaymentErrors', severity: 'critical' },
      commonAnnotations: { summary: 'Taux d’erreur du paiement à 7 %' },
      alerts: [{ status: 'firing', labels: { alertname: 'PaymentErrors' }, startsAt: STARTS }],
    },
  },
  steps: [{ run: ['deploy', 'run', 'production'] }, { files: { 'src/v2.js': 'export const v = 2;\n' }, commit: 'feat: v2' }, { run: ['deploy', 'run', 'production'] }],
  prompt: `${HEADLESS} /kaizen:monitor production — une alerte de l'équipe vient d'arriver, sa charge utile est dans alert.json.`,
  checks: [
    ['incident tracé, daté de l’alerte', (_, c) => {
      const list = JSON.parse(c.kaizen('monitor', 'incident', 'list', '--env', 'production').out || '[]');
      return { ok: list.length === 1 && list[0].detected_at === STARTS, note: JSON.stringify(list.map((i) => [i.detected_at, i.source, i.resolved_by])) };
    }],
    ['retour arrière exécuté et tracé', (_, c) => /rollback\/production\//.test(c.git('tag', '-l', 'rollback/*')) && /^rollback /m.test(c.read('deployed.log'))],
    ['le retour arrière résout l’incident', (_, c) => JSON.parse(c.kaizen('monitor', 'incident', 'list', '--env', 'production').out || '[]')[0]?.resolved_by === 'rollback'],
    ['post-mortem proposé', (out) => /postmortem|post-mortem/i.test(out)],
  ],
};
