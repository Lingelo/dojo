import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { GATE, REVIEW_HOOKS, cleanup, cli, gitc, tempRepo, writeFiles } from './helpers.mjs';

function stop(dir, extra = {}) {
  return spawnSync(process.execPath, [GATE], { input: JSON.stringify({ cwd: dir, ...extra }), encoding: 'utf8' });
}

function claim(dir, session, command = 'node "/p/scripts/kaizen.mjs" gate on --plan docs/plans/x.md') {
  return spawnSync(process.execPath, [GATE, '--claim'], {
    input: JSON.stringify({ cwd: dir, session_id: session, tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
  });
}

function repoWithTest(exitCode) {
  return tempRepo({ '.kaizen/config.json': { verify: { test: `node -e "process.exit(${exitCode})"` }, gate: { max_blocks: 2 } } });
}

test('inactive without gate on: lets it finish without running anything', () => {
  const dir = repoWithTest(1);
  assert.equal(stop(dir).status, 0);
  cleanup(dir);
});

test('active and red: blocks (exit 2), then lets through after max_blocks', () => {
  const dir = repoWithTest(1);
  cli(dir, ['gate', 'on', '--plan', 'docs/plans/x.md']);
  const first = stop(dir);
  assert.equal(first.status, 2);
  assert.match(first.stderr, /Quality gate \(1\/2\)/);
  assert.equal(stop(dir).status, 2);
  const third = stop(dir);
  assert.equal(third.status, 0);
  assert.match(third.stderr, /letting you finish/);
  cleanup(dir);
});

test('active and green: lets it finish and resets the counter', () => {
  const dir = repoWithTest(0);
  cli(dir, ['gate', 'on']);
  const state = join(dir, '.kaizen/state/gate.json');
  writeFileSync(state, JSON.stringify({ ...JSON.parse(readFileSync(state, 'utf8')), blocks: 1 }));
  assert.equal(stop(dir).status, 0);
  assert.equal(JSON.parse(readFileSync(state, 'utf8')).blocks, 0);
  cleanup(dir);
});

test('expired: disables itself', () => {
  const dir = repoWithTest(1);
  cli(dir, ['gate', 'on']);
  const state = join(dir, '.kaizen/state/gate.json');
  writeFileSync(state, JSON.stringify({ active: true, since: '2020-01-01T00:00:00Z', blocks: 0 }));
  const r = stop(dir);
  assert.equal(r.status, 0);
  assert.match(r.stderr, /expired/);
  assert.equal(existsSync(state), false);
  cleanup(dir);
});

test('disabled by the config, and outside a git repo', () => {
  const dir = tempRepo({ '.kaizen/config.json': { verify: { test: 'node -e "process.exit(1)"' }, gate: { enabled: false } } });
  cli(dir, ['gate', 'on']);
  assert.equal(stop(dir).status, 0);
  cleanup(dir);
  assert.equal(spawnSync(process.execPath, [GATE], { input: '{"cwd":"/"}', encoding: 'utf8' }).status, 0);
});

test('the gate state is ignored by git', () => {
  const dir = repoWithTest(0);
  cli(dir, ['gate', 'on']);
  const st = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: dir, encoding: 'utf8' }).stdout;
  assert.doesNotMatch(st, /state/);
  cleanup(dir);
});

test('the gate belongs to the session that set it', () => {
  const dir = repoWithTest(1);
  cli(dir, ['gate', 'on']);
  assert.equal(claim(dir, 'other', 'git status').status, 0);
  assert.equal(JSON.parse(readFileSync(join(dir, '.kaizen/state/gate.json'), 'utf8')).session, undefined, 'only "gate on" claims');
  claim(dir, 'S1', 'K="/p/scripts/kaizen.mjs"; node "$K" gate on --plan docs/plans/x.md');
  claim(dir, 'S2');
  assert.equal(JSON.parse(readFileSync(join(dir, '.kaizen/state/gate.json'), 'utf8')).session, 'S1', 'the first claim wins');
  assert.equal(stop(dir, { session_id: 'S2' }).status, 0, 'another session is not blocked');
  assert.equal(stop(dir, { session_id: 'S1' }).status, 2);
  cleanup(dir);
});

test('budget exhausted: remaining commands are not run and do not block', () => {
  const dir = tempRepo({
    '.kaizen/config.json': {
      // Killed at the timeout, the slow command dies with its whole tree: nothing locks the repo.
      verify: { test: 'node -e "setTimeout(() => {}, 3000)"', lint: 'node -e "process.exit(1)"' },
      gate: { budget_seconds: 1.5 },
    },
  });
  cli(dir, ['gate', 'on']);
  const r = stop(dir);
  assert.equal(r.status, 2, 'test killed at the budget = red');
  assert.match(r.stderr, /timeout/);
  assert.doesNotMatch(r.stderr, /lint/, 'lint never run');
  cleanup(dir);
});

test('targeted checks: {files} = files touched by the branch, nothing to check = skipped', () => {
  const dir = tempRepo({
    '.kaizen/config.json': { verify: { test: 'node -e "process.exit(0)"' }, gate: { targeted: { lint: 'node -e "process.exit(process.argv.slice(1).includes(\'b.js\') ? 1 : 0)" {files}' } } },
    'a.js': 'a\n',
  });
  gitc(dir, ['checkout', '-qb', 'feat/x']);
  cli(dir, ['gate', 'on']);
  assert.equal(stop(dir).status, 0, 'no file touched: targeted lint skipped');
  writeFiles(dir, { 'b.js': 'b\n' });
  const r = stop(dir);
  assert.equal(r.status, 2, 'new untracked file passed to the linter');
  assert.match(r.stderr, /lint/);
  assert.match(r.stderr, /'b\.js'|"b\.js"/);
  cleanup(dir);
});

test('cycle cost: tokens read from the transcript, logged by gate off', () => {
  const dir = repoWithTest(0);
  cli(dir, ['gate', 'on']);
  const since = JSON.parse(readFileSync(join(dir, '.kaizen/state/gate.json'), 'utf8')).since;
  const later = new Date(Date.parse(since) + 1000).toISOString();
  const usage = (id, ts, out) => JSON.stringify({ timestamp: ts, message: { id, usage: { input_tokens: 10, output_tokens: out, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 } } });
  const transcript = join(dir, '.kaizen/state/t.jsonl');
  writeFileSync(transcript, [usage('old', '2020-01-01T00:00:00Z', 999), usage('m1', later, 5), usage('m1', later, 5), usage('m2', later, 7), 'not json'].join('\n'));
  assert.equal(stop(dir, { transcript_path: transcript }).status, 0);
  const off = cli(dir, ['gate', 'off']).json;
  assert.deepEqual(off.cycle.usage, { input_tokens: 20, output_tokens: 12, cache_read_input_tokens: 200, cache_creation_input_tokens: 0, messages: 2 });
  const cost = cli(dir, ['metrics', '--no-github']).json.cycle_cost;
  assert.equal(cost.cycles, 1);
  assert.equal(cost.tokens_median, 232);
  assert.equal(cli(dir, ['gate', 'off']).json.cycle, null, 'a second gate off logs nothing');
  cleanup(dir);
});

test('cycle cost: subagents counted and broken down by role', () => {
  const dir = repoWithTest(0);
  cli(dir, ['gate', 'on']);
  const since = JSON.parse(readFileSync(join(dir, '.kaizen/state/gate.json'), 'utf8')).since;
  const later = new Date(Date.parse(since) + 1000).toISOString();
  const usage = (id, ts, out) => JSON.stringify({ timestamp: ts, message: { id, usage: { input_tokens: 10, output_tokens: out, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } });
  const prompt = (text) => JSON.stringify({ type: 'user', timestamp: later, message: { role: 'user', content: text } });
  const launch = (tool_input, tool_response) =>
    spawnSync(process.execPath, [REVIEW_HOOKS, '--evidence'], { input: JSON.stringify({ cwd: dir, session_id: 'S1', tool_name: 'Agent', tool_input, tool_response }), encoding: 'utf8' });

  // Launches seen by the Agent hook: critical reviewer (id in the response), implementation (by prompt).
  launch({ subagent_type: 'kaizen:security-reviewer', prompt: 'Review security', model: 'opus' }, { agentId: 'a1', content: [] });
  launch({ subagent_type: 'general-purpose', prompt: 'Implement  unit U2\n with its tests', model: 'sonnet' }, 'Async agent launched');

  // Transcripts: <project>/S1.jsonl and <project>/S1/subagents/[…/]agent-<id>.jsonl
  const proj = join(dir, '.kaizen/state/proj');
  mkdirSync(join(proj, 'S1/subagents/wf'), { recursive: true });
  writeFileSync(join(proj, 'S1.jsonl'), usage('m1', later, 5));
  writeFileSync(join(proj, 'S1/subagents/agent-a1.jsonl'), [prompt('Review security'), usage('s1', later, 20), usage('s1', later, 20), usage('old', '2020-01-01T00:00:00Z', 999)].join('\n'));
  writeFileSync(join(proj, 'S1/subagents/wf/agent-a2.jsonl'), [prompt([{ type: 'text', text: 'Implement unit U2 with its tests' }]), usage('s2', later, 30)].join('\n'));
  writeFileSync(join(proj, 'S1/subagents/agent-a3.jsonl'), [prompt('something else'), usage('s3', later, 40)].join('\n'));

  assert.equal(stop(dir, { session_id: 'S1', transcript_path: join(proj, 'S1.jsonl') }).status, 0);
  const off = cli(dir, ['gate', 'off']).json;
  assert.equal(off.cycle.usage.output_tokens, 5);
  assert.equal(off.cycle.subagents.agents, 3);
  assert.equal(off.cycle.subagents.usage.output_tokens, 90, 'duplicate and pre-cycle message excluded');
  assert.deepEqual(
    Object.fromEntries(Object.entries(off.cycle.subagents.by_role).map(([r, u]) => [r, u.output_tokens])),
    { review_critical: 20, implement: 30, unknown: 40 },
  );
  assert.equal(existsSync(join(dir, '.kaizen/state/agent-runs.jsonl')), false, 'launch log cleared by gate off');

  const cost = cli(dir, ['metrics', '--no-github']).json.cycle_cost;
  assert.equal(cost.tokens_median, 15 + 120, 'total = main + subagents');
  assert.equal(cost.main_tokens_median, 15);
  assert.equal(cost.subagent_tokens_median, 120);
  assert.equal(cost.subagent_share, 0.89);
  assert.deepEqual(cost.tokens_by_role.review_critical, { tokens: 30, output_tokens: 20 });
  assert.match(cost.method, /subagents/);
  cleanup(dir);
});

test('subagent launches: nothing logged outside a cycle or for another session', () => {
  const dir = repoWithTest(0);
  const launch = (session) =>
    spawnSync(process.execPath, [REVIEW_HOOKS, '--evidence'], { input: JSON.stringify({ cwd: dir, session_id: session, tool_name: 'Agent', tool_input: { subagent_type: 'Explore', prompt: 'x' } }), encoding: 'utf8' });
  const runs = join(dir, '.kaizen/state/agent-runs.jsonl');
  launch('S1');
  assert.equal(existsSync(runs), false, 'gate inactive');
  cli(dir, ['gate', 'on']);
  claim(dir, 'S1');
  launch('S2');
  assert.equal(existsSync(runs), false, 'other session');
  launch('S1');
  assert.equal(JSON.parse(readFileSync(runs, 'utf8')).role, 'other');
  cleanup(dir);
});
