// /kaizen:polish démarre le serveur de dev, applique un retour précis, commite en local, ne pousse pas,
// et laisse le serveur tourner en disant comment l'arrêter (le harnais l'arrête ensuite).
import { SHOP } from '../fixtures.mjs';

export default {
  name: 'polish-feedback',
  timeoutMinutes: 20,
  files: {
    ...SHOP,
    'package.json': { ...SHOP['package.json'], scripts: { test: 'node --test', dev: 'node server.js' } },
    'server.js': "import { createServer } from 'node:http';\nimport { readFileSync } from 'node:fs';\nconst port = process.env.PORT || 5173;\ncreateServer((req, res) => {\n  const file = req.url.endsWith('.css') ? 'public/style.css' : 'public/index.html';\n  res.setHeader('content-type', file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8');\n  res.end(readFileSync(file));\n}).listen(port, () => console.log(`Local: http://localhost:${port}/`));\n",
    'public/index.html': '<!doctype html><html lang="fr"><head><link rel="stylesheet" href="/style.css"></head><body><h1>Commandes</h1><button class="export">Exporter</button></body></html>\n',
    'public/style.css': '.export { height: 24px; font-size: 11px; }\n',
  },
  prompt: '/kaizen:polish / Retour unique de ma part, je ne suis pas disponible ensuite : le bouton « Exporter » est trop petit pour le tactile, passe-le à au moins 44px de haut et 16px de texte. Ensuite termine.',
  checks: [
    ['le retour est appliqué', (_, c) => { const t = c.read('public/style.css'); const h = +(t.match(/height:\s*(\d+)px/) || [])[1]; const f = +(t.match(/font-size:\s*(\d+)px/) || [])[1]; return { ok: h >= 44 && f >= 16, note: t.trim() }; }],
    ['commité en local', (_, c) => c.git('status', '--porcelain', 'public').trim() === '' && c.git('log', '--oneline').trim().split('\n').length >= 2],
    ['rapport : URL du serveur et arrêt par PID, sans pkill', (out) => /localhost:5173/.test(out) && /kill \d+|PID/i.test(out) && !/pkill/.test(out)],
  ],
};
