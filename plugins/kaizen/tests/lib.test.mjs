import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CONFIG, detectStack, docsRoot, launchFor, loadConfig, parseFrontmatter, runBounded } from '../scripts/lib.mjs';
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

test('models: off by default, merged key by key, effort per command then per phase', () => {
  const dir = tempRepo({
    '.kaizen/config.json': { models: { enabled: true, build: 'opus', effort: { build: 'high' } } },
    '.kaizen/config.local.json': { models: { effort: { review: 'xhigh' } } },
  });
  const c = loadConfig(dir);
  assert.equal(c.models.enabled, true);
  assert.equal(c.models.build, 'opus');
  assert.equal(c.models.design, 'opus', 'defaults are kept');
  assert.equal(c.models.escalate_after, 2);
  assert.equal(c.models.escalate_to, 'opus');
  assert.equal(c.models.escalate_effort, 'high');
  assert.deepEqual(c.models.effort, { design: 'medium', plan: 'high', build: 'high', watch: 'low', learn: 'low', metrics: 'low', review: 'xhigh', security: 'high' });
  const bare = tempRepo({});
  assert.equal(loadConfig(bare).models.enabled, false, 'off until measured');
  cleanup(bare);
  const on = { models: { enabled: true, design: 'opus', build: 'sonnet', review: 'opus', effort: { plan: 'high', build: 'medium', review: 'high' } } };
  assert.deepEqual(launchFor('/kaizen:build', on), { phase: 'build', model: 'sonnet', effort: 'medium', command: 'claude --model sonnet --effort medium' });
  assert.equal(launchFor('/kaizen:plan', on).command, 'claude --model opus --effort high');
  assert.equal(launchFor('/kaizen:spec <what to build>', on).command, 'claude --model opus', 'no effort set for the phase: the default');
  assert.equal(launchFor('/kaizen:watch', on).model, 'sonnet');
  assert.equal(launchFor('/kaizen:review', on).command, 'claude --model opus --effort high');
  assert.equal(launchFor('/kaizen:setup', on), null, 'outside the cycle');
  assert.equal(launchFor('make the checks green', on), null);
  assert.equal(launchFor('/kaizen:build', { models: { ...on.models, enabled: false } }), null);
  cleanup(dir);
});

test('models: the default split — Opus medium to decide, plan and security high, Sonnet medium to build, low for the follow-up', () => {
  const on = { models: { ...DEFAULT_CONFIG.models, enabled: true } };
  const run = (c) => launchFor(`/kaizen:${c}`, on).command;
  for (const c of ['ideate', 'spec', 'adr', 'doubt', 'migrate', 'constraints']) assert.equal(run(c), 'claude --model opus --effort medium', c);
  assert.equal(run('plan'), 'claude --model opus --effort high');
  for (const c of ['build', 'test', 'code-simplify', 'webperf', 'debug']) assert.equal(run(c), 'claude --model sonnet --effort medium', c);
  for (const c of ['watch', 'learn', 'metrics']) assert.equal(run(c), 'claude --model sonnet --effort low', c);
  for (const c of ['review', 'ship']) assert.equal(run(c), 'claude --model opus --effort medium', c);
  assert.equal(run('security'), 'claude --model opus --effort high');
  assert.equal(launchFor('/kaizen:build', { models: DEFAULT_CONFIG.models }), null, 'off by default');
  const levels = ['low', 'medium', 'high', 'xhigh', 'max'];
  for (const [k, v] of Object.entries(DEFAULT_CONFIG.models.effort)) assert.ok(levels.includes(v), `effort.${k}: ${v}`);
  assert.ok(levels.includes(DEFAULT_CONFIG.models.escalate_effort));
  assert.doesNotMatch(JSON.stringify(DEFAULT_CONFIG.models), /haiku/, 'no Haiku anywhere');
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
