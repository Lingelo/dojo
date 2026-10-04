// Hook PreToolUse : pas de git push d'une branche sans revue enregistrée.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { REVIEW_GATE, cleanup, cli, gitc, tempRepo, writeFiles } from './helpers.mjs';

function prePush(dir, command = 'git push -u origin feat/x') {
  return spawnSync(process.execPath, [REVIEW_GATE], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: dir }),
    encoding: 'utf8',
  });
}

function featureRepo(config = {}) {
  const dir = tempRepo({ '.kaizen/config.json': config, 'app.js': 'a\n' });
  gitc(dir, ['checkout', '-qb', 'feat/x']);
  writeFiles(dir, { 'app.js': 'a\nb\nc\n' });
  gitc(dir, ['commit', '-qam', 'feat: b et c']);
  return dir;
}

test('sans revue enregistrée : le push est refusé avec la marche à suivre', () => {
  const dir = featureRepo();
  const r = prePush(dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /aucune revue enregistrée/);
  assert.match(r.stderr, /review waive --reason/);
  assert.equal(cli(dir, ['review', 'check']).code, 1);
  cleanup(dir);
});

test('revue enregistrée : push autorisé, puis refusé au-delà du plafond de lignes non relues', () => {
  const dir = featureRepo({ review: { max_unreviewed_lines: 3 } });
  assert.equal(cli(dir, ['review', 'record', '--verdict', 'ready']).code, 0);
  assert.equal(prePush(dir).status, 0);
  writeFiles(dir, { 'app.js': 'a\nb\nc\nd\n' });
  gitc(dir, ['commit', '-qam', 'fix: petit correctif']);
  assert.equal(prePush(dir).status, 0, '1 ligne sous le plafond');
  writeFiles(dir, { 'app.js': 'a\nb\nc\nd\ne\nf\ng\nh\n' });
  gitc(dir, ['commit', '-qam', 'feat: gros ajout']);
  const r = prePush(dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /lignes modifiées depuis la revue/);
  cleanup(dir);
});

test('la revue couvre le non commité relu, et un verdict ⛔ sans correctif bloque', () => {
  const dir = featureRepo({ review: { max_unreviewed_lines: 0 } });
  writeFiles(dir, { 'app.js': 'a\nb\nc\nd\n' });
  cli(dir, ['review', 'record', '--verdict', 'blocked']);
  gitc(dir, ['commit', '-qam', 'feat: d (relu avant commit)']);
  const r = prePush(dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /⛔/);
  writeFiles(dir, { 'app.js': 'a\nb\nc\nD\n' });
  gitc(dir, ['commit', '-qam', 'fix: correctif de revue']);
  cli(dir, ['review', 'record', '--verdict', 'ready']);
  assert.equal(prePush(dir).status, 0);
  cleanup(dir);
});

test('renonciation explicite tracée ; raison obligatoire', () => {
  const dir = featureRepo();
  assert.notEqual(cli(dir, ['review', 'waive']).code, 0);
  const w = cli(dir, ['review', 'waive', '--reason', 'hotfix demandé sans revue']).json;
  assert.equal(w.verdict, 'waived');
  assert.equal(prePush(dir).status, 0);
  assert.match(cli(dir, ['review', 'status']).json.push.reason, /hotfix demandé/);
  cleanup(dir);
});

test('hors périmètre : autres commandes, repo sans Kaizen, désactivation, suppression de branche', () => {
  const dir = featureRepo();
  assert.equal(prePush(dir, 'git status').status, 0);
  assert.equal(prePush(dir, 'echo git pushy').status, 0);
  assert.equal(prePush(dir, 'git push origin --delete feat/old').status, 0);
  assert.equal(prePush(dir, 'npm test && git push').status, 2, 'push chaîné détecté');
  cleanup(dir);

  const bare = tempRepo({ 'app.js': 'a\n' });
  gitc(bare, ['checkout', '-qb', 'feat/y']);
  writeFiles(bare, { 'app.js': 'b\n' });
  gitc(bare, ['commit', '-qam', 'feat: y']);
  assert.equal(prePush(bare).status, 0, 'repo non initialisé par Kaizen');
  cleanup(bare);

  const off = featureRepo({ review: { require_before_push: false } });
  assert.equal(prePush(off).status, 0);
  cleanup(off);
});

test('branche sans changement de code : rien à relire', () => {
  const dir = tempRepo({ '.kaizen/config.json': {}, 'app.js': 'a\n' });
  gitc(dir, ['checkout', '-qb', 'feat/vide']);
  assert.equal(prePush(dir).status, 0);
  cleanup(dir);
});
