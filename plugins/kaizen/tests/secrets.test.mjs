// Secret scan: patterns, commit plan, the PreToolUse hook and `secrets scan`.
// Fake secrets are assembled at runtime so that this file never contains one itself.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';
import { commitPlan, scanDiff, scanLine } from '../scripts/secrets.mjs';
import { PLUGIN, cleanup, cli, gitc, tempRepo, writeFiles } from './helpers.mjs';

const SECRET_GATE = join(PLUGIN, 'scripts', 'secret-gate.mjs');
const GH = 'ghp' + '_' + 'a1B2c3D4'.repeat(4) + 'e5F6';
const AWS = 'AKIA' + 'Q3EXZ7RT2LMN4PVW';
const PEM = '-----BEGIN ' + 'RSA PRIVATE KEY-----';

function hook(dir, command, extra = {}) {
  const r = spawnSync(process.execPath, [SECRET_GATE], { cwd: dir, encoding: 'utf8', input: JSON.stringify({ tool_name: 'Bash', cwd: dir, tool_input: { command }, ...extra }) });
  return { code: r.status, stderr: r.stderr };
}

test('patterns: real-looking keys found and redacted, placeholders ignored', () => {
  for (const s of [GH, AWS, PEM, 'postgres://app:' + 's3cr3tpass@db.internal:5432/app']) {
    const f = scanLine(`const x = "${s}";`);
    assert.ok(f, s.slice(0, 6));
    assert.ok(!f.preview.includes(s.slice(4)), 'the preview must not reveal the secret');
  }
  assert.equal(scanLine('const key = "sk_live_' + 'EXAMPLE'.repeat(4) + '";'), null);
  assert.equal(scanLine('DATABASE_URL=postgres://user:${DB_PASSWORD}@db/app'), null);
  assert.equal(scanLine('const ok = 42;'), null);
});

test('scanDiff: added lines only, new-file line numbers, generated files skipped', () => {
  const diff = [
    'diff --git a/src/a.js b/src/a.js', '--- a/src/a.js', '+++ b/src/a.js',
    '@@ -1,0 +10,2 @@', `+const t = "${GH}";`, `+ok();`,
    'diff --git a/old.js b/old.js', '--- a/old.js', '+++ b/old.js', '@@ -3 +3 @@', `-const k = "${AWS}";`, '+const k = env.KEY;',
    'diff --git a/package-lock.json b/package-lock.json', '--- a/package-lock.json', '+++ b/package-lock.json', '@@ -1 +1 @@', `+"${AWS}"`,
  ].join('\n');
  assert.deepEqual(scanDiff(diff).map((f) => `${f.file}:${f.line}`), ['src/a.js:10']);
  assert.deepEqual(scanDiff(diff, { ignore: ['src/**'] }), []);
});

test('commitPlan: what the command is about to commit', () => {
  assert.equal(commitPlan('git status').commit, false);
  assert.equal(commitPlan('git log --grep commit').commit, false);
  assert.deepEqual(commitPlan('git commit -m "feat: add . and -a"'), { commit: true, noVerify: false, staged: true, worktree: false, untrackedFiles: false, paths: [] });
  assert.equal(commitPlan('git commit -am "x"').worktree, true);
  assert.equal(commitPlan('git commit -nm "x"').noVerify, true);
  assert.equal(commitPlan('git commit --no-verify -m x').noVerify, true);
  const add = commitPlan('git add src/a.js src/b.js && git commit -m "x"');
  assert.deepEqual([add.worktree, add.untrackedFiles, add.paths], [true, true, ['src/a.js', 'src/b.js']]);
  assert.deepEqual(commitPlan('git add -A; git commit -m x').paths, []);
  assert.equal(commitPlan('git add -u && git commit -m x').untrackedFiles, false);
  assert.deepEqual(commitPlan('git commit -m "x" -- src/a.js').paths, ['src/a.js']);
});

test('hook: refuses a commit carrying a secret, including one added in the same command', () => {
  const dir = tempRepo({ 'README.md': '# app\n' });
  try {
    writeFiles(dir, { 'src/config.js': `export const token = "${GH}";\n`, 'src/ok.js': 'export const ok = 1;\n' });
    let r = hook(dir, 'git add -A && git commit -m "feat: config"');
    assert.equal(r.code, 2, r.stderr);
    assert.match(r.stderr, /src\/config\.js:1 — GitHub token/);
    assert.ok(!r.stderr.includes(GH), 'the secret is never printed');
    assert.equal(hook(dir, 'git add src/ok.js && git commit -m "feat: ok"').code, 0);
    gitc(dir, ['add', 'src/config.js']);
    assert.equal(hook(dir, 'git commit -m "feat: config"').code, 2);
    assert.match(hook(dir, 'git commit --no-verify -m "x"').stderr, /--no-verify/);
    gitc(dir, ['reset', '-q']);
    assert.equal(hook(dir, 'git commit -m "docs: nothing staged"').code, 0);
  } finally {
    cleanup(dir);
  }
});

test('hook: out of scope, configurable, and fails open', () => {
  const dir = tempRepo({ 'README.md': '# app\n' });
  try {
    writeFiles(dir, { 'test/fixtures/key.pem': `${PEM}\nMIIE\n` });
    gitc(dir, ['add', '-A']);
    assert.equal(hook(dir, 'ls -la').code, 0);
    assert.equal(hook(dir, 'git commit -m x', { tool_name: 'Read' }).code, 0);
    assert.equal(hook(dir, 'git commit -m x').code, 2);
    writeFiles(dir, { '.kaizen/config.json': { secrets: { ignore: ['test/fixtures/**'] } } });
    assert.equal(hook(dir, 'git commit -m x').code, 0);
    writeFiles(dir, { '.kaizen/config.json': { secrets: { scan: false } } });
    assert.equal(hook(dir, 'git commit --no-verify -m x').code, 0);
    const bad = spawnSync(process.execPath, [SECRET_GATE], { cwd: dir, encoding: 'utf8', input: 'not json' });
    assert.equal(bad.status, 0);
  } finally {
    cleanup(dir);
  }
});

test('CLI secrets scan: working changes, staged, branch range', () => {
  const dir = tempRepo({ 'README.md': '# app\n' });
  try {
    assert.equal(cli(dir, ['secrets', 'scan']).code, 0);
    writeFiles(dir, { 'deploy.sh': `export AWS_ACCESS_KEY_ID=${AWS}\n` });
    const r = cli(dir, ['secrets', 'scan', '--json']);
    assert.equal(r.code, 1);
    assert.deepEqual(r.json.findings.map((f) => [f.file, f.line, f.type]), [['deploy.sh', 1, 'AWS access key ID']]);
    assert.equal(cli(dir, ['secrets', 'scan', '--staged']).code, 0);
    gitc(dir, ['checkout', '-q', '-b', 'feat/x'], ['add', '-A'], ['commit', '-qm', 'feat: deploy']);
    assert.equal(cli(dir, ['secrets', 'scan']).code, 0);
    assert.equal(cli(dir, ['secrets', 'scan', '--base', 'main']).code, 1);
    assert.equal(cli(dir, ['secrets', 'nope']).code !== 0, true);
  } finally {
    cleanup(dir);
  }
});
