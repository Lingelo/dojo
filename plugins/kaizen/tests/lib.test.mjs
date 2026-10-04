import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { detectStack, docsRoot, loadConfig, parseFrontmatter, runBounded } from '../scripts/lib.mjs';
import { cleanup, tempRepo } from './helpers.mjs';

test('frontmatter : scalaires, guillemets, listes en ligne et en tirets, blocs, commentaires', () => {
  const { data, body, error } = parseFrontmatter(
    [
      '---',
      'title: "Titre: avec deux-points"',
      'tags: [a, "b, c", d]',
      'symptoms:',
      '  - "`npm ci` échoue: EINTEGRITY"',
      '  - simple',
      'status: proposed   # commentaire',
      'retire_when: "quand le bug #123 est corrigé"',
      'flag: true',
      'notes: |',
      '  ligne 1',
      '  ligne 2',
      'empty:',
      '---',
      'corps',
    ].join('\n'),
  );
  assert.equal(error, null);
  assert.equal(data.title, 'Titre: avec deux-points');
  assert.deepEqual(data.tags, ['a', 'b, c', 'd']);
  assert.deepEqual(data.symptoms, ['`npm ci` échoue: EINTEGRITY', 'simple']);
  assert.equal(data.status, 'proposed');
  assert.equal(data.retire_when, 'quand le bug #123 est corrigé');
  assert.equal(data.flag, true);
  assert.equal(data.notes, 'ligne 1\nligne 2');
  assert.deepEqual(data.empty, []);
  assert.equal(body, 'corps');
});

test('frontmatter absent ou ligne illisible', () => {
  assert.equal(parseFrontmatter('pas de frontmatter').data, null);
  assert.match(parseFrontmatter('---\n???\n---\n').error, /illisible/);
});

test('détection de stack : node (pnpm) sans test fictif, python, go', () => {
  const node = tempRepo({ 'package.json': { scripts: { test: 'echo "Error: no test specified" && exit 1', lint: 'eslint .', typecheck: 'tsc' } }, 'pnpm-lock.yaml': '' });
  const d = detectStack(node);
  assert.deepEqual(d.stacks, ['node (pnpm)']);
  assert.equal(d.verify.test, undefined, 'le script test fictif de npm init est ignoré');
  assert.equal(d.verify.lint, 'pnpm run lint');
  assert.equal(d.verify.typecheck, 'pnpm run typecheck');
  assert.match(d.verify.audit, /pnpm audit/);
  cleanup(node);

  const py = tempRepo({ 'pyproject.toml': '[tool.ruff]\n', 'uv.lock': '', 'tests/test_x.py': '' });
  assert.equal(detectStack(py).verify.test, 'uv run pytest -q');
  assert.equal(detectStack(py).verify.lint, 'uv run ruff check .');
  cleanup(py);

  const go = tempRepo({ 'go.mod': 'module x\n' });
  assert.equal(detectStack(go).verify.test, 'go test ./...');
  cleanup(go);
});

test('configuration : config.local surcharge, sauf docs_root', () => {
  const dir = tempRepo({
    '.kaizen/config.json': { docs_root: 'eng', language: 'fr', verify: { test: 'a' }, pr: { max_lines: 300 } },
    '.kaizen/config.local.json': { docs_root: 'ailleurs', language: 'en', verify: { lint: 'b' }, gate: { max_blocks: 5 } },
  });
  const c = loadConfig(dir);
  assert.equal(c.docs_root, 'eng');
  assert.equal(c.language, 'en');
  assert.deepEqual(c.verify, { test: 'a', lint: 'b' });
  assert.equal(c.gate.max_blocks, 5);
  assert.equal(c.gate.timeout_seconds, 600, 'les défauts du garde-fou sont conservés');
  assert.equal(c.pr.max_lines, 300);
  assert.ok(c.pr.ignore.length, 'les motifs ignorés par défaut sont conservés');
  cleanup(dir);
});

test('docs_root doit rester dans le repo', () => {
  const dir = tempRepo({});
  for (const bad of ['../x', '.git/docs', '.', '/abs']) {
    assert.throws(() => docsRoot(dir, { docs_root: bad }), /docs_root/);
  }
  assert.ok(docsRoot(dir, { docs_root: 'docs/kaizen' }).endsWith(join('docs', 'kaizen')));
  cleanup(dir);
});

test('runBounded : code de sortie et sorties transmis', () => {
  const r = runBounded('node -e "console.log(1); console.error(2); process.exit(3)"', { timeoutMs: 10000 });
  assert.deepEqual([r.status, r.timedOut, r.stdout.trim(), r.stderr.trim()], [3, false, '1', '2']);
});

test('runBounded : au délai, aucun processus de l’arbre ne survit (shell, enfant, petit-enfant)', () => {
  // La commande lance un enfant qui lance un petit-enfant ; celui-ci écrirait un témoin après 1,5 s.
  const dir = tempRepo({
    'grandchild.js': "setTimeout(() => require('fs').writeFileSync('survived', 'x'), 1500);\n",
    'child.js': "require('child_process').spawn(process.execPath, ['grandchild.js'], { stdio: 'inherit' });\nsetTimeout(() => {}, 10000);\n",
  });
  const started = Date.now();
  const r = runBounded('node child.js', { cwd: dir, timeoutMs: 500 });
  assert.equal(r.timedOut, true);
  assert.equal(r.status, null);
  assert.ok(Date.now() - started < 1400, 'rendu la main au délai, sans attendre l’arbre');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2500);
  assert.equal(existsSync(join(dir, 'survived')), false, 'le petit-enfant a été tué');
  cleanup(dir);
});
