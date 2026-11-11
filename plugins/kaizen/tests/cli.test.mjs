import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { cleanup, cli, gitc, personaReview, tempRepo, writeFiles } from './helpers.mjs';

test('init creates the config and the learnings folder, and ignores config.local', () => {
  const dir = tempRepo({ 'package.json': { scripts: { test: 'node -e 0' } } });
  const r = cli(dir, ['init', '--language', 'en']);
  assert.equal(r.code, 0, r.stderr);
  const config = JSON.parse(readFileSync(join(dir, '.kaizen/config.json'), 'utf8'));
  assert.equal(config.language, 'en');
  assert.ok(existsSync(join(dir, 'docs', 'learnings')));
  assert.match(readFileSync(join(dir, '.gitignore'), 'utf8'), /\.kaizen\/config\.local\.json/);
  assert.deepEqual(cli(dir, ['init']).json.created, [], 'idempotent');
  cleanup(dir);
});

test('verify: green, red, and audit excluded by default', () => {
  const dir = tempRepo({ '.kaizen/config.json': { verify: { test: 'node -e "process.exit(0)"', lint: 'node -e "process.exit(3)"', audit: 'node -e "process.exit(9)"' } } });
  const red = cli(dir, ['verify', '--json']);
  assert.equal(red.code, 1);
  assert.deepEqual(red.json.map((r) => [r.name, r.ok]), [['test', true], ['lint', false]]);
  assert.equal(cli(dir, ['verify', '--only', 'test']).code, 0);
  assert.equal(cli(dir, ['verify', '--only', 'audit']).code, 1);
  cleanup(dir);
});


test('learnings: validation per track and ranked search', () => {
  const dir = tempRepo({
    'docs/learnings/runtime-errors/csv-bom.md':
      '---\ntitle: Excel breaks accents in CSV exports\ndate: 2026-09-12\nmodule: exports\nproblem_type: runtime_error\ncomponent: service_layer\nsymptoms:\n  - "Unreadable accents"\nroot_cause: wrong_api\nresolution_type: code_fix\nseverity: medium\ntags: [csv, excel, bom]\n---\n# x\n',
    'docs/learnings/conventions/naming.md':
      '---\ntitle: Name jobs with a verb\ndate: 2026-09-01\nmodule: jobs\nproblem_type: convention\ncomponent: background_job\nseverity: low\n---\n# y\n',
    'docs/learnings/tooling-decisions/bun-rerun.md':
      '---\ntitle: Re-run bun install once\ndate: 2026-09-20\nmodule: ci\nproblem_type: tooling_decision\ncomponent: tooling\nseverity: low\nretire_when: "bun#1234 fixed — gh issue view 1234 -R oven-sh/bun"\n---\n# z\n',
    'docs/learnings/bad.md': '---\ntitle: Bad\ndate: 12/09/2026\nproblem_type: runtime_error\nseverity: urgent\nretire_when: [a, b]\n---\n',
  });
  const v = cli(dir, ['learnings', 'validate']);
  assert.equal(v.code, 1);
  assert.match(v.stdout, /✘ docs\/learnings\/bad\.md/);
  assert.match(v.stdout, /✔ docs\/learnings\/conventions\/naming\.md/);
  assert.match(v.stdout, /bug track: required field missing: symptoms/);
  assert.match(v.stdout, /retire_when: one string/);
  assert.match(v.stdout, /✔ docs\/learnings\/tooling-decisions\/bun-rerun\.md/);
  const retire = cli(dir, ['learnings', 'list', '--retire']).json;
  assert.deepEqual(retire.map((l) => l.path), ['docs/learnings/bad.md', 'docs/learnings/tooling-decisions/bun-rerun.md'], 'only the learnings declaring one');
  assert.match(retire[1].retire_when, /gh issue view 1234/);
  assert.equal(cli(dir, ['learnings', 'list']).json.length, 4);
  const s = cli(dir, ['learnings', 'search', 'export', 'CSV', 'excel', '--json']).json;
  assert.equal(s[0].path, 'docs/learnings/runtime-errors/csv-bom.md');
  assert.equal(cli(dir, ['learnings', 'search', 'kubernetes', '--json']).json.length, 0);
  cleanup(dir);
});


test('metrics: computes without GitHub on a merge history', () => {
  const dir = tempRepo({ 'app.js': '1\n' });
  for (const [i, kind] of [[1, 'feat'], [2, 'fix'], [3, 'feat']]) {
    gitc(dir, ['checkout', '-qb', `b${i}`]);
    writeFiles(dir, { 'app.js': `v${i}\n` });
    gitc(dir, ['commit', '-qam', `${kind}: change ${i}`], ['checkout', '-q', 'main'], ['merge', '--no-ff', '-q', '-m', `${kind}: merge ${i}`, `b${i}`]);
  }
  const m = cli(dir, ['metrics', '--since', '30d', '--no-github']).json;
  assert.equal(m.changes, 4, 'the initial commit + 3 merges');
  assert.equal(m.throughput.rework_rate, 0.25, '1 fix out of 4 changes');
  assert.equal(m.instability.change_failure_rate, 0.33, 'the 1st feature is followed by a fix on the same file (1 out of 3 non-fix)');
  assert.ok(m.throughput.lead_time_hours_median !== null);
  cleanup(dir);
});


test('learnings: files globs validated, and a bad one refused', () => {
  const ok = '---\ntitle: Orders rounding\ndate: 2026-09-12\nmodule: orders\nproblem_type: convention\ncomponent: model\nseverity: low\nfiles: ["src/orders/**"]\n---\n# x\n';
  const dir = tempRepo({ 'docs/learnings/a.md': ok, 'docs/learnings/b.md': ok.replace('files: ["src/orders/**"]', 'files: src/orders') });
  const v = cli(dir, ['learnings', 'validate']);
  assert.match(v.stdout, /✔ docs\/learnings\/a\.md/);
  assert.match(v.stdout, /✘ docs\/learnings\/b\.md\n {4}- files: list of path globs/);
  cleanup(dir);
});

test('metrics: learnings cited by agent-skills\' plan, applied in a commit, never cited; no cycle cost', () => {
  const old = '---\ntitle: Old trap\ndate: 2020-01-01\n---\n';
  const dir = tempRepo({
    'docs/learnings/bugs/rounding.md': old,
    'docs/learnings/bugs/forgotten.md': old,
    'tasks/plan.md': '# Plan: X\n\nSee docs/learnings/bugs/rounding.md\n',
    'app.js': '1\n',
  });
  writeFiles(dir, { 'app.js': '2\n' });
  gitc(dir, ['commit', '-qam', 'fix: rounding\n\nApplies docs/learnings/bugs/rounding.md']);
  const m = cli(dir, ['metrics', '--since', '30d', '--no-github']).json;
  const loop = m.kaizen_loop;
  assert.equal(loop.learnings_cited_by_plans, 1);
  assert.equal(loop.learnings_applied_in_commits, 1);
  assert.equal(loop.learning_reuse_rate, 0.5);
  assert.deepEqual(loop.learnings_never_cited_sample, ['learnings/bugs/forgotten.md']);
  assert.ok(!('cycle_cost' in m) && !('deployments' in m));
  assert.equal(m.instability.time_to_restore_hours_median, null);
  cleanup(dir);
});

test('status: setup, then agent-skills\' commands, review and ship in order', () => {
  const dir = tempRepo({ 'a.js': '1\n' });
  const next = () => cli(dir, ['status', '--json']).json.next.map((n) => n.command.split(' ')[0]);
  assert.deepEqual(next(), ['/kaizen:setup']);
  cli(dir, ['init']);
  gitc(dir, ['add', '-A'], ['commit', '-qm', 'chore: kaizen']);
  assert.deepEqual(next(), ['/kaizen:spec']);
  writeFiles(dir, { 'SPEC.md': '# Spec: X\n\n## Objective\nx\n' });
  assert.deepEqual(next(), ['/kaizen:plan'], 'a spec without tasks');
  writeFiles(dir, { 'tasks/todo.md': '# Tasks\n\n## Task 1: A\n\n**Acceptance criteria:**\n- [x] a\n\n## Task 2: B\n\n**Acceptance criteria:**\n- [ ] b\n' });
  const st = cli(dir, ['status', '--json']).json;
  assert.deepEqual(st.next.map((n) => n.command), ['/kaizen:build']);
  assert.match(st.next[0].why, /1\/2 tasks done in tasks\/todo\.md, next: Task 2: B/);
  gitc(dir, ['add', '-A'], ['commit', '-qm', 'docs: spec']);
  gitc(dir, ['checkout', '-qb', 'feat/x']);
  writeFiles(dir, { 'a.js': '2\n' });
  assert.deepEqual(next(), ['/kaizen:build'], 'a task left: build before review');
  writeFiles(dir, { 'tasks/todo.md': '# Tasks\n\n## Task 1: A\n\n**Acceptance criteria:**\n- [x] a\n\n## Task 2: B\n\n**Acceptance criteria:**\n- [x] b\n' });
  assert.deepEqual(next(), ['/kaizen:review'], 'uncommitted, unreviewed changes');
  gitc(dir, ['commit', '-qam', 'feat: x']);
  personaReview(dir);
  const reviewed = cli(dir, ['status', '--json']).json;
  assert.deepEqual(reviewed.next.map((n) => n.command), ['/kaizen:ship']);
  assert.equal(reviewed.review.push_allowed, true);
  assert.match(cli(dir, ['status']).stdout, /agent-skills: SPEC\.md · tasks\/todo\.md 2\/2/);
  // pushed as reviewed: the PR and its follow-up are next
  const origin = tempRepo({}, { commit: false });
  gitc(origin, ['config', 'receive.denyCurrentBranch', 'ignore']);
  gitc(dir, ['remote', 'add', 'origin', origin], ['push', '-q', '-u', 'origin', 'feat/x']);
  assert.deepEqual(next(), ['/kaizen:watch']);
  cleanup(origin);
  cleanup(dir);
});

test('install settings declares kaizen@dojo and agent-skills@dojo; gate status and off', () => {
  const dir = tempRepo({ '.kaizen/config.json': {} });
  const r = cli(dir, ['install', 'settings']).json;
  assert.deepEqual(r.enabled, ['kaizen@dojo', 'agent-skills@dojo']);
  const settings = JSON.parse(readFileSync(join(dir, '.claude/settings.json'), 'utf8'));
  assert.equal(settings.enabledPlugins['agent-skills@dojo'], true);
  assert.notEqual(cli(dir, ['install', 'settings']).code, 0, 'already declared');
  assert.deepEqual(cli(dir, ['gate', 'status']).json, { active: false });
  writeFiles(dir, { '.kaizen/state/gate.json': { active: true, session: 'S1' } });
  assert.equal(cli(dir, ['gate', 'status']).json.active, true);
  assert.deepEqual(cli(dir, ['gate', 'off']).json, { active: false });
  assert.notEqual(cli(dir, ['gate', 'on']).code, 0, 'the gate turns itself on');
  cleanup(dir);
});

test('help and removed or unknown commands', () => {
  const dir = tempRepo({});
  const help = cli(dir, ['help']).stdout;
  assert.match(help, /learnings search/);
  for (const gone of ['plan check', 'constitution', 'deploy', 'audit', 'packs', 'release notes', 'profile', 'models']) assert.doesNotMatch(help, new RegExp(`kaizen\\.mjs ${gone}\\b`), gone);
  for (const gone of ['plan', 'constitution', 'audit', 'release', 'whatever']) assert.equal(cli(dir, [gone]).code, 2, gone);
  execFileSync('git', ['status'], { cwd: dir });
  cleanup(dir);
});
