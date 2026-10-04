import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { detectStack, docsRoot, loadConfig, parseFrontmatter, runBounded } from '../scripts/lib.mjs';
import { cleanup, tempRepo } from './helpers.mjs';

test('frontmatter: scalars, quotes, inline and dash lists, blocks, comments', () => {
  const { data, body, error } = parseFrontmatter(
    [
      '---',
      'title: "Title: with a colon"',
      'tags: [a, "b, c", d]',
      'symptoms:',
      '  - "`npm ci` fails: EINTEGRITY"',
      '  - simple',
      'status: proposed   # commentaire',
      'retire_when: "when bug #123 is fixed"',
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
  assert.equal(data.title, 'Title: with a colon');
  assert.deepEqual(data.tags, ['a', 'b, c', 'd']);
  assert.deepEqual(data.symptoms, ['`npm ci` fails: EINTEGRITY', 'simple']);
  assert.equal(data.status, 'proposed');
  assert.equal(data.retire_when, 'when bug #123 is fixed');
  assert.equal(data.flag, true);
  assert.equal(data.notes, 'ligne 1\nligne 2');
  assert.deepEqual(data.empty, []);
  assert.equal(body, 'corps');
});

test('missing frontmatter or unreadable line', () => {
  assert.equal(parseFrontmatter('no frontmatter').data, null);
  assert.match(parseFrontmatter('---\n???\n---\n').error, /unreadable/);
});

test('stack detection: node (pnpm) without the placeholder test, python, go', () => {
  const node = tempRepo({ 'package.json': { scripts: { test: 'echo "Error: no test specified" && exit 1', lint: 'eslint .', typecheck: 'tsc' } }, 'pnpm-lock.yaml': '' });
  const d = detectStack(node);
  assert.deepEqual(d.stacks, ['node (pnpm)']);
  assert.equal(d.verify.test, undefined, 'the npm init placeholder test script is ignored');
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
  assert.equal(c.gate.timeout_seconds, 600, 'gate defaults are kept');
  assert.equal(c.pr.max_lines, 300);
  assert.ok(c.pr.ignore.length, 'default ignore patterns are kept');
  cleanup(dir);
});

test('docs_root must stay inside the repo', () => {
  const dir = tempRepo({});
  for (const bad of ['../x', '.git/docs', '.', '/abs']) {
    assert.throws(() => docsRoot(dir, { docs_root: bad }), /docs_root/);
  }
  assert.ok(docsRoot(dir, { docs_root: 'docs/kaizen' }).endsWith(join('docs', 'kaizen')));
  cleanup(dir);
});

test('runBounded: exit code and output passed through', () => {
  const r = runBounded('node -e "console.log(1); console.error(2); process.exit(3)"', { timeoutMs: 10000 });
  assert.deepEqual([r.status, r.timedOut, r.stdout.trim(), r.stderr.trim()], [3, false, '1', '2']);
});

test('runBounded: at the timeout, no process of the tree survives (shell, child, grandchild)', () => {
  // The command starts a child that starts a grandchild; the latter would write a marker after 1.5 s.
  const dir = tempRepo({
    'grandchild.js': "setTimeout(() => require('fs').writeFileSync('survived', 'x'), 1500);\n",
    'child.js': "require('child_process').spawn(process.execPath, ['grandchild.js'], { stdio: 'inherit' });\nsetTimeout(() => {}, 10000);\n",
  });
  const started = Date.now();
  const r = runBounded('node child.js', { cwd: dir, timeoutMs: 500 });
  assert.equal(r.timedOut, true);
  assert.equal(r.status, null);
  assert.ok(Date.now() - started < 8000, 'returned at the timeout, without waiting for the child (10 s)');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2500);
  assert.equal(existsSync(join(dir, 'survived')), false, 'the grandchild was killed');
  cleanup(dir);
});
