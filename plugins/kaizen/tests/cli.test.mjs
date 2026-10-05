import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLUGIN, cleanup, cli, gitc, tempRepo, writeFiles } from './helpers.mjs';

const CONSTITUTION = `---
name: Shop
version: 1.0.0
ratified: 2026-10-02
last_amended: 2026-10-02
artifact: kaizen-constitution/v1
---
# Constitution

## Articles

### I. Evidence first — NON-NEGOTIABLE
Every behavior change comes with a test that failed before.
**Check:** does each unit have observed red evidence?

### II. Simplicity
No mechanism nobody asked for.
**Check:** is all complexity justified?

### III. Small batches
PRs under the limit.
**Check:** does size pass?

### IV. Secure by default
Inputs validated.
**Check:** are untrusted inputs validated?

## AI policy

### V. Agent autonomy
Never merge.
**Check:** no reserved action taken alone?
`;

// The same constitution as written before Kaizen 3.0: still read and validated.
const FRENCH_CONSTITUTION = `---
name: Shop
version: 1.0.0
ratified: 2026-10-02
last_amended: 2026-10-02
artifact: kaizen-constitution/v1
---
## Articles

### I. Preuve d'abord — NON NÉGOCIABLE
Tout changement arrive avec un test.
**Contrôle :** un test échouait-il avant ?

## Politique IA

### II. Autonomie des agents
Jamais de merge.
**Contrôle :** aucune action réservée faite seule ?
`;

test('init creates the config and folders, and ignores config.local', () => {
  const dir = tempRepo({ 'package.json': { scripts: { test: 'node -e 0' } } });
  const r = cli(dir, ['init', '--language', 'en']);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(existsSync(join(dir, '.kaizen/config.json')));
  for (const d of ['plans', 'learnings', 'ideation']) assert.ok(existsSync(join(dir, 'docs', d)));
  assert.match(readFileSync(join(dir, '.gitignore'), 'utf8'), /\.kaizen\/config\.local\.json/);
  assert.equal(JSON.parse(readFileSync(join(dir, '.kaizen/config.json'), 'utf8')).language, 'en');
  // Idempotent: a second run rewrites nothing.
  assert.deepEqual(cli(dir, ['init']).json.created, []);
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

test('plan new reserves unique names; plan check validates the reference example', () => {
  const dir = tempRepo({ 'CONSTITUTION.md': CONSTITUTION });
  const a = cli(dir, ['plan', 'new', '--type', 'feat', '--topic', 'Orders CSV export']).stdout.trim();
  const b = cli(dir, ['plan', 'new', '--type', 'feat', '--topic', 'Orders CSV export']).stdout.trim();
  assert.match(a, /^docs\/plans\/\d{4}-\d{2}-\d{2}-\d{4}-feat-orders-csv-export-plan\.md$/);
  assert.notEqual(a, b);
  writeFileSync(join(dir, 'plan.md'), readFileSync(join(PLUGIN, 'templates/plan-example.md'), 'utf8'));
  const ok = cli(dir, ['plan', 'check', 'plan.md', '--json']);
  assert.equal(ok.code, 0, JSON.stringify(ok.json));
  assert.equal(ok.json.stage, 'implementation-ready');
  assert.equal(ok.json.requirements, 5);
  assert.equal(ok.json.units, 3);
  assert.deepEqual(ok.json.warnings.filter((w) => /rollout/.test(w)), [], 'the example has a signal, threshold and rollback');
  const example = readFileSync(join(PLUGIN, 'templates/plan-example.md'), 'utf8');
  writeFileSync(join(dir, 'plan.md'), example.replace(/- \*\*Rollback\*\*[^\n]*\n/, '').replace(/; > 1 %[^\n]*\n[^\n]*\n/, '.\n'));
  const w = cli(dir, ['plan', 'check', 'plan.md', '--json']).json.warnings.join('\n');
  assert.match(w, /Rollback\*\* missing/);
  assert.match(w, /Signal\*\* without a threshold/);
  cleanup(dir);
});

test('plan check catches traceability and constitution defects', () => {
  const dir = tempRepo({ 'CONSTITUTION.md': CONSTITUTION });
  // On Windows, git checks the template out with CRLF: normalize before injecting the defects.
  let text = readFileSync(join(PLUGIN, 'templates/plan-example.md'), 'utf8').replace(/\r\n/g, '\n');
  text = text
    .replace('| V. Agent autonomy | ✅ | no migration or dependency added |\n', '')
    .replace('- R5. Beyond', '- R7. Beyond')
    .replace('### Acceptance examples', '[NEEDS CLARIFICATION: which format?]\n### Acceptance examples')
    .replace('- **Evidence:** system test.\n', '')
    .replace('status_placeholder', '');
  writeFileSync(join(dir, 'bad.md'), text);
  const r = cli(dir, ['plan', 'check', 'bad.md', '--json']);
  assert.equal(r.code, 1);
  const errs = r.json.errors.join('\n');
  assert.match(errs, /non-continuous numbering \(R7/);
  assert.match(errs, /NEEDS CLARIFICATION/);
  assert.match(errs, /U3: field \*\*Evidence:\*\* missing/);
  assert.match(errs, /R7 is not covered by any unit/);
  assert.match(errs, /article V \(Agent autonomy\) not assessed/);
  cleanup(dir);
});

test('plan check: a requirements-stage plan tolerates markers but not the status field', () => {
  const dir = tempRepo({});
  writeFiles(dir, {
    'req.md': '---\ntitle: X - Plan\ntype: feat\ndate: 2026-10-02\ntopic: x\nartifact: kaizen-plan/v1\nstatus: active\n---\n<!-- kaizen:goal -->\n## Capsule\n<!-- kaizen:product -->\n## Contract\n- R1. Do X. [NEEDS CLARIFICATION: which one?]\n',
  });
  const r = cli(dir, ['plan', 'check', 'req.md', '--json']);
  assert.equal(r.json.stage, 'requirements');
  assert.ok(r.json.warnings.some((w) => /NEEDS CLARIFICATION/.test(w)));
  assert.ok(r.json.errors.some((e) => /status field forbidden/.test(e)));
  cleanup(dir);
});

test('constitution: reading, validation and defects', () => {
  const dir = tempRepo({ 'CONSTITUTION.md': CONSTITUTION });
  const c = cli(dir, ['constitution', '--json']).json;
  assert.equal(c.articles.length, 5);
  assert.equal(c.articles[0].non_negotiable, true);
  assert.equal(c.articles[0].title, 'Evidence first');
  assert.equal(c.articles[4].section, 'AI policy');
  assert.equal(cli(dir, ['constitution', 'check']).code, 0);
  writeFileSync(join(dir, 'CONSTITUTION.md'), CONSTITUTION.replace('version: 1.0.0', 'version: v1').replace('### III.', '### IV.').replace('**Check:** does size pass?\n', ''));
  const bad = cli(dir, ['constitution', 'check', '--json']).json;
  assert.ok(bad.errors.some((e) => /version/.test(e)));
  assert.ok(bad.errors.some((e) => /expected numbering III/.test(e)));
  assert.ok(bad.errors.some((e) => /Check:\*\* missing/.test(e)));
  cleanup(dir);
});

test('constitution and plan written in French before Kaizen 3.0 are still accepted', () => {
  const dir = tempRepo({ 'CONSTITUTION.md': FRENCH_CONSTITUTION });
  const c = cli(dir, ['constitution', '--json']).json;
  assert.equal(c.articles[0].non_negotiable, true);
  assert.equal(c.articles[0].control, 'un test échouait-il avant ?');
  assert.equal(cli(dir, ['constitution', 'check']).code, 0);
  writeFiles(dir, {
    'plan.md': `---\ntitle: X - Plan\ntype: feat\ndate: 2026-10-02\ntopic: x\nartifact: kaizen-plan/v1\n---\n<!-- kaizen:goal -->\n<!-- kaizen:product -->\n- R1. Faire X.\n<!-- kaizen:planning -->\n<!-- kaizen:constitution -->\n| I. Preuve | ✅ |\n| II. Autonomie | ✅ |\n<!-- kaizen:rollout -->\n- **Retour arrière** : revert\n- **Signal** : 5xx > 1 %\n<!-- kaizen:units -->\n### U1. X\n- **Couvre :** R1\n- **Fichiers :** a.js\n- **Preuve :** test d'abord\n- **Vérification :** npm test\n- **Tranche :** T1\n<!-- kaizen:verification -->\n<!-- kaizen:done -->\n`,
  });
  const r = cli(dir, ['plan', 'check', 'plan.md', '--json']);
  assert.equal(r.code, 0, JSON.stringify(r.json));
  assert.deepEqual(r.json.warnings, []);
  cleanup(dir);
});

test('learnings: validation per track and ranked search', () => {
  const dir = tempRepo({
    'docs/learnings/runtime-errors/csv-bom.md':
      '---\ntitle: Excel breaks accents in CSV exports\ndate: 2026-09-12\nmodule: exports\nproblem_type: runtime_error\ncomponent: service_layer\nsymptoms:\n  - "Unreadable accents"\nroot_cause: wrong_api\nresolution_type: code_fix\nseverity: medium\ntags: [csv, excel, bom]\n---\n# x\n',
    'docs/learnings/conventions/naming.md':
      '---\ntitle: Name jobs with a verb\ndate: 2026-09-01\nmodule: jobs\nproblem_type: convention\ncomponent: background_job\nseverity: low\n---\n# y\n',
    'docs/learnings/bad.md': '---\ntitle: Bad\ndate: 12/09/2026\nproblem_type: runtime_error\nseverity: urgent\n---\n',
  });
  const v = cli(dir, ['learnings', 'validate']);
  assert.equal(v.code, 1);
  assert.match(v.stdout, /✘ docs\/learnings\/bad\.md/);
  assert.match(v.stdout, /✔ docs\/learnings\/conventions\/naming\.md/);
  assert.match(v.stdout, /bug track: required field missing: symptoms/);
  const s = cli(dir, ['learnings', 'search', 'export', 'CSV', 'excel', '--json']).json;
  assert.equal(s[0].path, 'docs/learnings/runtime-errors/csv-bom.md');
  assert.equal(cli(dir, ['learnings', 'search', 'kubernetes', '--json']).json.length, 0);
  cleanup(dir);
});

test('packs: local, pinned git multi-packs, explicit errors', () => {
  const src = tempRepo({
    'rails/no-callbacks.md': '---\ntitle: No callbacks\napplies_when:\n  - adding logic on save\n---\nx\n',
    'inertia/props.md': '---\ntitle: Server props\napplies_when: [adding a page]\n---\nx\n',
  });
  gitc(src, ['tag', 'v1.0.0']);
  const dir = tempRepo({});
  assert.equal(cli(dir, ['pack', 'new', 'house-rules']).code, 0);
  writeFiles(dir, {
    'kaizen-packs/house-rules/csv.md': '---\ntitle: BOM required\napplies_when:\n  - adding a CSV export\n---\nx\n',
    'kaizen-packs/house-rules/notes.md': 'no frontmatter\n',
  });
  const cfgPath = join(dir, '.kaizen/config.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  cfg.packs.push({ source: `file://${src}`, ref: 'v1.0.0', pack: ['rails'] }, { source: 'missing/dir' });
  writeFileSync(cfgPath, JSON.stringify(cfg));
  const r = cli(dir, ['packs', '--json'], { env: { CLAUDE_PLUGIN_DATA: join(dir, '.data') } }).json;
  assert.deepEqual(r.packs.map((p) => p.id).sort(), ['house-rules', 'rails']);
  assert.ok(r.warnings.some((w) => /notes\.md ignored/.test(w)));
  assert.ok(r.warnings.some((w) => /not found: missing\/dir/.test(w)));
  cleanup(src);
  cleanup(dir);
});

test('size: counts the diff vs the base, ignores lockfiles, applies the limit', () => {
  const dir = tempRepo({ 'a.txt': 'x\n' });
  gitc(dir, ['checkout', '-qb', 'feat/x']);
  writeFiles(dir, { 'b.txt': `${'line\n'.repeat(30)}`, 'package-lock.json': `${'{}\n'.repeat(500)}` });
  gitc(dir, ['add', '-A'], ['commit', '-qm', 'feat: b']);
  const ok = cli(dir, ['size', '--json']);
  assert.equal(ok.code, 0);
  assert.equal(ok.json.total, 30);
  assert.equal(ok.json.ignored, 1);
  assert.equal(cli(dir, ['size', '--max', '10']).code, 1);
  cleanup(dir);
});

test('adr and postmortem: numbering and reservation', () => {
  const dir = tempRepo({});
  assert.equal(cli(dir, ['adr', 'new', '--title', 'Job queue']).stdout.trim(), 'docs/adr/0001-job-queue.md');
  assert.equal(cli(dir, ['adr', 'new', '--title', "Choosing a vendor's API"]).stdout.trim(), 'docs/adr/0002-choosing-a-vendor-s-api.md');
  assert.match(cli(dir, ['postmortem', 'new', '--title', 'Export outage']).stdout, /^docs\/postmortems\/\d{4}-\d{2}-\d{2}-export-outage\.md/);
  cleanup(dir);
});

test('release notes: grouping, breaking change, SemVer', () => {
  const dir = tempRepo({ 'a.txt': '1' });
  gitc(dir, ['tag', 'v1.4.2']);
  for (const [f, msg] of [
    ['b', 'feat(api): export CSV'],
    ['c', 'fix: accents'],
    ['d', 'chore: deps'],
    ['e', 'refactor!: new config format'],
  ]) {
    writeFiles(dir, { [f]: f });
    gitc(dir, ['add', '-A'], ['commit', '-qm', msg]);
  }
  const r = cli(dir, ['release', 'notes', '--json']).json;
  assert.equal(r.from, 'v1.4.2');
  assert.equal(r.commits, 4);
  assert.equal(r.level, 'major');
  assert.equal(r.next, '2.0.0');
  assert.deepEqual(Object.keys(r.groups), ['Features', 'Fixes', 'Refactoring']);
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

test('constitution: governance by declared approvers', () => {
  const gov = CONSTITUTION.replace('version: 1.0.0', 'version: 1.1.0\napprovers: [@alice, @bob]\nratified_by: alice');
  const dir = tempRepo({ 'CONSTITUTION.md': gov });
  assert.match(cli(dir, ['constitution', 'check', '--json']).json.errors.join('\n'), /no v1\.1\.0 amendment/);
  writeFileSync(join(dir, 'CONSTITUTION.md'), `${gov}\n## Amendments\n\n- v1.1.0 (2026-02-01) — Article II widened. Reason: postmortem. Approved by: @mallory\n`);
  assert.match(cli(dir, ['constitution', 'check', '--json']).json.errors.join('\n'), /not approved by any declared approver/);
  writeFileSync(join(dir, 'CONSTITUTION.md'), `${gov}\n## Amendments\n\n- v1.1.0 (2026-02-01) — Article II widened. Reason: postmortem. Approved by: @Bob, @claude\n`);
  const r = cli(dir, ['constitution', 'check', '--json']).json;
  assert.ok(r.errors.some((e) => /approved by an agent/.test(e)));
  assert.ok(!r.errors.some((e) => /any declared approver/.test(e)));
  assert.equal(cli(dir, ['constitution', '--json']).json.amendments[0].version, '1.1.0');
  cleanup(dir);
});

test('release notes: rollout of shipped plans, missing fields reported', () => {
  const plan = (rollout) => `---\ntitle: X - Plan\n---\n<!-- kaizen:rollout -->\n## Rollout\n\n${rollout}\n<!-- kaizen:units -->\n`;
  const dir = tempRepo({ 'a.txt': '1' });
  gitc(dir, ['tag', 'v1.0.0']);
  writeFiles(dir, {
    'docs/plans/2026-01-01-feat-a-plan.md': plan('- **Exposure**: flag `export_csv`\n- **Rollback**: turn the flag off\n- **Signal**: 5xx > 1 % → turn off'),
    'docs/plans/2026-01-02-feat-b-plan.md': plan('- **Exposure**: direct'),
  });
  gitc(dir, ['add', '-A'], ['commit', '-qm', 'docs: plans']);
  const r = cli(dir, ['release', 'notes', '--json']).json;
  assert.equal(r.rollout.length, 2);
  assert.equal(r.rollout[0].signal, '5xx > 1 % → turn off');
  assert.deepEqual(r.rollout[0].missing, []);
  assert.deepEqual(r.rollout[1].missing, ['rollback', 'signal']);
  cleanup(dir);
});

test('metrics: learnings cited by a plan, applied in a commit, never cited', () => {
  const old = '---\ntitle: Old trap\ndate: 2020-01-01\n---\n';
  const dir = tempRepo({
    'docs/learnings/bugs/rounding.md': old,
    'docs/learnings/bugs/forgotten.md': old,
    'docs/plans/2026-01-01-feat-x-plan.md': `---\ntitle: X - Plan\ndate: ${new Date().toISOString().slice(0, 10)}\n---\nSee docs/learnings/bugs/rounding.md\n`,
    'app.js': '1\n',
  });
  writeFiles(dir, { 'app.js': '2\n' });
  gitc(dir, ['commit', '-qam', 'fix: rounding\n\nApplies docs/learnings/bugs/rounding.md']);
  const loop = cli(dir, ['metrics', '--since', '30d', '--no-github']).json.kaizen_loop;
  assert.equal(loop.learnings_cited_by_new_plans, 1);
  assert.equal(loop.learnings_applied_in_commits, 1);
  assert.equal(loop.learning_reuse_rate, 0.5);
  assert.deepEqual(loop.learnings_never_cited_sample, ['learnings/bugs/forgotten.md']);
  cleanup(dir);
});

test('profile: standard by default, init --profile, unknown value reported without breaking', () => {
  const dir = tempRepo({});
  assert.notEqual(cli(dir, ['init', '--profile', 'turbo']).code, 0);
  cli(dir, ['init', '--profile', 'lean']);
  assert.equal(cli(dir, ['config']).json.profile, 'lean');
  writeFiles(dir, { '.kaizen/config.local.json': { profile: 'turbo' } });
  const c = cli(dir, ['config']).json;
  assert.equal(c.profile, 'standard');
  assert.match(c.profile_warning, /turbo/);
  cleanup(dir);
});

test('dev detect: monorepo and .claude/launch.json first', () => {
  const dir = tempRepo({
    'package.json': { scripts: { dev: 'turbo dev' } },
    'apps/site/package.json': { name: 'site', scripts: { dev: 'next dev -p 3100' }, dependencies: { next: '15' } },
  });
  const c = cli(dir, ['dev', 'detect']).json;
  const site = c.find((x) => x.name === 'site');
  assert.equal(site.framework, 'Next.js');
  assert.equal(site.port, 3100);
  writeFiles(dir, {
    'apps/srv/package.json': { name: 'srv', scripts: { dev: 'node --watch server.js' } },
    'apps/srv/server.js': 'const port = process.env.PORT || 5173;\ncreateServer(h).listen(port);\n',
    'apps/api/package.json': { name: 'api', scripts: { dev: 'node api.mjs' } },
    'apps/api/api.mjs': 'app.listen(8080, () => {});\n',
  });
  const ports = Object.fromEntries(cli(dir, ['dev', 'detect']).json.map((x) => [x.name, x.port]));
  assert.equal(ports.srv, 5173, 'port read from the entry point (process.env.PORT || 5173)');
  assert.equal(ports.api, 8080, 'port read from listen(8080)');
  writeFiles(dir, { '.claude/launch.json': { configurations: [{ name: 'web', runtimeExecutable: 'pnpm', runtimeArgs: ['dev'], port: 4000 }] } });
  assert.deepEqual(cli(dir, ['dev', 'detect']).json.map((x) => x.source), ['.claude/launch.json']);
  cleanup(dir);
});

test('status: loop diagnosis and next step', () => {
  const dir = tempRepo({ 'a.js': '1\n' });
  const next = () => cli(dir, ['status', '--json']).json.next.map((n) => n.command.split(' ')[0]);
  assert.deepEqual(next(), ['/kaizen:setup']);
  cli(dir, ['init']);
  writeFiles(dir, { 'CONSTITUTION.md': CONSTITUTION });
  gitc(dir, ['add', '-A'], ['commit', '-qm', 'chore: kaizen']);
  assert.deepEqual(next(), ['/kaizen:brainstorm']);
  gitc(dir, ['checkout', '-qb', 'feat/x']);
  writeFiles(dir, { 'a.js': '2\n' });
  assert.deepEqual(next(), ['/kaizen:review'], 'uncommitted, unreviewed changes');
  gitc(dir, ['commit', '-qam', 'feat: x']);
  cli(dir, ['review', 'record', '--verdict', 'ready']);
  const st = cli(dir, ['status', '--json']).json;
  assert.deepEqual(st.next.map((n) => n.command), ['/kaizen:ship']);
  assert.equal(st.review.push_allowed, true);
  assert.equal(st.constitution.valid, true);
  cli(dir, ['gate', 'on']);
  assert.deepEqual(next(), ['/kaizen:work'], 'work in progress under the quality gate');
  assert.match(cli(dir, ['status']).stdout, /Next:/);
  cleanup(dir);
});

test('help and unknown command', () => {
  const dir = tempRepo({});
  assert.match(cli(dir, ['help']).stdout, /plan check/);
  assert.equal(cli(dir, ['whatever']).code, 2);
  execFileSync('git', ['status'], { cwd: dir });
  cleanup(dir);
});
