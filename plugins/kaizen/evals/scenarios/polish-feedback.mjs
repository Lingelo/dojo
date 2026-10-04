// /kaizen:polish starts the dev server, applies one precise piece of feedback, commits locally, does
// not push, and leaves the server running while saying how to stop it (the harness stops it next).
import { SHOP } from '../fixtures.mjs';

export default {
  name: 'polish-feedback',
  timeoutMinutes: 20,
  files: {
    ...SHOP,
    'package.json': { ...SHOP['package.json'], scripts: { test: 'node --test', dev: 'node server.js' } },
    'server.js': "import { createServer } from 'node:http';\nimport { readFileSync } from 'node:fs';\nconst port = process.env.PORT || 5173;\ncreateServer((req, res) => {\n  const file = req.url.endsWith('.css') ? 'public/style.css' : 'public/index.html';\n  res.setHeader('content-type', file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8');\n  res.end(readFileSync(file));\n}).listen(port, () => console.log(`Local: http://localhost:${port}/`));\n",
    'public/index.html': '<!doctype html><html lang="en"><head><link rel="stylesheet" href="/style.css"></head><body><h1>Orders</h1><button class="export">Export</button></body></html>\n',
    'public/style.css': '.export { height: 24px; font-size: 11px; }\n',
  },
  prompt: '/kaizen:polish / One single piece of feedback from me, I am not available afterwards: the "Export" button is too small for touch, make it at least 44px high with 16px text. Then finish.',
  checks: [
    ['the feedback is applied', (_, c) => { const t = c.read('public/style.css'); const h = +(t.match(/height:\s*(\d+)px/) || [])[1]; const f = +(t.match(/font-size:\s*(\d+)px/) || [])[1]; return { ok: h >= 44 && f >= 16, note: t.trim() }; }],
    ['committed locally', (_, c) => c.git('status', '--porcelain', 'public').trim() === '' && c.git('log', '--oneline').trim().split('\n').length >= 2],
    ['report: server URL and stop by PID, no pkill', (out) => /localhost:5173/.test(out) && /kill \d+|PID/i.test(out) && !/pkill/.test(out)],
  ],
};
