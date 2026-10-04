// Deployment, human approval of protected environments, rollback, monitoring and real DORA.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { CLI, REVIEW_GATE, REVIEW_HOOKS, cleanup, cli, gitc, tempRepo, writeFiles } from './helpers.mjs';

// No backslash in the command: cmd.exe (Windows) does not interpret them like bash.
const MARK = 'node -e "require(\'fs\').appendFileSync(\'deployed.log\', process.env.KAIZEN_ENV + \' \' + process.env.KAIZEN_SHA + String.fromCharCode(10))"';

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

test('unprotected environment: deployed, traced by a deploy/<env>/… tag', () => {
  const dir = shopRepo();
  const r = cli(dir, ['deploy', 'run', 'staging']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.json.tag, /^deploy\/staging\/\d{8}T\d{6}Z$/);
  assert.deepEqual(log(dir), [`staging ${head(dir)}`]);
  const list = cli(dir, ['deploy', 'list', '--env', 'staging']).json;
  assert.equal(list.length, 1);
  assert.equal(list[0].sha, head(dir));
  assert.notEqual(cli(dir, ['deploy', 'run', 'qa']).code, 0, 'unknown environment');
  cleanup(dir);
});

test('protected production: approval typed by the user, bound to the commit, single use', () => {
  const dir = shopRepo();
  const refused = cli(dir, ['deploy', 'run', 'production']);
  assert.notEqual(refused.code, 0);
  assert.match(refused.stderr, /protected: approval required/);
  const req = cli(dir, ['deploy', 'request', 'production']).json;
  assert.equal(req.approval_needed, true);
  assert.match(req.code, /^[A-F0-9]{6}$/);
  assert.notEqual(cli(dir, ['deploy', 'run', 'production']).code, 0, 'requested but not confirmed');
  assert.match(confirm(dir, `go, kaizen deploy ${req.code}`).stdout, /approved by the user/);
  assert.equal(cli(dir, ['deploy', 'run', 'production']).code, 0);
  assert.notEqual(cli(dir, ['deploy', 'run', 'production']).code, 0, 'approval consumed');

  const req2 = cli(dir, ['deploy', 'request', 'production']).json;
  confirm(dir, `kaizen deploy ${req2.code}`);
  writeFiles(dir, { 'app.js': '2\n' });
  gitc(dir, ['commit', '-qam', 'feat: v2']);
  assert.match(cli(dir, ['deploy', 'run', 'production']).stderr, /approval required/, 'approved for another commit');
  assert.match(confirm(dir, 'kaizen deploy 000000').stdout, /unknown or expired/);
  cleanup(dir);
});

test('rollback: to the previous deployment, traced by a rollback/<env>/… tag', () => {
  const dir = shopRepo({ deploy: { environments: { staging: { command: MARK, rollback: `${MARK} # rb` } } } });
  const first = head(dir);
  cli(dir, ['deploy', 'run', 'staging']);
  writeFiles(dir, { 'app.js': '2\n' });
  gitc(dir, ['commit', '-qam', 'feat: v2']);
  cli(dir, ['deploy', 'run', 'staging']);
  const rb = cli(dir, ['deploy', 'rollback', 'staging', '--reason', 'erreurs 5xx']).json;
  assert.equal(rb.ok, true);
  assert.equal(rb.sha, first, 'target: the previous successful deployment');
  assert.match(rb.tag, /^rollback\/staging\//);
  assert.equal(log(dir).at(-1), `staging ${first}`);
  assert.deepEqual(cli(dir, ['deploy', 'list']).json.map((d) => d.kind), ['deploy', 'deploy', 'rollback']);
  cleanup(dir);
});

test('deploy run: stuck command killed at the timeout, failed and untagged', () => {
  const dir = shopRepo({ deploy: { timeout_seconds: 600, environments: { staging: { command: 'node -e "setTimeout(() => {}, 20000)"', timeout_seconds: 1 } } } });
  const started = Date.now();
  const r = cli(dir, ['deploy', 'run', 'staging']);
  assert.ok(Date.now() - started < 10000, 'the environment timeout wins');
  assert.notEqual(r.code, 0);
  assert.equal(r.json.ok, false);
  assert.equal(r.json.exit, 'timeout');
  assert.match(r.json.output, /uncertain/);
  assert.equal(r.json.tag, undefined);
  assert.equal(cli(dir, ['deploy', 'list']).json.length, 0);
  cleanup(dir);
});

test('monitor check: config thresholds, plan thresholds, native HTTP signal', async () => {
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
        p95_ms: { command: 'node -e "console.log(\'p95: 900\')"', max: 800 },
        broken: { command: 'echo n/a' },
      },
    },
  });
  writeFiles(dir, { 'docs/plans/p.md': '---\ntitle: P - Plan\n---\n<!-- kaizen:rollout -->\n- **Signal**: `error_rate` > 1 % or `p95_ms` > 1000 → rollback\n' });
  const r = await cliAsync(dir, ['monitor', 'check', '--plan', 'docs/plans/p.md']);
  server.close();
  assert.equal(r.code, 1);
  const s = r.json.signals;
  assert.equal(s.health.ok, true);
  assert.equal(s.ready.ok, false, '503');
  assert.equal(s.error_rate.ok, false, 'plan threshold (1 %) stricter than the config (5 %)');
  assert.equal(s.error_rate.threshold_source, 'plan');
  assert.equal(s.p95_ms.ok, true, 'plan threshold: 1000');
  assert.equal(s.broken.ok, false);
  assert.match(s.broken.detail, /non-numeric/);
  cleanup(dir);
});

test('monitor watch: breach confirmed over consecutive samples, automatic rollback', async () => {
  // The signal reads a counter: healthy, then two samples out of threshold.
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
  assert.equal(r.json.samples, 3, 'one healthy, then two out of threshold');
  assert.equal(r.json.rollback.ok, true, 'auto_rollback');
  assert.equal(r.json.incident.opened, true, 'breach recorded as an incident');
  assert.equal(cli(dir, ['deploy', 'list']).json.at(-1).kind, 'rollback');
  const [inc] = cli(dir, ['monitor', 'incident', 'list', '--env', 'staging']).json;
  assert.equal(inc.source, 'watch');
  assert.equal(inc.resolved_by, 'rollback', 'the rollback resolves the incident');
  writeFileSync(join(dir, 'signal-n.txt'), '0');
  cleanup(dir);
});

test('metrics: DORA measured on real production deployments', () => {
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
  assert.match(m.throughput.deployment_frequency_method, /real deployments/);
  assert.ok(m.instability.time_to_restore_hours_median >= 0);
  cleanup(dir);
});

test('monitor patrol: outside the window, confirmed breach → incident opened once', async () => {
  const dir = shopRepo({
    deploy: { environments: { production: { command: MARK, rollback: MARK, protected: false } } },
    monitor: { signals: { error_rate: { command: 'node -e "console.log(require(\'fs\').existsSync(\'signal-bad.txt\') ? 1 : 0)"', max: 0.5 } }, consecutive: 2 },
  });
  cli(dir, ['deploy', 'run', 'production']);
  const healthy = await cliAsync(dir, ['monitor', 'patrol', '--env', 'production', '--interval', '0']);
  assert.equal(healthy.code, 0);
  assert.equal(healthy.json.status, 'healthy');
  writeFileSync(join(dir, 'signal-bad.txt'), 'x');
  const r = await cliAsync(dir, ['monitor', 'patrol', '--env', 'production', '--interval', '0']);
  assert.equal(r.code, 1);
  assert.equal(r.json.status, 'breach');
  assert.equal(r.json.opened, true);
  assert.match(r.json.tag, /^incident\/production\/\d{8}T\d{6}Z$/);
  const again = await cliAsync(dir, ['monitor', 'patrol', '--env', 'production', '--interval', '0']);
  assert.equal(again.json.opened, false, 'incident already open: no duplicate');
  assert.equal(cli(dir, ['monitor', 'incident', 'list']).json.length, 1);
  cleanup(dir);
});

test('incident attached to the commit deployed at detection time, not the last deployment', () => {
  // Deployment tags at fixed dates: tags are dated to the second, a timed test would be flaky.
  const dir = shopRepo();
  gitc(dir, ['tag', '-a', 'deploy/production/20260101T000000Z', '-m', '{}']);
  const v1 = head(dir);
  writeFiles(dir, { 'app.js': '2\n' });
  gitc(dir, ['commit', '-qam', 'feat: v2'], ['tag', '-a', 'deploy/production/20260201T000000Z', '-m', '{}']);
  const open = (at) => cli(dir, ['monitor', 'incident', 'open', '--env', 'production', '--at', at]).json;
  assert.equal(open('2026-01-15T08:00:00Z').incident.sha, v1, 'alert earlier than the v2 deployment');
  cli(dir, ['monitor', 'incident', 'resolve', '--env', 'production', '--at', '2026-01-15T09:00:00Z']);
  assert.equal(open('2026-02-03T08:00:00Z').incident.sha, head(dir), 'later alert: v2');
  cleanup(dir);
});

test('monitor alert: Alertmanager, PagerDuty, Datadog and plain JSON; detection dated by the alert', () => {
  const dir = shopRepo({ deploy: { environments: { production: { command: MARK, rollback: MARK, protected: false } } } });
  cli(dir, ['deploy', 'run', 'production']);
  const alert = (payload, env = 'production') => cli(dir, ['monitor', 'alert', '--env', env], { input: JSON.stringify(payload) });
  const start = new Date(Date.now() + 60000).toISOString().replace(/\.\d+Z$/, 'Z');
  const end = new Date(Date.now() + 2 * 3600000 + 60000).toISOString().replace(/\.\d+Z$/, 'Z');

  const am = alert({ status: 'firing', alerts: [{ status: 'firing', labels: { alertname: 'HighErrorRate' }, startsAt: start }], commonAnnotations: { summary: 'Taux d’erreur 5 %' } });
  assert.equal(am.code, 0, am.stderr);
  assert.equal(am.json.alert.format, 'alertmanager');
  assert.equal(am.json.incident.detected_at, start, 'detection time = start of the alert');
  assert.equal(am.json.incident.summary, 'Taux d’erreur 5 %');
  assert.equal(alert({ status: 'resolved', alerts: [{ status: 'resolved', endsAt: end }] }).json.resolved, true);
  const [inc] = cli(dir, ['monitor', 'incident', 'list', '--env', 'production']).json;
  assert.equal(inc.resolved_by, 'resolve');
  assert.equal(inc.hours, 2);

  assert.equal(inc.sha, head(dir), 'commit deployed at detection time');
  const pd = alert({ event: { event_type: 'incident.triggered', occurred_at: end, data: { title: 'API down' } } });
  assert.equal(pd.json.alert.format, 'pagerduty');
  assert.equal(pd.json.opened, true);
  assert.equal(alert({ event: { event_type: 'incident.acknowledged', occurred_at: end } }).json.action, 'ignore');
  const dd = alert({ alert_transition: 'Recovered', title: 'API down', date: Date.parse(end) + 1800000 });
  assert.equal(dd.json.alert.format, 'datadog');
  assert.equal(dd.json.resolved, true);
  assert.equal(alert({ status: 'firing', summary: 'disque plein' }).json.alert.format, 'generic');
  assert.notEqual(alert({ status: 'firing' }, '').code, 0, 'environnement requis');
  cleanup(dir);
});

test('metrics: incident after the window = failure; restore measured from detection', () => {
  const dir = shopRepo({ deploy: { environments: { production: { command: MARK, rollback: MARK, protected: false } } } });
  cli(dir, ['deploy', 'run', 'production']);
  const detected = new Date(Date.now() + 3 * 86400000).toISOString().replace(/\.\d+Z$/, 'Z');
  const resolved = new Date(Date.parse(detected) + 3 * 3600000).toISOString();
  assert.equal(cli(dir, ['monitor', 'incident', 'open', '--env', 'production', '--at', detected, '--summary', 'lenteurs']).json.opened, true);
  assert.equal(cli(dir, ['monitor', 'incident', 'resolve', '--env', 'production', '--at', resolved]).json.resolved, true);
  const m = cli(dir, ['metrics', '--no-github']).json;
  assert.equal(m.instability.change_failure_rate, 1, 'incident before the next deployment');
  assert.equal(m.instability.time_to_restore_hours_median, 3, 'detection → resolution');
  assert.equal(m.deployments.incidents, 1);
  cleanup(dir);
});

test('status: open incident first, then missing postmortem', () => {
  const dir = shopRepo({ deploy: { environments: { production: { command: MARK, rollback: MARK, protected: false } } } });
  cli(dir, ['init']);
  cli(dir, ['deploy', 'run', 'production']);
  const detected = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  cli(dir, ['monitor', 'incident', 'open', '--env', 'production', '--at', detected, '--summary', 'lenteurs']);
  const st = () => cli(dir, ['status', '--json']).json;
  assert.equal(st().next[0].command, '/kaizen:monitor production');
  assert.match(st().next[0].why, /lenteurs/);
  assert.equal(st().incidents.open, 1);
  cli(dir, ['monitor', 'incident', 'resolve', '--env', 'production']);
  assert.equal(st().next[0].command, '/kaizen:postmortem');
  const docs = cli(dir, ['root']).json.docs_root || 'docs';
  writeFiles(dir, { [`${docs}/postmortems/2026-pm.md`]: `---\ntitle: Lenteurs\ndetected: ${detected}\nresolved: ${detected}\n---\n` });
  assert.ok(!st().next.some((n) => n.command === '/kaizen:postmortem'), 'postmortem written');
  cleanup(dir);
});

test('gates: raw production command refused, forged deployment tag refused', () => {
  const dir = shopRepo();
  const direct = preTool(dir, `cd . && ${MARK} # prod`);
  assert.equal(direct.status, 2);
  assert.match(direct.stderr, /\/kaizen:deploy production/);
  assert.equal(preTool(dir, MARK).status, 0, 'staging, unprotected');
  assert.equal(preTool(dir, `node "${CLI}" deploy run production`).status, 0, 'through the CLI');
  assert.equal(preTool(dir, 'git tag -a deploy/production/20260101T000000Z -m x').status, 2);
  assert.equal(preTool(dir, 'git tag -a incident/production/20260101T000000Z -m x').status, 2, 'forged incident');
  assert.equal(preTool(dir, 'git tag -l "deploy/*"').status, 0, 'lister reste permis');
  assert.equal(preTool(dir, 'npm test').status, 0);
  cleanup(dir);
});

test('release notes ignore deployment tags as a starting point', () => {
  const dir = shopRepo({ deploy: { environments: { staging: { command: MARK } } } });
  gitc(dir, ['tag', 'v1.0.0']);
  writeFiles(dir, { 'app.js': '2\n' });
  gitc(dir, ['commit', '-qam', 'feat: v2']);
  cli(dir, ['deploy', 'run', 'staging']);
  assert.equal(cli(dir, ['release', 'notes', '--json']).json.from, 'v1.0.0');
  cleanup(dir);
});

test('status: default-branch commits not yet deployed → /kaizen:deploy', () => {
  const dir = shopRepo({ deploy: { environments: { production: { command: MARK, protected: false } } } });
  const next = () => cli(dir, ['status', '--json']).json.next.map((n) => n.command);
  assert.ok(next().includes('/kaizen:deploy production'), next().join(', '));
  cli(dir, ['deploy', 'run', 'production']);
  assert.ok(!next().some((c) => c.startsWith('/kaizen:deploy')), 'everything is deployed');
  writeFiles(dir, { 'app.js': '3\n' });
  gitc(dir, ['commit', '-qam', 'fix: v3']);
  assert.match(cli(dir, ['status', '--json']).json.next.find((n) => n.command.startsWith('/kaizen:deploy')).why, /1 commit\(s\) of main not yet deployed/);
  cleanup(dir);
});
