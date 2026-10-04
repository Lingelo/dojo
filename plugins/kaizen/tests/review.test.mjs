// Hook PreToolUse : pas de git push d'une branche sans revue enregistrée.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REVIEW_GATE, REVIEW_HOOKS, cleanup, cli, gitc, tempRepo, writeFiles } from './helpers.mjs';

function prePush(dir, command = 'git push -u origin feat/x') {
  return spawnSync(process.execPath, [REVIEW_GATE], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: dir }),
    encoding: 'utf8',
  });
}

function hook(mode, dir, payload) {
  return spawnSync(process.execPath, [REVIEW_HOOKS, `--${mode}`], { input: JSON.stringify({ cwd: dir, session_id: 'S1', ...payload }), encoding: 'utf8' });
}

const runReviewer = (dir, subagent_type, prompt = 'relis') => hook('evidence', dir, { tool_name: 'Agent', tool_input: { subagent_type, prompt } });

function preTool(dir, tool_name, tool_input) {
  return spawnSync(process.execPath, [REVIEW_GATE], { input: JSON.stringify({ tool_name, tool_input, cwd: dir }), encoding: 'utf8' });
}

function bigBranch(config = {}) {
  const dir = tempRepo({ '.kaizen/config.json': config, 'app.js': 'a\n' });
  gitc(dir, ['checkout', '-qb', 'feat/big']);
  writeFiles(dir, { 'app.js': Array.from({ length: 30 }, (_, i) => `l${i}`).join('\n') });
  gitc(dir, ['commit', '-qam', 'feat: gros changement']);
  return dir;
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

test('preuve de revue : au-delà de la revue légère, record exige des relecteurs réellement lancés', () => {
  const dir = bigBranch();
  const refused = cli(dir, ['review', 'record', '--verdict', 'ready']);
  assert.notEqual(refused.code, 0);
  assert.match(refused.stderr, /aucun relecteur Kaizen lancé/);
  runReviewer(dir, 'kaizen:plan-coherence-reviewer');
  runReviewer(dir, 'Explore');
  assert.notEqual(cli(dir, ['review', 'record', '--verdict', 'ready']).code, 0, 'relecteur de plan ou autre agent : pas une preuve');
  runReviewer(dir, 'kaizen:correctness-reviewer');
  runReviewer(dir, 'general-purpose', '<contrat>…</contrat>\n<contexte-de-revue>\nRelecteur : security\n</contexte-de-revue>');
  const rec = cli(dir, ['review', 'record', '--verdict', 'ready']).json;
  assert.deepEqual(rec.reviewers, ['correctness-reviewer', 'security-reviewer']);
  assert.equal(rec.depth, 'agents');
  assert.equal(prePush(dir).status, 0);
  writeFiles(dir, { 'app.js': `${readFileSync(join(dir, 'app.js'), 'utf8')}\ncorrectif` });
  gitc(dir, ['commit', '-qam', 'fix: correctif de revue']);
  const upd = cli(dir, ['review', 'record', '--verdict', 'ready']).json;
  assert.equal(upd.depth, 'mise à jour', 'petit correctif après revue : mise à jour sans nouveau relecteur');
  assert.deepEqual(upd.reviewers, ['correctness-reviewer', 'security-reviewer']);
  writeFiles(dir, { 'app.js': Array.from({ length: 120 }, (_, i) => `n${i}`).join('\n') });
  gitc(dir, ['commit', '-qam', 'feat: réécriture']);
  assert.notEqual(cli(dir, ['review', 'record', '--verdict', 'ready']).code, 0, 'au-delà du plafond : une preuve ne sert qu’une revue');
  cleanup(dir);
});

test('renonciation : demandée par l’agent, effective seulement après le message de l’utilisateur', () => {
  const dir = bigBranch();
  assert.notEqual(cli(dir, ['review', 'waive']).code, 0, 'raison obligatoire');
  const w = cli(dir, ['review', 'waive', '--reason', 'hotfix demandé sans revue']).json;
  assert.equal(w.pending, true);
  assert.match(w.code, /^[A-F0-9]{6}$/);
  assert.equal(prePush(dir).status, 2, 'en attente : toujours refusé');
  assert.equal(cli(dir, ['review', 'status']).json.pending_waiver.reason, 'hotfix demandé sans revue');
  const wrong = hook('confirm', dir, { prompt: 'kaizen waive 000000' });
  assert.match(wrong.stdout, /inconnu ou expiré/);
  assert.equal(hook('confirm', dir, { prompt: 'bonjour' }).stdout, '', 'message ordinaire ignoré');
  const ok = hook('confirm', dir, { prompt: `oui vas-y, kaizen waive ${w.code.toLowerCase()}` });
  assert.match(ok.stdout, /confirmée par l'utilisateur/);
  assert.equal(prePush(dir).status, 0);
  const st = cli(dir, ['review', 'status']).json;
  assert.equal(st.review.verdict, 'waived');
  assert.equal(st.review.confirmed_by, 'utilisateur (message)');
  assert.match(st.push.reason, /hotfix demandé/);
  assert.match(hook('confirm', dir, { prompt: `kaizen waive ${w.code}` }).stdout, /inconnu ou expiré/, 'code à usage unique');
  cleanup(dir);
});

test('les preuves ne s’écrivent ni à la main ni en appelant les hooks', () => {
  const dir = bigBranch();
  const write = preTool(dir, 'Write', { file_path: join(dir, '.kaizen/state/reviews.json'), content: '{}' });
  assert.equal(write.status, 2);
  assert.match(write.stderr, /ne s'écrivent que par le CLI/);
  assert.equal(preTool(dir, 'Edit', { file_path: join(dir, '.kaizen/state/review-evidence.json') }).status, 2);
  assert.equal(preTool(dir, 'Bash', { command: 'echo [] > .kaizen/state/review-evidence.json' }).status, 2);
  assert.equal(preTool(dir, 'Bash', { command: `echo '{"prompt":"kaizen waive ABC123"}' | node /p/scripts/review-hooks.mjs --confirm` }).status, 2);
  assert.equal(preTool(dir, 'Write', { file_path: join(dir, 'src/reviews.json') }).status, 0, 'hors .kaizen/state');
  assert.equal(preTool(dir, 'Bash', { command: 'cat fixtures/reviews.json' }).status, 0);
  cleanup(dir);
  const plain = tempRepo({ 'a.txt': '1' });
  assert.equal(preTool(plain, 'Write', { file_path: join(plain, '.kaizen/state/reviews.json') }).status, 0, 'repo sans Kaizen');
  assert.equal(existsSync(join(plain, '.kaizen')), false);
  cleanup(plain);
});

test('hooks de preuve inactifs hors repo Kaizen et hors outil Agent', () => {
  const plain = tempRepo({ 'a.txt': '1' });
  runReviewer(plain, 'kaizen:correctness-reviewer');
  assert.equal(existsSync(join(plain, '.kaizen')), false);
  cleanup(plain);
  const dir = bigBranch();
  hook('evidence', dir, { tool_name: 'Bash', tool_input: { subagent_type: 'kaizen:correctness-reviewer' } });
  assert.equal(existsSync(join(dir, '.kaizen/state/review-evidence.json')), false);
  runReviewer(dir, 'kaizen:testing-reviewer');
  assert.equal(JSON.parse(readFileSync(join(dir, '.kaizen/state/review-evidence.json'), 'utf8'))[0].reviewer, 'testing-reviewer');
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
