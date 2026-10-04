// Déploiement, approbation humaine des environnements protégés, retour arrière, monitoring et DORA réel.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CLI, REVIEW_GATE, REVIEW_HOOKS, cleanup, cli, gitc, tempRepo, writeFiles } from './helpers.mjs';

const MARK = 'node -e "require(\'fs\').appendFileSync(\'deployed.log\', process.env.KAIZEN_ENV + \' \' + process.env.KAIZEN_SHA + \'\\\\n\')"';

function shopRepo(extra = {}) {
  const dir = tempRepo({
    '.gitignore': 'deployed.log\nsignal*.txt\n',
    'app.js': '1\n',
    '.kaizen/config.json': {
      deploy: {
        environments: {
          staging: { command: MARK },
          production: { command: `${MARK} # prod`, rollback: MARK, url: 'https://shop.example' },
        },
        ...extra.deploy,
      },
      monitor: extra.monitor || {},
    },
  });
  return dir;
}

const confirm = (dir, prompt) => spawnSync(process.execPath, [REVIEW_HOOKS, '--confirm'], { input: JSON.stringify({ cwd: dir, prompt }), encoding: 'utf8' });
const preTool = (dir, command) => spawnSync(process.execPath, [REVIEW_GATE], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: dir }), encoding: 'utf8' });
const log = (dir) => readFileSync(join(dir, 'deployed.log'), 'utf8').trim().split('\n');
const head = (dir) => spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout.trim();

function cliAsync(dir, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd: dir });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ code, json: JSON.parse(out) }));
  });
}

test('environnement non protégé : déployé, tracé par un tag deploy/<env>/…', () => {
  const dir = shopRepo();
  const r = cli(dir, ['deploy', 'run', 'staging']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.json.tag, /^deploy\/staging\/\d{8}T\d{6}Z$/);
  assert.deepEqual(log(dir), [`staging ${head(dir)}`]);
  const list = cli(dir, ['deploy', 'list', '--env', 'staging']).json;
  assert.equal(list.length, 1);
  assert.equal(list[0].sha, head(dir));
  assert.notEqual(cli(dir, ['deploy', 'run', 'qa']).code, 0, 'environnement inconnu');
  cleanup(dir);
});

test('production protégée : approbation tapée par l’utilisateur, liée au commit, à usage unique', () => {
  const dir = shopRepo();
  const refused = cli(dir, ['deploy', 'run', 'production']);
  assert.notEqual(refused.code, 0);
  assert.match(refused.stderr, /protégé : approbation requise/);
  const req = cli(dir, ['deploy', 'request', 'production']).json;
  assert.equal(req.approval_needed, true);
  assert.match(req.code, /^[A-F0-9]{6}$/);
  assert.notEqual(cli(dir, ['deploy', 'run', 'production']).code, 0, 'demandée mais pas confirmée');
  assert.match(confirm(dir, `go, kaizen deploy ${req.code}`).stdout, /approuvé par l'utilisateur/);
  assert.equal(cli(dir, ['deploy', 'run', 'production']).code, 0);
  assert.notEqual(cli(dir, ['deploy', 'run', 'production']).code, 0, 'approbation consommée');

  const req2 = cli(dir, ['deploy', 'request', 'production']).json;
  confirm(dir, `kaizen deploy ${req2.code}`);
  writeFiles(dir, { 'app.js': '2\n' });
  gitc(dir, ['commit', '-qam', 'feat: v2']);
  assert.match(cli(dir, ['deploy', 'run', 'production']).stderr, /approbation requise/, 'approuvée pour un autre commit');
  assert.match(confirm(dir, 'kaizen deploy 000000').stdout, /inconnu ou expiré/);
  cleanup(dir);
});

test('retour arrière : vers le déploiement précédent, tracé par un tag rollback/<env>/…', () => {
  const dir = shopRepo({ deploy: { environments: { staging: { command: MARK, rollback: `${MARK} # rb` } } } });
  const first = head(dir);
  cli(dir, ['deploy', 'run', 'staging']);
  writeFiles(dir, { 'app.js': '2\n' });
  gitc(dir, ['commit', '-qam', 'feat: v2']);
  cli(dir, ['deploy', 'run', 'staging']);
  const rb = cli(dir, ['deploy', 'rollback', 'staging', '--reason', 'erreurs 5xx']).json;
  assert.equal(rb.ok, true);
  assert.equal(rb.sha, first, 'cible : le déploiement réussi précédent');
  assert.match(rb.tag, /^rollback\/staging\//);
  assert.equal(log(dir).at(-1), `staging ${first}`);
  assert.deepEqual(cli(dir, ['deploy', 'list']).json.map((d) => d.kind), ['deploy', 'deploy', 'rollback']);
  cleanup(dir);
});

test('monitor check : seuils de la config, seuils du plan, signal HTTP natif', async () => {
  const server = createServer((req, res) => {
    res.statusCode = req.url === '/health' ? 200 : 503;
    res.end('ok');
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const dir = shopRepo({
    monitor: {
      signals: {
        health: { type: 'http', url: `http://127.0.0.1:${port}/health` },
        ready: { type: 'http', url: `http://127.0.0.1:${port}/ready` },
        error_rate: { command: 'node -e "console.log(0.02)"', max: 0.05 },
        p95_ms: { command: 'echo "p95: 900"', max: 800 },
        broken: { command: 'echo n/a' },
      },
    },
  });
  writeFiles(dir, { 'docs/plans/p.md': '---\ntitle: P - Plan\n---\n<!-- kaizen:rollout -->\n- **Signal** : `error_rate` > 1 % ou `p95_ms` > 1000 → retour arrière\n' });
  const r = await cliAsync(dir, ['monitor', 'check', '--plan', 'docs/plans/p.md']);
  server.close();
  assert.equal(r.code, 1);
  const s = r.json.signals;
  assert.equal(s.health.ok, true);
  assert.equal(s.ready.ok, false, '503');
  assert.equal(s.error_rate.ok, false, 'seuil du plan (1 %) plus strict que la config (5 %)');
  assert.equal(s.error_rate.threshold_source, 'plan');
  assert.equal(s.p95_ms.ok, true, 'seuil du plan : 1000');
  assert.equal(s.broken.ok, false);
  assert.match(s.broken.detail, /non numérique/);
  cleanup(dir);
});

test('monitor watch : violation confirmée sur échantillons consécutifs, retour arrière automatique', async () => {
  // Le signal lit un compteur : sain, puis deux échantillons hors seuil.
  const counter = 'node -e "const f=\'signal-n.txt\';const fs=require(\'fs\');const n=fs.existsSync(f)?+fs.readFileSync(f,\'utf8\'):0;fs.writeFileSync(f,String(n+1));console.log(n===0?0:1)"';
  const dir = shopRepo({
    deploy: { auto_rollback: true, environments: { staging: { command: MARK, rollback: `${MARK} # rb` } } },
    monitor: { signals: { error_rate: { command: counter, max: 0.5 } }, consecutive: 2 },
  });
  cli(dir, ['deploy', 'run', 'staging']);
  const r = await cliAsync(dir, ['monitor', 'watch', '--env', 'staging', '--minutes', '1', '--interval', '0']);
  assert.equal(r.code, 1);
  assert.equal(r.json.status, 'breach');
  assert.deepEqual(r.json.breached, ['error_rate']);
  assert.equal(r.json.samples, 3, 'un sain, puis deux hors seuil');
  assert.equal(r.json.rollback.ok, true, 'auto_rollback');
  assert.equal(cli(dir, ['deploy', 'list']).json.at(-1).kind, 'rollback');
  writeFileSync(join(dir, 'signal-n.txt'), '0');
  cleanup(dir);
});

test('metrics : DORA mesuré sur les vrais déploiements de production', () => {
  const dir = shopRepo({ deploy: { environments: { production: { command: MARK, rollback: MARK, protected: false } } } });
  cli(dir, ['deploy', 'run', 'production']);
  writeFiles(dir, { 'app.js': '2\n' });
  gitc(dir, ['commit', '-qam', 'feat: v2']);
  cli(dir, ['deploy', 'run', 'production']);
  cli(dir, ['deploy', 'rollback', 'production', '--reason', 'test']);
  const m = cli(dir, ['metrics', '--no-github']).json;
  assert.equal(m.deployments.deployments, 2);
  assert.equal(m.deployments.rollbacks, 1);
  assert.equal(m.instability.change_failure_rate, 0.5);
  assert.match(m.throughput.deployment_frequency_method, /déploiements réels/);
  assert.ok(m.instability.time_to_restore_hours_median >= 0);
  cleanup(dir);
});

test('garde-fous : commande de production brute refusée, tag de déploiement forgé refusé', () => {
  const dir = shopRepo();
  const direct = preTool(dir, `cd . && ${MARK} # prod`);
  assert.equal(direct.status, 2);
  assert.match(direct.stderr, /\/kaizen:deploy production/);
  assert.equal(preTool(dir, MARK).status, 0, 'staging, non protégé');
  assert.equal(preTool(dir, `node "${CLI}" deploy run production`).status, 0, 'par le CLI');
  assert.equal(preTool(dir, 'git tag -a deploy/production/20260101T000000Z -m x').status, 2);
  assert.equal(preTool(dir, 'git tag -l "deploy/*"').status, 0, 'lister reste permis');
  assert.equal(preTool(dir, 'npm test').status, 0);
  cleanup(dir);
});

test('release notes ignore les tags de déploiement comme point de départ', () => {
  const dir = shopRepo({ deploy: { environments: { staging: { command: MARK } } } });
  gitc(dir, ['tag', 'v1.0.0']);
  writeFiles(dir, { 'app.js': '2\n' });
  gitc(dir, ['commit', '-qam', 'feat: v2']);
  cli(dir, ['deploy', 'run', 'staging']);
  assert.equal(cli(dir, ['release', 'notes', '--json']).json.from, 'v1.0.0');
  cleanup(dir);
});

test('status : commits de la branche par défaut pas encore déployés → /kaizen:deploy', () => {
  const dir = shopRepo({ deploy: { environments: { production: { command: MARK, protected: false } } } });
  const next = () => cli(dir, ['status', '--json']).json.next.map((n) => n.command);
  assert.ok(next().includes('/kaizen:deploy production'), next().join(', '));
  cli(dir, ['deploy', 'run', 'production']);
  assert.ok(!next().some((c) => c.startsWith('/kaizen:deploy')), 'tout est déployé');
  writeFiles(dir, { 'app.js': '3\n' });
  gitc(dir, ['commit', '-qam', 'fix: v3']);
  assert.match(cli(dir, ['status', '--json']).json.next.find((n) => n.command.startsWith('/kaizen:deploy')).why, /1 commit\(s\) de main pas encore déployé/);
  cleanup(dir);
});
