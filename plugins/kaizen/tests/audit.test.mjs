// SDLC maturity diagnosis and fix scaffolds.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { cleanup, cli, tempRepo, writeFiles } from './helpers.mjs';

const CONSTITUTION = `---
name: X
version: 1.0.0
ratified: 2026-01-01
last_amended: 2026-01-01
artifact: kaizen-constitution/v1
---
## Articles
### I. Evidence first — NON-NEGOTIABLE
Every change comes with a test.
**Check:** was a test failing before?
## AI policy
### II. Agent autonomy
Agents never merge.
**Check:** no reserved action taken alone?
`;

const audit = (dir) => cli(dir, ['audit', '--json', '--no-github']).json;
const status = (r, id) => r.checks.find((c) => c.id === id)?.status;

test('bare project: everything missing, ordered priorities, scores per area', () => {
  const dir = tempRepo({ 'a.txt': '1' });
  const r = audit(dir);
  for (const id of ['remote', 'ci', 'tests', 'gitignore_env', 'deploy', 'monitoring', 'kaizen', 'constitution']) assert.equal(status(r, id), 'missing', id);
  assert.equal(status(r, 'branch_protection'), 'unknown');
  assert.deepEqual(r.next.map((n) => n.priority), [...r.next.map((n) => n.priority)].sort());
  assert.ok(r.areas.Foundations.score < 20, `score ${r.areas.Foundations.score}`);
  assert.equal(status(r, 'lint'), 'warn', 'lint is recommended, not blocking');
  assert.equal(r.next.find((n) => n.id === 'ci').scaffold, null, 'no CI generated without a test command');
  assert.match(cli(dir, ['audit', '--no-github']).stdout, /By priority:\n {2}P1/);
  cleanup(dir);
});

test('tooled project: every check green (branch protection not checked outside GitHub)', () => {
  const dir = tempRepo({
    'package.json': { name: 'shop', scripts: { test: 'node --test', lint: 'eslint .' } },
    'src/app.js': "app.get('/health', (req, res) => res.send('ok'));\n",
    'src/app.test.js': '',
    '.gitignore': 'node_modules\n.env\n',
    '.github/workflows/ci.yml': 'on: [pull_request]\njobs:\n  t:\n    steps:\n      - run: npm test\n',
    '.github/workflows/kaizen-patrol.yml': 'on: schedule\njobs:\n  p:\n    steps:\n      - run: node kaizen.mjs monitor patrol --env production\n',
    '.github/CODEOWNERS': '* @acme/web\n',
    '.github/pull_request_template.md': '## Why\n',
    '.github/dependabot.yml': 'version: 2\n',
    '.claude/settings.json': { enabledPlugins: { 'security@angelo-plugins': true } },
    'CLAUDE.md': '# Project\nLearnings: docs/learnings/\n',
    'CONSTITUTION.md': CONSTITUTION,
    '.kaizen/config.json': {
      deploy: { environments: { production: { command: 'make deploy', rollback: 'make rollback' } } },
      monitor: { signals: { health: { type: 'http', url: 'https://shop.example/health' } } },
    },
  });
  writeFiles(dir, {});
  const r = audit(dir);
  const notOk = r.checks.filter((c) => c.status !== 'ok').map((c) => `${c.id}:${c.status}`);
  assert.deepEqual(notOk, ['remote:missing', 'branch_protection:unknown']);
  cleanup(dir);
});

test('intermediate signals: deployment recognized but not configured, health route not watched, rollback missing', () => {
  const dir = tempRepo({
    'fly.toml': 'app = "shop"\n',
    'server.py': '@app.get("/healthz")\ndef health():\n    return "ok"\n',
    'notes.js': "const tag = '/up'; // a string, not a route\n",
  });
  let r = audit(dir);
  assert.equal(status(r, 'deploy'), 'warn');
  assert.match(r.next.find((n) => n.id === 'deploy').how, /deploy configure fly/);
  assert.equal(status(r, 'health'), 'warn');
  assert.match(r.checks.find((c) => c.id === 'health').evidence, /server\.py/);
  writeFiles(dir, { '.kaizen/config.json': { deploy: { environments: { production: { command: 'fly deploy', protected: false } } } } });
  r = audit(dir);
  assert.equal(status(r, 'rollback'), 'missing');
  assert.equal(status(r, 'protected'), 'warn');
  cleanup(dir);
});

test('scaffolds: Node and Python CI from the detected commands, never overwriting', () => {
  const node = tempRepo({ 'package.json': { scripts: { test: 'vitest run', lint: 'eslint .' } }, 'pnpm-lock.yaml': '' });
  assert.equal(cli(node, ['audit', 'fix', 'ci']).json.written, '.github/workflows/ci.yml');
  const ci = readFileSync(join(node, '.github/workflows/ci.yml'), 'utf8');
  assert.match(ci, /pnpm\/action-setup@v4\n {8}with:\n {10}version: 9/, 'without packageManager: explicit version');
  assert.match(ci, /pnpm install --frozen-lockfile/);
  assert.match(ci, /name: lint\n {8}run: pnpm run lint/);
  assert.match(ci, /name: test\n {8}run: pnpm test/);
  assert.match(ci, /branches: \[main\]/);
  const again = cli(node, ['audit', 'fix', 'ci']);
  assert.notEqual(again.code, 0);
  assert.match(again.stderr, /already exists/);
  cleanup(node);

  const nolock = tempRepo({ 'package.json': { scripts: { test: 'node --test' } } });
  cli(nolock, ['audit', 'fix', 'ci']);
  const nci = readFileSync(join(nolock, '.github/workflows/ci.yml'), 'utf8');
  assert.match(nci, /run: npm install\n/, 'without a lockfile: npm install, not npm ci');
  assert.doesNotMatch(nci, /cache: npm/, 'without a lockfile: no setup-node cache (it would fail)');
  cleanup(nolock);
  const lock = tempRepo({ 'package.json': { scripts: { test: 'node --test' } }, 'package-lock.json': '{}' });
  cli(lock, ['audit', 'fix', 'ci']);
  assert.match(readFileSync(join(lock, '.github/workflows/ci.yml'), 'utf8'), /cache: npm\n[\s\S]*run: npm ci\n/);
  cleanup(lock);

  const py = tempRepo({ 'pyproject.toml': '[project]\nname = "x"\n[tool.ruff]\n', 'uv.lock': '', 'tests/test_x.py': '' });
  cli(py, ['audit', 'fix', 'ci']);
  const pci = readFileSync(join(py, '.github/workflows/ci.yml'), 'utf8');
  assert.match(pci, /astral-sh\/setup-uv/);
  assert.match(pci, /run: uv run pytest -q/);
  cleanup(py);
});

test('scaffolds: PR template, dependabot per ecosystem, CODEOWNERS (owner required), .env ignored', () => {
  const dir = tempRepo({ 'package.json': { scripts: { test: 'x' } }, 'Dockerfile': 'FROM node\n', '.github/workflows/ci.yml': 'on: push\n', '.gitignore': 'node_modules' });
  cli(dir, ['audit', 'fix', 'pr_template']);
  assert.match(readFileSync(join(dir, '.github/pull_request_template.md'), 'utf8'), /Rollout and rollback/);
  cli(dir, ['audit', 'fix', 'dependabot']);
  const dep = readFileSync(join(dir, '.github/dependabot.yml'), 'utf8');
  for (const e of ['npm', 'github-actions', 'docker']) assert.match(dep, new RegExp(`package-ecosystem: ${e}\\n`));
  assert.notEqual(cli(dir, ['audit', 'fix', 'codeowners']).code, 0, '--owner required');
  cli(dir, ['audit', 'fix', 'codeowners', '--owner', '@acme/web']);
  assert.match(readFileSync(join(dir, '.github/CODEOWNERS'), 'utf8'), /^\* @acme\/web$[\s\S]*\/CONSTITUTION\.md @acme\/web/m);
  cli(dir, ['audit', 'fix', 'gitignore_env']);
  assert.match(readFileSync(join(dir, '.gitignore'), 'utf8'), /^node_modules\n# Local secrets.*\n\.env\n\.env\.\*\n!\.env\.example\n$/);
  assert.notEqual(cli(dir, ['audit', 'fix', 'gitignore_env']).code, 0, 'already ignored');
  assert.notEqual(cli(dir, ['audit', 'fix', 'unknown']).code, 0);
  cleanup(dir);
});

test('continuous detection: check and patrol / alert workflow scaffolds', () => {
  const dir = tempRepo({
    '.kaizen/config.json': { deploy: { environments: { staging: { command: 'x' }, production: { command: 'y' } } }, monitor: { signals: { health: { type: 'http', url: 'https://x/health' } } } },
  });
  const check = () => cli(dir, ['audit', '--json', '--no-github']).json.checks.find((c) => c.id === 'continuous_monitoring');
  assert.equal(check().status, 'warn');
  assert.equal(check().fix.scaffold, 'monitor_patrol');
  assert.equal(cli(dir, ['audit', 'fix', 'monitor_patrol', '--ref', '0123abc']).code, 0);
  const patrol = readFileSync(join(dir, '.github/workflows/kaizen-patrol.yml'), 'utf8');
  assert.match(patrol, /monitor patrol --env production/);
  assert.match(patrol, /ref: 0123abc/);
  assert.match(patrol, /contents: write/);
  assert.match(patrol, /fetch-depth: 0/);
  assert.equal(check().status, 'ok');
  cli(dir, ['audit', 'fix', 'monitor_alert', '--env', 'staging']);
  const alert = readFileSync(join(dir, '.github/workflows/kaizen-alert.yml'), 'utf8');
  assert.match(alert, /repository_dispatch/);
  assert.match(alert, /PAYLOAD: \$\{\{ toJson\(github\.event\.client_payload\) \}\}/);
  assert.match(alert, /monitor alert --env staging --file -/);
  assert.doesNotMatch(alert, /echo .*\$\{\{/, 'payload never interpolated into the script');
  assert.notEqual(cli(dir, ['audit', 'fix', 'monitor_alert']).code, 0, 'nothing is overwritten');
  assert.notEqual(cli(dir, ['audit', 'fix', 'monitor_patrol', '--env', 'prod; rm -rf /']).code, 0);
  cleanup(dir);
});

test('secret scanning: Kaizen scan in CI counts, scaffolded per PR, never overwritten', () => {
  const dir = tempRepo({ 'README.md': '# app\n' });
  const check = () => cli(dir, ['audit', '--json', '--no-github']).json.checks.find((c) => c.id === 'secret_scanning');
  assert.equal(check().status, 'missing');
  assert.equal(check().fix.scaffold, 'secret_scanning');
  assert.equal(cli(dir, ['audit', 'fix', 'secret_scanning', '--ref', '0123abc']).code, 0);
  const wf = readFileSync(join(dir, '.github/workflows/kaizen-secrets.yml'), 'utf8');
  assert.match(wf, /pull_request/);
  assert.match(wf, /kaizen\.mjs secrets scan --base origin\/\$\{\{ github\.base_ref \|\| 'main' \}\}/);
  assert.match(wf, /ref: 0123abc/);
  assert.match(wf, /fetch-depth: 0/);
  assert.match(wf, /contents: read/);
  assert.equal(check().status, 'ok');
  assert.notEqual(cli(dir, ['audit', 'fix', 'secret_scanning']).code, 0, 'nothing is overwritten');
  assert.notEqual(cli(dir, ['audit', 'fix', 'secret_scanning', '--ref', 'x; rm -rf /']).code, 0);
  cleanup(dir);
});
