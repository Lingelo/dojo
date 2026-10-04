// Diagnostic de maturité SDLC et gabarits de correction.
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
### I. Preuve d'abord — NON NÉGOCIABLE
Tout changement arrive avec un test.
**Contrôle :** un test échouait-il avant ?
## Politique IA
### II. Autonomie des agents
Les agents ne mergent jamais.
**Contrôle :** aucune action réservée faite seule ?
`;

const audit = (dir) => cli(dir, ['audit', '--json', '--no-github']).json;
const status = (r, id) => r.checks.find((c) => c.id === id)?.status;

test('projet nu : tout manque, priorités ordonnées, scores par domaine', () => {
  const dir = tempRepo({ 'a.txt': '1' });
  const r = audit(dir);
  for (const id of ['remote', 'ci', 'tests', 'gitignore_env', 'deploy', 'monitoring', 'kaizen', 'constitution']) assert.equal(status(r, id), 'missing', id);
  assert.equal(status(r, 'branch_protection'), 'unknown');
  assert.deepEqual(r.next.map((n) => n.priority), [...r.next.map((n) => n.priority)].sort());
  assert.ok(r.areas.Fondations.score < 20, `score ${r.areas.Fondations.score}`);
  assert.equal(status(r, 'lint'), 'warn', 'le lint est recommandé, pas bloquant');
  assert.equal(r.next.find((n) => n.id === 'ci').scaffold, null, 'pas de CI générée sans commande de test');
  assert.match(cli(dir, ['audit', '--no-github']).stdout, /Par priorité :\n {2}P1/);
  cleanup(dir);
});

test('projet outillé : chaque contrôle au vert (protection de branche non vérifiée hors GitHub)', () => {
  const dir = tempRepo({
    'package.json': { name: 'shop', scripts: { test: 'node --test', lint: 'eslint .' } },
    'src/app.js': "app.get('/health', (req, res) => res.send('ok'));\n",
    'src/app.test.js': '',
    '.gitignore': 'node_modules\n.env\n',
    '.github/workflows/ci.yml': 'on: [pull_request]\njobs:\n  t:\n    steps:\n      - run: npm test\n',
    '.github/CODEOWNERS': '* @acme/web\n',
    '.github/pull_request_template.md': '## Pourquoi\n',
    '.github/dependabot.yml': 'version: 2\n',
    '.claude/settings.json': { enabledPlugins: { 'security@angelo-plugins': true } },
    'CLAUDE.md': '# Projet\nLeçons : docs/learnings/\n',
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

test('signaux intermédiaires : déploiement reconnu non configuré, route de santé non surveillée, retour arrière absent', () => {
  const dir = tempRepo({
    'fly.toml': 'app = "shop"\n',
    'server.py': '@app.get("/healthz")\ndef health():\n    return "ok"\n',
    'notes.js': "const tag = '/up'; // une chaîne, pas une route\n",
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

test('gabarits : CI Node et Python depuis les commandes détectées, sans jamais écraser', () => {
  const node = tempRepo({ 'package.json': { scripts: { test: 'vitest run', lint: 'eslint .' } }, 'pnpm-lock.yaml': '' });
  assert.equal(cli(node, ['audit', 'fix', 'ci']).json.written, '.github/workflows/ci.yml');
  const ci = readFileSync(join(node, '.github/workflows/ci.yml'), 'utf8');
  assert.match(ci, /pnpm\/action-setup@v4\n {8}with:\n {10}version: 9/, 'sans packageManager : version explicite');
  assert.match(ci, /pnpm install --frozen-lockfile/);
  assert.match(ci, /name: lint\n {8}run: pnpm run lint/);
  assert.match(ci, /name: test\n {8}run: pnpm test/);
  assert.match(ci, /branches: \[main\]/);
  const again = cli(node, ['audit', 'fix', 'ci']);
  assert.notEqual(again.code, 0);
  assert.match(again.stderr, /existe déjà/);
  cleanup(node);

  const nolock = tempRepo({ 'package.json': { scripts: { test: 'node --test' } } });
  cli(nolock, ['audit', 'fix', 'ci']);
  const nci = readFileSync(join(nolock, '.github/workflows/ci.yml'), 'utf8');
  assert.match(nci, /run: npm install\n/, 'sans lockfile : npm install, pas npm ci');
  assert.doesNotMatch(nci, /cache: npm/, 'sans lockfile : pas de cache setup-node (il échouerait)');
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

test('gabarits : modèle de PR, dependabot par écosystème, CODEOWNERS (propriétaire requis), .env ignoré', () => {
  const dir = tempRepo({ 'package.json': { scripts: { test: 'x' } }, 'Dockerfile': 'FROM node\n', '.github/workflows/ci.yml': 'on: push\n', '.gitignore': 'node_modules' });
  cli(dir, ['audit', 'fix', 'pr_template']);
  assert.match(readFileSync(join(dir, '.github/pull_request_template.md'), 'utf8'), /Déploiement et retour arrière/);
  cli(dir, ['audit', 'fix', 'dependabot']);
  const dep = readFileSync(join(dir, '.github/dependabot.yml'), 'utf8');
  for (const e of ['npm', 'github-actions', 'docker']) assert.match(dep, new RegExp(`package-ecosystem: ${e}\\n`));
  assert.notEqual(cli(dir, ['audit', 'fix', 'codeowners']).code, 0, '--owner requis');
  cli(dir, ['audit', 'fix', 'codeowners', '--owner', '@acme/web']);
  assert.match(readFileSync(join(dir, '.github/CODEOWNERS'), 'utf8'), /^\* @acme\/web$[\s\S]*\/CONSTITUTION\.md @acme\/web/m);
  cli(dir, ['audit', 'fix', 'gitignore_env']);
  assert.match(readFileSync(join(dir, '.gitignore'), 'utf8'), /^node_modules\n# Secrets locaux.*\n\.env\n\.env\.\*\n!\.env\.example\n$/);
  assert.notEqual(cli(dir, ['audit', 'fix', 'gitignore_env']).code, 0, 'déjà ignoré');
  assert.notEqual(cli(dir, ['audit', 'fix', 'inconnu']).code, 0);
  cleanup(dir);
});
