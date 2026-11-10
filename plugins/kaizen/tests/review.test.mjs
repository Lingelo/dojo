// No git push of a branch without a review: agent-skills' review records itself (review-hooks.mjs),
// the PreToolUse hook (review-gate.mjs) decides.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REVIEW_GATE, REVIEW_HOOKS, cleanup, cli, gitc, personaReview, tempRepo, writeFiles } from './helpers.mjs';

function prePush(dir, command = 'git push -u origin feat/x') {
  return spawnSync(process.execPath, [REVIEW_GATE], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: dir }),
    encoding: 'utf8',
  });
}

function hook(mode, dir, payload) {
  return spawnSync(process.execPath, [REVIEW_HOOKS, `--${mode}`], { input: JSON.stringify({ cwd: dir, session_id: 'S1', ...payload }), encoding: 'utf8' });
}


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

// Strict mode (typed codes, push refused): what these tests hold. The defaults are "ask" (see below).
const STRICT = { review: { require_before_push: true }, approvals: 'code' };

function featureRepo(config = {}) {
  const dir = tempRepo({ '.kaizen/config.json': { ...STRICT, ...config }, 'app.js': 'a\n' });
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
  assert.equal(personaReview(dir).code, 0);
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
  personaReview(dir, '**Verdict:** REQUEST CHANGES\n\n### Critical Issues\n- [app.js:4] d is wrong\n');
  gitc(dir, ['commit', '-qam', 'feat: d (reviewed before commit)']);
  const r = prePush(dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /⛔/);
  writeFiles(dir, { 'app.js': 'a\nb\nc\nD\n' });
  gitc(dir, ['commit', '-qam', 'fix: review fix']);
  personaReview(dir);
  assert.equal(prePush(dir).status, 0);
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
  assert.equal(preTool(dir, 'Edit', { file_path: join(dir, '.kaizen/state/review-pending.json') }).status, 2);
  assert.equal(preTool(dir, 'Bash', { command: 'echo null > .kaizen/state/review-pending.json' }).status, 2);
  assert.equal(preTool(dir, 'Bash', { command: `echo '{"prompt":"kaizen waive ABC123"}' | node /p/scripts/review-hooks.mjs --confirm` }).status, 2);
  assert.equal(preTool(dir, 'Write', { file_path: join(dir, 'src/reviews.json') }).status, 0, 'outside .kaizen/state');
  assert.equal(preTool(dir, 'Bash', { command: 'cat fixtures/reviews.json' }).status, 0);
  cleanup(dir);
  const plain = tempRepo({ 'a.txt': '1' });
  assert.equal(preTool(plain, 'Write', { file_path: join(plain, '.kaizen/state/reviews.json') }).status, 0, 'repo without Kaizen');
  assert.equal(existsSync(join(plain, '.kaizen')), false);
  cleanup(plain);
});

test('out of scope: other commands, repo without Kaizen, disabled, branch deletion', () => {
  const dir = featureRepo();
  assert.equal(prePush(dir, 'git status').status, 0);
  assert.equal(prePush(dir, 'echo git pushy').status, 0);
  assert.equal(prePush(dir, 'git push origin --delete feat/old').status, 0);
  assert.equal(prePush(dir, 'npm test && git push').status, 2, 'chained push detected');
  assert.equal(prePush(dir, '/usr/bin/git push').status, 2, 'git through a path');
  assert.equal(prePush(dir, 'git --no-pager push').status, 2, 'global option before push');
  assert.equal(prePush(dir, 'gitk push').status, 0);
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

test('require_before_push "ask": the user judges the push, Claude Code asks them', () => {
  const dir = featureRepo({ review: { require_before_push: 'ask' } });
  // first push: stopped, Claude must ask the user with the review as the first option
  const first = prePush(dir);
  assert.equal(first.status, 2);
  assert.match(first.stderr, /feat\/x: no review recorded/);
  assert.match(first.stderr, /1\. "Run the review \(Recommended\)"[\s\S]*2\. "Push without a review"/);
  // second push of the same commit: the user chose to skip — Claude Code's prompt confirms it
  const second = prePush(dir);
  assert.equal(second.status, 0);
  const out = JSON.parse(second.stdout).hookSpecificOutput;
  assert.equal(out.permissionDecision, 'ask');
  assert.match(out.permissionDecisionReason, /without a review — confirm/);
  assert.match(out.additionalContext, /declined.*run \/kaizen:review/);
  // the offer is used up: the next push asks again
  assert.equal(prePush(dir).status, 2);
  // a new commit voids a pending offer
  writeFiles(dir, { 'app.js': 'a\nb\nc\nd\n' });
  gitc(dir, ['commit', '-qam', 'feat: d']);
  assert.equal(prePush(dir).status, 2, 'offer was for the previous commit');
  // Claude cannot forge the offer
  assert.equal(prePush(dir, 'echo {} > .kaizen/state/push-offers.json').status, 2);
  const check = cli(dir, ['review', 'check']);
  assert.equal(check.code, 1);
  assert.equal(check.json.ask, true, 'skills see that the user decides');
  // a reviewed branch is not asked about
  assert.equal(personaReview(dir).code, 0);
  const reviewed = prePush(dir);
  assert.equal(reviewed.status, 0);
  assert.equal(reviewed.stdout, '');
  // more code after the review: asked again, the second push reaches the prompt, once
  writeFiles(dir, { 'app.js': `${'x\n'.repeat(120)}` });
  gitc(dir, ['commit', '-qam', 'feat: more']);
  assert.equal(prePush(dir).status, 2, 'question first');
  assert.equal(JSON.parse(prePush(dir).stdout).hookSpecificOutput.permissionDecision, 'ask');
  assert.equal(prePush(dir).status, 2, 'single use');
  // other spellings of git push are seen by the review hook too
  for (const c of ['/usr/bin/git push', 'git --no-pager push origin feat/x', 'git -C . push']) {
    const r = prePush(dir, c);
    assert.ok(r.status === 2 || /"permissionDecision":"ask"/.test(r.stdout), `${c}: question or prompt, never silent`);
  }
  cleanup(dir);
});

test('approvals "ask": a review waiver without a typed code, confirmed in Claude Code\'s prompt', () => {
  const dir = featureRepo({ approvals: 'ask' });
  const w = cli(dir, ['review', 'waive', '--reason', 'hotfix']).json;
  assert.match(w.instruction, /1\. "Run the review \(Recommended\)", 2\. "Push without a review"/);
  assert.equal(cli(dir, ['confirm', w.code]).code, 2, 'not asked in the prompt yet');
  const asked = prePush(dir, `node kaizen.mjs confirm ${w.code}`);
  assert.equal(JSON.parse(asked.stdout).hookSpecificOutput.permissionDecision, 'ask');
  assert.equal(cli(dir, ['confirm', w.code]).json.entry.confirmed_by, 'user (prompt)');
  assert.equal(prePush(dir).status, 0, 'waived');
  // default "code": confirm is refused, the user types the code
  const code = featureRepo();
  const w2 = cli(code, ['review', 'waive', '--reason', 'x']).json;
  assert.match(w2.instruction, /kaizen waive/);
  assert.equal(prePush(code, `node kaizen.mjs confirm ${w2.code}`).stdout, '');
  assert.match(cli(code, ['confirm', w2.code]).stderr, /approvals is "code"/);
  cleanup(dir);
  cleanup(code);
});

test('defaults: no code to type anywhere — push and approvals are "ask"', () => {
  const dir = tempRepo({ '.kaizen/config.json': {}, 'app.js': 'a\n' });
  gitc(dir, ['checkout', '-qb', 'feat/x']);
  writeFiles(dir, { 'app.js': 'a\nb\nc\n' });
  gitc(dir, ['commit', '-qam', 'feat: b and c']);
  const first = prePush(dir);
  assert.equal(first.status, 2);
  assert.match(first.stderr, /"Run the review \(Recommended\)"/);
  assert.doesNotMatch(first.stderr, /kaizen waive/);
  assert.match(cli(dir, ['review', 'waive', '--reason', 'x']).json.instruction, /AskUserQuestion/);
  cleanup(dir);
});

test('bypass-permissions mode: Kaizen cannot ask the user, the skip is refused', () => {
  const dir = featureRepo({ review: { require_before_push: 'ask' } });
  const push = () => spawnSync(process.execPath, [REVIEW_GATE], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push' }, cwd: dir, permission_mode: 'bypassPermissions' }), encoding: 'utf8' });
  assert.equal(push().status, 2, 'first push: the question');
  const second = push();
  assert.equal(second.status, 2, 'no prompt to confirm the skip in bypass mode');
  assert.match(second.stderr, /bypass-permissions mode/);
  cleanup(dir);
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
  assert.equal(personaReview(dir).code, 0);
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
  // agent-skills' planning files, never committed: they are not part of the push
  writeFiles(dir, { 'tasks/plan.md': Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n'), 'SPEC.md': 'x\n'.repeat(40) });
  assert.equal(personaReview(dir).code, 0);
  assert.equal(prePush(dir).status, 0, 'untracked files read by the review do not block the push');
  // a real change after the review still counts
  writeFiles(dir, { 'app.js': 'a\nb\nc\n' + Array.from({ length: 10 }, (_, i) => `n${i}`).join('\n') + '\n' });
  gitc(dir, ['commit', '-qam', 'feat: more']);
  assert.equal(prePush(dir).status, 2, 'committed lines beyond the ceiling still block');
  cleanup(dir);
});

// --- agent-skills' review records itself ----------------------------------------------------------------

import { verdictOf } from '../scripts/review-state.mjs';

const reviews = (dir) => JSON.parse(readFileSync(join(dir, '.kaizen/state/reviews.json'), 'utf8'));
const transcript = (dir, text) => {
  const f = join(dir, '.transcript.jsonl');
  writeFiles(dir, { '.transcript.jsonl': [{ type: 'user', message: { role: 'user', content: '/kaizen:review' } }, { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } }].map((e) => JSON.stringify(e)).join('\n') + '\n' });
  return f;
};

test('verdict: Critical findings block, REQUEST CHANGES asks for changes, otherwise ready', () => {
  assert.equal(verdictOf('## Review Summary\n\n**Verdict:** APPROVE\n\n### Critical Issues\n- None\n\n### Nits\n- [a.js:1] name'), 'ready');
  assert.equal(verdictOf('**Verdict:** APPROVE\n\n### Critical Issues\n\n### Required Changes\n- x'), 'ready');
  assert.equal(verdictOf('### Critical Issues\n- [api.js:12] SQL injection on `name`'), 'blocked');
  assert.equal(verdictOf('- **Critical:** the token is logged in clear'), 'blocked');
  assert.equal(verdictOf('Critical: none'), 'ready');
  assert.equal(verdictOf('**Verdict:** REQUEST CHANGES\n\n### Critical Issues\n- None found'), 'concerns');
  assert.equal(verdictOf('### Verdict\n- [x] **Request changes** — missing tests'), 'concerns');
  assert.equal(verdictOf(''), 'ready');
});

test('the code-reviewer persona (/kaizen:ship) records its review at once; other agents do not', () => {
  const dir = featureRepo();
  hook('evidence', dir, { tool_name: 'Agent', tool_input: { subagent_type: 'general-purpose' }, tool_response: 'looks good' });
  assert.equal(existsSync(join(dir, '.kaizen/state/reviews.json')), false);
  personaReview(dir);
  const r = reviews(dir)['feat/x'];
  assert.deepEqual([r.verdict, r.depth, r.reviewers], ['ready', 'agent-skills', ['code-reviewer']]);
  assert.equal(prePush(dir).status, 0);
  hook('evidence', dir, { tool_name: 'Agent', tool_input: { subagent_type: 'code-reviewer' }, tool_response: { content: [{ type: 'text', text: '### Critical Issues\n- [app.js:2] data loss' }] } });
  assert.equal(reviews(dir)['feat/x'].verdict, 'blocked', 'the persona without the plugin prefix counts too');
  assert.match(prePush(dir).stderr, /⛔/);
  cleanup(dir);
});

test('the review skill (/kaizen:review) leaves a mark; the Stop hook reads the verdict from the turn', () => {
  const dir = featureRepo();
  hook('evidence', dir, { tool_name: 'Skill', tool_input: { skill: 'agent-skills:code-review-and-quality' } });
  assert.equal(existsSync(join(dir, '.kaizen/state/reviews.json')), false, 'nothing recorded before the review is written');
  assert.equal(JSON.parse(readFileSync(join(dir, '.kaizen/state/review-pending.json'), 'utf8')).source, 'code-review-and-quality');
  hook('stop', dir, { session_id: 'OTHER', transcript_path: transcript(dir, '**Verdict:** APPROVE') });
  assert.equal(existsSync(join(dir, '.kaizen/state/reviews.json')), false, 'another session does not take the mark');
  hook('stop', dir, { transcript_path: transcript(dir, '## Review: feat/x\n\n**Verdict:** APPROVE\n\n### Critical Issues\n- None') });
  assert.equal(reviews(dir)['feat/x'].verdict, 'ready');
  assert.deepEqual(reviews(dir)['feat/x'].reviewers, ['code-review-and-quality']);
  assert.equal(prePush(dir).status, 0);
  hook('stop', dir, { transcript_path: transcript(dir, '### Critical Issues\n- x') });
  assert.equal(reviews(dir)['feat/x'].verdict, 'ready', 'the mark is used once');
  hook('evidence', dir, { tool_name: 'Skill', tool_input: { skill: 'agent-skills:spec-driven-development' } });
  assert.equal(JSON.parse(readFileSync(join(dir, '.kaizen/state/review-pending.json'), 'utf8')), null, 'another skill leaves no mark');
  cleanup(dir);
});

test('review hooks inactive outside a Kaizen repo and for other tools', () => {
  const plain = tempRepo({ 'a.txt': '1' });
  personaReview(plain);
  assert.equal(existsSync(join(plain, '.kaizen')), false);
  cleanup(plain);
  const dir = featureRepo();
  hook('evidence', dir, { tool_name: 'Bash', tool_input: { subagent_type: 'agent-skills:code-reviewer' } });
  assert.equal(existsSync(join(dir, '.kaizen/state/reviews.json')), false);
  cleanup(dir);
});
