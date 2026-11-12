/**
 * Tests de `kioku push` (remote prive verifie, integration sans rebase, jamais de force) et de `kioku inbox-add`
 * (un fichier externe entre dans inbox/ en session de tri). `node --test hooks/push.test.mjs`
 * Coffre factice sous git, remote nu local ; la verification GitHub passe par un faux gh (KIOKU_GH, lu hors Claude Code).
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

const VAULT_HOOK = path.resolve('hooks/vault.mjs');
let root;
let vault;
let bare;

const put = (rel, text, base = vault) => {
  const file = path.join(base, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
};
const baseEnv = () => {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: vault, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  for (const k of ['VAULT_MODE', 'VAULT_DOMAIN', 'CLAUDECODE', 'KIOKU_GH', 'KIOKU_CIRCUIT']) delete env[k];
  return env;
};
const gitIn = (dir, ...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: baseEnv() });
const git = (...args) => gitIn(vault, ...args);
const run = (env, ...args) => spawnSync(process.execPath, [VAULT_HOOK, ...args], { cwd: vault, env: { ...baseEnv(), ...env }, encoding: 'utf8' });
const session = (mode, domain) => ({ VAULT_MODE: mode, ...(domain ? { VAULT_DOMAIN: domain } : {}) });
const configure = (dir) => {
  for (const [k, v] of [['user.name', 'Test'], ['user.email', 'test@example.invalid'], ['commit.gpgsign', 'false'], ['core.hooksPath', '/dev/null']]) gitIn(dir, 'config', k, v);
};
const fakeGh = (answer, code = 0) => {
  const file = path.join(root, `gh-${answer}-${code}`);
  writeFileSync(file, `#!/bin/sh\necho "$@" > "${file}.args"\necho ${answer}\nexit ${code}\n`);
  chmodSync(file, 0o755);
  return file;
};

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'vault-push-test-')));
  vault = path.join(root, 'coffre');
  bare = path.join(root, 'remote.git');
  mkdirSync(vault);
  put('kioku.config.json', JSON.stringify({ version: 1, domains: [{ id: 'pro' }, { id: 'perso' }], default_session: { mode: 'query', domain: 'pro' } }));
  put('wiki/pro/log.md', '# Journal\n');
  gitIn(root, 'init', '-q', '--bare', '-b', 'main', bare);
  git('init', '-q', '-b', 'main');
  configure(vault);
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  git('remote', 'add', 'origin', bare);
  git('push', '-q', '-u', 'origin', 'main');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('kioku push', () => {
  test('remote local : pousse les commits de la branche courante', () => {
    put('wiki/pro/log.md', '# Journal\n\nx\n');
    git('commit', '-q', '-am', 'b');
    const r = run(session('ingest', 'pro'), 'push');
    assert.equal(r.status, 0, r.stdout);
    assert.match(r.stdout, /pousse main -> origin \(depot local\) : 1 commit/);
    assert.equal(gitIn(bare, 'rev-parse', 'main').stdout, git('rev-parse', 'HEAD').stdout);
  });

  test('a jour : rien a pousser ; --dry-run ne pousse rien', () => {
    assert.match(run(session('query', 'pro'), 'push').stdout, /rien a pousser/);
    put('wiki/pro/log.md', '# Journal\n\ny\n');
    git('commit', '-q', '-am', 'c');
    const r = run(session('query', 'pro'), 'push', '--dry-run');
    assert.equal(r.status, 0);
    assert.match(r.stdout, /simulation : main -> origin \(depot local\) : 1 commit/);
    assert.notEqual(gitIn(bare, 'rev-parse', 'main').stdout, git('rev-parse', 'HEAD').stdout);
  });

  test('integre la branche distante (merge, sans rebase) avant de pousser', () => {
    const other = path.join(root, 'autre');
    gitIn(root, 'clone', '-q', bare, other);
    configure(other);
    put('wiki/pro/autre.md', 'z', other);
    gitIn(other, 'add', '-A');
    gitIn(other, 'commit', '-q', '-m', 'ailleurs');
    gitIn(other, 'push', '-q');
    put('wiki/pro/log.md', '# Journal\n\nici\n');
    git('commit', '-q', '-am', 'ici');
    const r = run(session('triage'), 'push');
    assert.equal(r.status, 0, r.stdout);
    assert.match(r.stdout, /apres integration de 1/);
    assert.ok(existsSync(path.join(vault, 'wiki/pro/autre.md')));
    assert.equal(gitIn(bare, 'rev-parse', 'main').stdout, git('rev-parse', 'HEAD').stdout);
  });

  test('conflit a l integration : merge annule, rien ne part', () => {
    const other = path.join(root, 'autre');
    gitIn(root, 'clone', '-q', bare, other);
    configure(other);
    put('wiki/pro/log.md', '# Journal\n\nla-bas\n', other);
    gitIn(other, 'commit', '-q', '-am', 'ailleurs');
    gitIn(other, 'push', '-q');
    put('wiki/pro/log.md', '# Journal\n\nici\n');
    git('commit', '-q', '-am', 'ici');
    const before = gitIn(bare, 'rev-parse', 'main').stdout;
    const r = run(session('ingest', 'pro'), 'push');
    assert.equal(r.status, 1);
    assert.match(r.stdout, /conflit ou bloquee, merge annule/);
    assert.equal(gitIn(bare, 'rev-parse', 'main').stdout, before);
    assert.equal(existsSync(path.join(vault, '.git', 'MERGE_HEAD')), false, 'aucun merge laisse en cours');
  });

  test('GitHub : prive verifie par gh ; public, gh en erreur ou absent : refus', () => {
    git('remote', 'set-url', 'origin', 'git@github.com:acme/coffre.git');
    put('wiki/pro/log.md', '# Journal\n\nz\n');
    git('commit', '-q', '-am', 'd');
    const pub = run({ KIOKU_GH: fakeGh('false') }, 'push');
    assert.equal(pub.status, 1);
    assert.match(pub.stdout, /acme\/coffre n'est pas prive/);
    assert.match(readFileSync(`${fakeGh('false')}.args`, 'utf8'), /repo view acme\/coffre --json isPrivate/);
    assert.match(run({ KIOKU_GH: fakeGh('x', 1) }, 'push').stdout, /gh repo view acme\/coffre a echoue/);
    assert.match(run({ KIOKU_GH: path.join(root, 'absent') }, 'push').stdout, /gh indisponible/);
    // gh dit prive : la verification passe, le push vers le faux GitHub echoue ensuite (aucun reseau dans les tests)
    const priv = run({ KIOKU_GH: fakeGh('true') }, 'push', '--dry-run');
    assert.doesNotMatch(priv.stdout, /refuse/);
  });

  test('dans Claude Code, KIOKU_GH est ignore : une session ne remplace pas la verification', () => {
    git('remote', 'set-url', 'origin', 'https://github.com/acme/coffre');
    // PATH avec git seul : le vrai gh introuvable, le faux (KIOKU_GH) ne doit pas etre lu.
    const bin = path.join(root, 'bin');
    mkdirSync(bin);
    symlinkSync(spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim(), path.join(bin, 'git'));
    const r = run({ ...session('ingest', 'pro'), CLAUDECODE: '1', KIOKU_GH: fakeGh('true'), PATH: bin }, 'push');
    assert.equal(r.status, 1);
    assert.match(r.stdout, /gh indisponible/);
  });

  test('hote autre que GitHub : confidentialite inverifiable, refus', () => {
    git('remote', 'set-url', 'origin', 'https://user:secret@gitlab.example.com/acme/coffre.git');
    const r = run({}, 'push');
    assert.equal(r.status, 1);
    assert.match(r.stdout, /hors GitHub/);
    assert.doesNotMatch(r.stdout, /secret/, 'les identifiants de l URL ne sont pas affiches');
  });

  test('session setup refusee ; tete detachee refusee', () => {
    assert.match(run(session('setup'), 'push').stdout, /query, ingest ou triage seulement/);
    git('switch', '-q', '--detach');
    assert.match(run({}, 'push').stdout, /tete detachee/);
  });
});

describe('kioku inbox-add', () => {
  test('triage : copie un fichier externe dans inbox/, l original reste', () => {
    const src = put('note.md', 'contenu', root);
    const r = run(session('triage'), 'inbox-add', src);
    assert.equal(r.status, 0, r.stdout);
    assert.match(r.stdout, /entre {4}inbox\/note\.md/);
    assert.equal(readFileSync(path.join(vault, 'inbox', 'note.md'), 'utf8'), 'contenu');
    assert.ok(existsSync(src));
  });

  test('hors triage : refuse en session ; terminal libre', () => {
    const src = put('note.md', 'x', root);
    assert.match(run(session('ingest', 'pro'), 'inbox-add', src).stdout, /triage seulement/);
    assert.match(run({ CLAUDECODE: '1' }, 'inbox-add', src).stdout, /triage seulement/, 'default_session query/pro');
    assert.equal(run({}, 'inbox-add', src).status, 0);
  });

  test('refus : fichier du coffre, lien, dossier, absent, deja present, cache', () => {
    const inVault = put('raw/pro/meetings/a.md', 'brut');
    const link = path.join(root, 'lien.md');
    symlinkSync(inVault, link);
    mkdirSync(path.join(root, 'dossier'));
    const dup = put('dup.md', 'a', root);
    put('inbox/dup.md', 'deja');
    const hidden = put('.cache.md', 'x', root);
    const t = session('triage');
    assert.match(run(t, 'inbox-add', inVault).stdout, /deja dans le coffre/);
    assert.match(run(t, 'inbox-add', link).stdout, /lien symbolique/);
    assert.match(run(t, 'inbox-add', path.join(root, 'dossier')).stdout, /pas un fichier/);
    assert.match(run(t, 'inbox-add', path.join(root, 'absent.md')).stdout, /introuvable/);
    assert.match(run(t, 'inbox-add', dup).stdout, /existe deja/);
    assert.equal(readFileSync(path.join(vault, 'inbox', 'dup.md'), 'utf8'), 'deja');
    assert.match(run(t, 'inbox-add', hidden).stdout, /cache/);
  });

  test('worktree git : refuse sans --allow-worktree', () => {
    const wt = path.join(root, 'wt');
    git('worktree', 'add', '-q', wt);
    const src = put('note.md', 'x', root);
    const env = { ...baseEnv(), CLAUDE_PROJECT_DIR: wt, VAULT_MODE: 'triage' };
    const r = spawnSync(process.execPath, [VAULT_HOOK, 'inbox-add', src], { cwd: wt, env, encoding: 'utf8' });
    assert.match(r.stdout, /worktree/);
    const ok = spawnSync(process.execPath, [VAULT_HOOK, 'inbox-add', src, '--allow-worktree'], { cwd: wt, env, encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stdout);
  });
});
