// PreToolUse hook: no git push of a branch without a recorded review.
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

const runReviewer = (dir, subagent_type, prompt = 'review') => hook('evidence', dir, { tool_name: 'Agent', tool_input: { subagent_type, prompt } });

function preTool(dir, tool_name, tool_input) {
  return spawnSync(process.execPath, [REVIEW_GATE], { input: JSON.stringify({ tool_name, tool_input, cwd: dir }), encoding: 'utf8' });
}

function bigBranch(config = {}) {
  const dir = tempRepo({ '.kaizen/config.json': config, 'app.js': 'a\n' });
  gitc(dir, ['checkout', '-qb', 'feat/big']);
  writeFiles(dir, { 'app.js': Array.from({ length: 30 }, (_, i) => `l${i}`).join('\n') });
  gitc(dir, ['commit', '-qam', 'feat: big change']);
  return dir;
}

function featureRepo(config = {}) {
  const dir = tempRepo({ '.kaizen/config.json': config, 'app.js': 'a\n' });
  gitc(dir, ['checkout', '-qb', 'feat/x']);
  writeFiles(dir, { 'app.js': 'a\nb\nc\n' });
  gitc(dir, ['commit', '-qam', 'feat: b and c']);
  return dir;
}

test('without a recorded review: the push is refused with the steps to follow', () => {
  const dir = featureRepo();
  const r = prePush(dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no review recorded/);
  assert.match(r.stderr, /review waive --reason/);
  assert.equal(cli(dir, ['review', 'check']).code, 1);
  cleanup(dir);
});

test('recorded review: push allowed, then refused beyond the unreviewed-lines ceiling', () => {
  const dir = featureRepo({ review: { max_unreviewed_lines: 3 } });
  assert.equal(cli(dir, ['review', 'record', '--verdict', 'ready']).code, 0);
  assert.equal(prePush(dir).status, 0);
  writeFiles(dir, { 'app.js': 'a\nb\nc\nd\n' });
  gitc(dir, ['commit', '-qam', 'fix: small fix']);
  assert.equal(prePush(dir).status, 0, '1 line under the ceiling');
  writeFiles(dir, { 'app.js': 'a\nb\nc\nd\ne\nf\ng\nh\n' });
  gitc(dir, ['commit', '-qam', 'feat: big addition']);
  const r = prePush(dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /lines changed since the review/);
  cleanup(dir);
});

test('the review covers reviewed uncommitted changes, and a ⛔ verdict without a fix blocks', () => {
  const dir = featureRepo({ review: { max_unreviewed_lines: 0 } });
  writeFiles(dir, { 'app.js': 'a\nb\nc\nd\n' });
  cli(dir, ['review', 'record', '--verdict', 'blocked']);
  gitc(dir, ['commit', '-qam', 'feat: d (reviewed before commit)']);
  const r = prePush(dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /⛔/);
  writeFiles(dir, { 'app.js': 'a\nb\nc\nD\n' });
  gitc(dir, ['commit', '-qam', 'fix: review fix']);
  cli(dir, ['review', 'record', '--verdict', 'ready']);
  assert.equal(prePush(dir).status, 0);
  cleanup(dir);
});

test('review evidence: beyond a light review, record requires reviewers that actually ran', () => {
  const dir = bigBranch();
  const refused = cli(dir, ['review', 'record', '--verdict', 'ready']);
  assert.notEqual(refused.code, 0);
  assert.match(refused.stderr, /no Kaizen reviewer launched/);
  runReviewer(dir, 'kaizen:plan-coherence-reviewer');
  runReviewer(dir, 'Explore');
  assert.notEqual(cli(dir, ['review', 'record', '--verdict', 'ready']).code, 0, 'plan reviewer or other agent: not evidence');
  runReviewer(dir, 'kaizen:correctness-reviewer');
  runReviewer(dir, 'general-purpose', '<contract>…</contract>\n<review-context>\nReviewer: security\n</review-context>');
  const rec = cli(dir, ['review', 'record', '--verdict', 'ready']).json;
  assert.deepEqual(rec.reviewers, ['correctness-reviewer', 'security-reviewer']);
  assert.equal(rec.depth, 'agents');
  assert.equal(prePush(dir).status, 0);
  writeFiles(dir, { 'app.js': `${readFileSync(join(dir, 'app.js'), 'utf8')}\nfix` });
  gitc(dir, ['commit', '-qam', 'fix: review fix']);
  const upd = cli(dir, ['review', 'record', '--verdict', 'ready']).json;
  assert.equal(upd.depth, 'update', 'small fix after review: update without a new reviewer');
  assert.deepEqual(upd.reviewers, ['correctness-reviewer', 'security-reviewer']);
  writeFiles(dir, { 'app.js': Array.from({ length: 120 }, (_, i) => `n${i}`).join('\n') });
  gitc(dir, ['commit', '-qam', 'feat: rewrite']);
  assert.notEqual(cli(dir, ['review', 'record', '--verdict', 'ready']).code, 0, 'beyond the ceiling: evidence only serves one review');
  cleanup(dir);
});

test('waiver: requested by the agent, effective only after the user message', () => {
  const dir = bigBranch();
  assert.notEqual(cli(dir, ['review', 'waive']).code, 0, 'reason required');
  const w = cli(dir, ['review', 'waive', '--reason', 'hotfix requested without review']).json;
  assert.equal(w.pending, true);
  assert.match(w.code, /^[A-F0-9]{6}$/);
  assert.equal(prePush(dir).status, 2, 'pending: still refused');
  assert.equal(cli(dir, ['review', 'status']).json.pending_waiver.reason, 'hotfix requested without review');
  const wrong = hook('confirm', dir, { prompt: 'kaizen waive 000000' });
  assert.match(wrong.stdout, /unknown or expired/);
  assert.equal(hook('confirm', dir, { prompt: 'hello' }).stdout, '', 'ordinary message ignored');
  const ok = hook('confirm', dir, { prompt: `yes go ahead, kaizen waive ${w.code.toLowerCase()}` });
  assert.match(ok.stdout, /confirmed by the user/);
  assert.equal(prePush(dir).status, 0);
  const st = cli(dir, ['review', 'status']).json;
  assert.equal(st.review.verdict, 'waived');
  assert.equal(st.review.confirmed_by, 'user (message)');
  assert.match(st.push.reason, /hotfix requested/);
  assert.match(hook('confirm', dir, { prompt: `kaizen waive ${w.code}` }).stdout, /unknown or expired/, 'single-use code');
  cleanup(dir);
});

test('evidence is written neither by hand nor by calling the hooks', () => {
  const dir = bigBranch();
  const write = preTool(dir, 'Write', { file_path: join(dir, '.kaizen/state/reviews.json'), content: '{}' });
  assert.equal(write.status, 2);
  assert.match(write.stderr, /is only written by the CLI/);
  assert.equal(preTool(dir, 'Edit', { file_path: join(dir, '.kaizen/state/review-evidence.json') }).status, 2);
  assert.equal(preTool(dir, 'Bash', { command: 'echo [] > .kaizen/state/review-evidence.json' }).status, 2);
  assert.equal(preTool(dir, 'Bash', { command: `echo '{"prompt":"kaizen waive ABC123"}' | node /p/scripts/review-hooks.mjs --confirm` }).status, 2);
  assert.equal(preTool(dir, 'Write', { file_path: join(dir, 'src/reviews.json') }).status, 0, 'outside .kaizen/state');
  assert.equal(preTool(dir, 'Bash', { command: 'cat fixtures/reviews.json' }).status, 0);
  cleanup(dir);
  const plain = tempRepo({ 'a.txt': '1' });
  assert.equal(preTool(plain, 'Write', { file_path: join(plain, '.kaizen/state/reviews.json') }).status, 0, 'repo without Kaizen');
  assert.equal(existsSync(join(plain, '.kaizen')), false);
  cleanup(plain);
});

test('evidence hooks inactive outside a Kaizen repo and outside the Agent tool', () => {
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

test('out of scope: other commands, repo without Kaizen, disabled, branch deletion', () => {
  const dir = featureRepo();
  assert.equal(prePush(dir, 'git status').status, 0);
  assert.equal(prePush(dir, 'echo git pushy').status, 0);
  assert.equal(prePush(dir, 'git push origin --delete feat/old').status, 0);
  assert.equal(prePush(dir, 'npm test && git push').status, 2, 'chained push detected');
  cleanup(dir);

  const bare = tempRepo({ 'app.js': 'a\n' });
  gitc(bare, ['checkout', '-qb', 'feat/y']);
  writeFiles(bare, { 'app.js': 'b\n' });
  gitc(bare, ['commit', '-qam', 'feat: y']);
  assert.equal(prePush(bare).status, 0, 'repo not initialized by Kaizen');
  cleanup(bare);

  const off = featureRepo({ review: { require_before_push: false } });
  assert.equal(prePush(off).status, 0);
  cleanup(off);
});

test('branch without code changes: nothing to review', () => {
  const dir = tempRepo({ '.kaizen/config.json': {}, 'app.js': 'a\n' });
  gitc(dir, ['checkout', '-qb', 'feat/empty']);
  assert.equal(prePush(dir).status, 0);
  cleanup(dir);
});

test('a push whose target is the default branch is guarded too, whatever branch it starts from', () => {
  const dir = featureRepo();
  // from feat/x, pushing it onto main: the code reaches main without any review
  assert.equal(prePush(dir, 'git push origin feat/x:main').status, 2, 'feat/x:main without a review');
  assert.equal(prePush(dir, 'git push origin HEAD:main').status, 2, 'HEAD:main without a review');
  assert.equal(prePush(dir, 'git push origin HEAD:refs/heads/main').status, 2, 'full ref');
  // after the review of that branch, the same push goes through
  assert.equal(cli(dir, ['review', 'record', '--verdict', 'ready']).code, 0);
  assert.equal(prePush(dir, 'git push origin HEAD:main').status, 0);
  cleanup(dir);
  // pushing main itself from main stays the git plugin's business
  const m = tempRepo({ '.kaizen/config.json': {}, 'app.js': 'a\n' });
  writeFiles(m, { 'app.js': 'a\nb\n' });
  gitc(m, ['commit', '-qam', 'feat: b']);
  assert.equal(prePush(m, 'git push origin main').status, 0);
  cleanup(m);
});

test('files left untracked during the review are not counted as changed at push time', () => {
  const dir = featureRepo({ review: { max_unreviewed_lines: 5 } });
  // a plan and a constitution written by brainstorm/plan, never committed: they are not part of the push
  writeFiles(dir, { 'docs/plans/p.md': Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n'), 'CONSTITUTION.md': 'x\n'.repeat(40) });
  assert.equal(cli(dir, ['review', 'record', '--verdict', 'ready']).code, 0);
  assert.equal(prePush(dir).status, 0, 'untracked files read by the review do not block the push');
  // a real change after the review still counts
  writeFiles(dir, { 'app.js': 'a\nb\nc\n' + Array.from({ length: 10 }, (_, i) => `n${i}`).join('\n') + '\n' });
  gitc(dir, ['commit', '-qam', 'feat: more']);
  assert.equal(prePush(dir).status, 2, 'committed lines beyond the ceiling still block');
  cleanup(dir);
});
