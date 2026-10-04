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

### I. Preuve d'abord — NON NÉGOCIABLE
Tout changement de comportement arrive avec un test qui échouait avant.
**Contrôle :** chaque unité a-t-elle une preuve rouge constatée ?

### II. Simplicité
Pas de mécanisme non demandé.
**Contrôle :** toute complexité est-elle justifiée ?

### III. Petits lots
PR sous le plafond.
**Contrôle :** size passe ?

### IV. Sécurité par défaut
Entrées validées.
**Contrôle :** entrées non fiables validées ?

## Politique IA

### V. Autonomie des agents
Jamais de merge.
**Contrôle :** aucune action réservée faite seule ?
`;

test('init crée la config, les dossiers et ignore config.local', () => {
  const dir = tempRepo({ 'package.json': { scripts: { test: 'node -e 0' } } });
  const r = cli(dir, ['init', '--language', 'fr']);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(existsSync(join(dir, '.kaizen/config.json')));
  for (const d of ['plans', 'learnings', 'ideation']) assert.ok(existsSync(join(dir, 'docs', d)));
  assert.match(readFileSync(join(dir, '.gitignore'), 'utf8'), /\.kaizen\/config\.local\.json/);
  assert.equal(JSON.parse(readFileSync(join(dir, '.kaizen/config.json'), 'utf8')).language, 'fr');
  // Idempotent : une seconde exécution ne réécrit rien.
  assert.deepEqual(cli(dir, ['init']).json.created, []);
  cleanup(dir);
});

test('verify : vert, rouge, et audit exclu par défaut', () => {
  const dir = tempRepo({ '.kaizen/config.json': { verify: { test: 'node -e "process.exit(0)"', lint: 'node -e "process.exit(3)"', audit: 'node -e "process.exit(9)"' } } });
  const red = cli(dir, ['verify', '--json']);
  assert.equal(red.code, 1);
  assert.deepEqual(red.json.map((r) => [r.name, r.ok]), [['test', true], ['lint', false]]);
  assert.equal(cli(dir, ['verify', '--only', 'test']).code, 0);
  assert.equal(cli(dir, ['verify', '--only', 'audit']).code, 1);
  cleanup(dir);
});

test('plan new réserve des noms uniques ; plan check valide l’exemple de référence', () => {
  const dir = tempRepo({ 'CONSTITUTION.md': CONSTITUTION });
  const a = cli(dir, ['plan', 'new', '--type', 'feat', '--topic', 'Export CSV des commandes']).stdout.trim();
  const b = cli(dir, ['plan', 'new', '--type', 'feat', '--topic', 'Export CSV des commandes']).stdout.trim();
  assert.match(a, /^docs\/plans\/\d{4}-\d{2}-\d{2}-\d{4}-feat-export-csv-des-commandes-plan\.md$/);
  assert.notEqual(a, b);
  writeFileSync(join(dir, 'plan.md'), readFileSync(join(PLUGIN, 'templates/plan-example.md'), 'utf8'));
  const ok = cli(dir, ['plan', 'check', 'plan.md', '--json']);
  assert.equal(ok.code, 0, JSON.stringify(ok.json));
  assert.equal(ok.json.stage, 'implementation-ready');
  assert.equal(ok.json.requirements, 5);
  assert.equal(ok.json.units, 3);
  cleanup(dir);
});

test('plan check attrape les défauts de traçabilité et de constitution', () => {
  const dir = tempRepo({ 'CONSTITUTION.md': CONSTITUTION });
  // Sous Windows, git extrait le gabarit en CRLF : on normalise avant d'y injecter les défauts.
  let text = readFileSync(join(PLUGIN, 'templates/plan-example.md'), 'utf8').replace(/\r\n/g, '\n');
  text = text
    .replace('| V. Autonomie des agents | ✅ | aucune migration ni dépendance ajoutée |\n', '')
    .replace('- R5. Au-delà', '- R7. Au-delà')
    .replace('### Exemples', '[À CLARIFIER : quel format ?]\n### Exemples')
    .replace('- **Preuve :** test système.\n', '')
    .replace('status_placeholder', '');
  writeFileSync(join(dir, 'bad.md'), text);
  const r = cli(dir, ['plan', 'check', 'bad.md', '--json']);
  assert.equal(r.code, 1);
  const errs = r.json.errors.join('\n');
  assert.match(errs, /numérotation non continue \(R7/);
  assert.match(errs, /À CLARIFIER/);
  assert.match(errs, /U3 : champ \*\*Preuve :\*\* manquant/);
  assert.match(errs, /R7 n'est couvert par aucune unité/);
  assert.match(errs, /article V \(Autonomie des agents\) non évalué/);
  cleanup(dir);
});

test('plan check : un plan au stade exigences tolère les marqueurs mais pas le champ status', () => {
  const dir = tempRepo({});
  writeFiles(dir, {
    'req.md': '---\ntitle: X - Plan\ntype: feat\ndate: 2026-10-02\ntopic: x\nartifact: kaizen-plan/v1\nstatus: active\n---\n<!-- kaizen:goal -->\n## Capsule\n<!-- kaizen:product -->\n## Contrat\n- R1. Faire X. [À CLARIFIER : lequel ?]\n',
  });
  const r = cli(dir, ['plan', 'check', 'req.md', '--json']);
  assert.equal(r.json.stage, 'requirements');
  assert.ok(r.json.warnings.some((w) => /À CLARIFIER/.test(w)));
  assert.ok(r.json.errors.some((e) => /status interdit/.test(e)));
  cleanup(dir);
});

test('constitution : lecture, validation et défauts', () => {
  const dir = tempRepo({ 'CONSTITUTION.md': CONSTITUTION });
  const c = cli(dir, ['constitution', '--json']).json;
  assert.equal(c.articles.length, 5);
  assert.equal(c.articles[0].non_negotiable, true);
  assert.equal(c.articles[0].title, "Preuve d'abord");
  assert.equal(c.articles[4].section, 'Politique IA');
  assert.equal(cli(dir, ['constitution', 'check']).code, 0);
  writeFileSync(join(dir, 'CONSTITUTION.md'), CONSTITUTION.replace('version: 1.0.0', 'version: v1').replace('### III.', '### IV.').replace('**Contrôle :** size passe ?\n', ''));
  const bad = cli(dir, ['constitution', 'check', '--json']).json;
  assert.ok(bad.errors.some((e) => /version/.test(e)));
  assert.ok(bad.errors.some((e) => /numérotation attendue III/.test(e)));
  assert.ok(bad.errors.some((e) => /Contrôle :\*\* manquant/.test(e)));
  cleanup(dir);
});

test('learnings : validation par piste et recherche classée', () => {
  const dir = tempRepo({
    'docs/learnings/runtime-errors/csv-bom.md':
      '---\ntitle: Excel casse les accents des exports CSV\ndate: 2026-09-12\nmodule: exports\nproblem_type: runtime_error\ncomponent: service_layer\nsymptoms:\n  - "Accents illisibles"\nroot_cause: wrong_api\nresolution_type: code_fix\nseverity: medium\ntags: [csv, excel, bom]\n---\n# x\n',
    'docs/learnings/conventions/naming.md':
      '---\ntitle: Nommer les jobs par verbe\ndate: 2026-09-01\nmodule: jobs\nproblem_type: convention\ncomponent: background_job\nseverity: low\n---\n# y\n',
    'docs/learnings/bad.md': '---\ntitle: Mauvais\ndate: 12/09/2026\nproblem_type: runtime_error\nseverity: urgent\n---\n',
  });
  const v = cli(dir, ['learnings', 'validate']);
  assert.equal(v.code, 1);
  assert.match(v.stdout, /✘ docs\/learnings\/bad\.md/);
  assert.match(v.stdout, /✔ docs\/learnings\/conventions\/naming\.md/);
  assert.match(v.stdout, /piste bug : champ requis manquant : symptoms/);
  const s = cli(dir, ['learnings', 'search', 'export', 'CSV', 'excel', '--json']).json;
  assert.equal(s[0].path, 'docs/learnings/runtime-errors/csv-bom.md');
  assert.equal(cli(dir, ['learnings', 'search', 'kubernetes', '--json']).json.length, 0);
  cleanup(dir);
});

test('packs : local, git épinglé multi-packs, erreurs explicites', () => {
  const src = tempRepo({
    'rails/no-callbacks.md': '---\ntitle: Pas de callbacks\napplies_when:\n  - ajouter de la logique à la sauvegarde\n---\nx\n',
    'inertia/props.md': '---\ntitle: Props serveur\napplies_when: [ajouter une page]\n---\nx\n',
  });
  gitc(src, ['tag', 'v1.0.0']);
  const dir = tempRepo({});
  assert.equal(cli(dir, ['pack', 'new', 'house-rules']).code, 0);
  writeFiles(dir, {
    'kaizen-packs/house-rules/csv.md': '---\ntitle: BOM obligatoire\napplies_when:\n  - ajouter un export CSV\n---\nx\n',
    'kaizen-packs/house-rules/notes.md': 'pas de frontmatter\n',
  });
  const cfgPath = join(dir, '.kaizen/config.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  cfg.packs.push({ source: `file://${src}`, ref: 'v1.0.0', pack: ['rails'] }, { source: 'missing/dir' });
  writeFileSync(cfgPath, JSON.stringify(cfg));
  const r = cli(dir, ['packs', '--json'], { env: { CLAUDE_PLUGIN_DATA: join(dir, '.data') } }).json;
  assert.deepEqual(r.packs.map((p) => p.id).sort(), ['house-rules', 'rails']);
  assert.ok(r.warnings.some((w) => /notes\.md ignoré/.test(w)));
  assert.ok(r.warnings.some((w) => /introuvable : missing\/dir/.test(w)));
  cleanup(src);
  cleanup(dir);
});

test('size : compte le diff vs la base, ignore les lockfiles, applique le plafond', () => {
  const dir = tempRepo({ 'a.txt': 'x\n' });
  gitc(dir, ['checkout', '-qb', 'feat/x']);
  writeFiles(dir, { 'b.txt': `${'ligne\n'.repeat(30)}`, 'package-lock.json': `${'{}\n'.repeat(500)}` });
  gitc(dir, ['add', '-A'], ['commit', '-qm', 'feat: b']);
  const ok = cli(dir, ['size', '--json']);
  assert.equal(ok.code, 0);
  assert.equal(ok.json.total, 30);
  assert.equal(ok.json.ignored, 1);
  assert.equal(cli(dir, ['size', '--max', '10']).code, 1);
  cleanup(dir);
});

test('adr et post-mortem : numérotation et réservation', () => {
  const dir = tempRepo({});
  assert.equal(cli(dir, ['adr', 'new', '--title', 'File de jobs']).stdout.trim(), 'docs/adr/0001-file-de-jobs.md');
  assert.equal(cli(dir, ['adr', 'new', '--title', "Choix d'un fournisseur"]).stdout.trim(), 'docs/adr/0002-choix-d-un-fournisseur.md');
  assert.match(cli(dir, ['postmortem', 'new', '--title', 'Panne exports']).stdout, /^docs\/postmortems\/\d{4}-\d{2}-\d{2}-panne-exports\.md/);
  cleanup(dir);
});

test('release notes : regroupement, changement cassant, SemVer', () => {
  const dir = tempRepo({ 'a.txt': '1' });
  gitc(dir, ['tag', 'v1.4.2']);
  for (const [f, msg] of [
    ['b', 'feat(api): export CSV'],
    ['c', 'fix: accents'],
    ['d', 'chore: deps'],
    ['e', 'refactor!: nouveau format de config'],
  ]) {
    writeFiles(dir, { [f]: f });
    gitc(dir, ['add', '-A'], ['commit', '-qm', msg]);
  }
  const r = cli(dir, ['release', 'notes', '--json']).json;
  assert.equal(r.from, 'v1.4.2');
  assert.equal(r.commits, 4);
  assert.equal(r.level, 'major');
  assert.equal(r.next, '2.0.0');
  assert.deepEqual(Object.keys(r.groups), ['Nouveautés', 'Corrections', 'Refactoring']);
  cleanup(dir);
});

test('metrics : calcule sans GitHub sur un historique de merges', () => {
  const dir = tempRepo({ 'app.js': '1\n' });
  for (const [i, kind] of [[1, 'feat'], [2, 'fix'], [3, 'feat']]) {
    gitc(dir, ['checkout', '-qb', `b${i}`]);
    writeFiles(dir, { 'app.js': `v${i}\n` });
    gitc(dir, ['commit', '-qam', `${kind}: change ${i}`], ['checkout', '-q', 'main'], ['merge', '--no-ff', '-q', '-m', `${kind}: merge ${i}`, `b${i}`]);
  }
  const m = cli(dir, ['metrics', '--since', '30d', '--no-github']).json;
  assert.equal(m.changes, 4, 'le commit initial + 3 merges');
  assert.equal(m.throughput.rework_rate, 0.25, '1 fix sur 4 changements');
  assert.equal(m.instability.change_failure_rate, 0.33, 'la 1re feature est suivie d’un fix sur le même fichier (1 sur 3 non-fix)');
  assert.ok(m.throughput.lead_time_hours_median !== null);
  cleanup(dir);
});

test('metrics : leçons citées par un plan, appliquées dans un commit, jamais citées', () => {
  const old = '---\ntitle: Vieux piège\ndate: 2020-01-01\n---\n';
  const dir = tempRepo({
    'docs/learnings/bugs/arrondi.md': old,
    'docs/learnings/bugs/oubliee.md': old,
    'docs/plans/2026-01-01-feat-x-plan.md': `---\ntitle: X - Plan\ndate: ${new Date().toISOString().slice(0, 10)}\n---\nVoir docs/learnings/bugs/arrondi.md\n`,
    'app.js': '1\n',
  });
  writeFiles(dir, { 'app.js': '2\n' });
  gitc(dir, ['commit', '-qam', 'fix: arrondi\n\nApplique docs/learnings/bugs/arrondi.md']);
  const loop = cli(dir, ['metrics', '--since', '30d', '--no-github']).json.kaizen_loop;
  assert.equal(loop.learnings_cited_by_new_plans, 1);
  assert.equal(loop.learnings_applied_in_commits, 1);
  assert.equal(loop.learning_reuse_rate, 0.5);
  assert.deepEqual(loop.learnings_never_cited_sample, ['learnings/bugs/oubliee.md']);
  cleanup(dir);
});

test('profil : défaut standard, init --profile, valeur inconnue signalée sans casser', () => {
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

test('dev detect : monorepo et .claude/launch.json prioritaire', () => {
  const dir = tempRepo({
    'package.json': { scripts: { dev: 'turbo dev' } },
    'apps/site/package.json': { name: 'site', scripts: { dev: 'next dev -p 3100' }, dependencies: { next: '15' } },
  });
  const c = cli(dir, ['dev', 'detect']).json;
  const site = c.find((x) => x.name === 'site');
  assert.equal(site.framework, 'Next.js');
  assert.equal(site.port, 3100);
  writeFiles(dir, { '.claude/launch.json': { configurations: [{ name: 'web', runtimeExecutable: 'pnpm', runtimeArgs: ['dev'], port: 4000 }] } });
  assert.deepEqual(cli(dir, ['dev', 'detect']).json.map((x) => x.source), ['.claude/launch.json']);
  cleanup(dir);
});

test('aide et commande inconnue', () => {
  const dir = tempRepo({});
  assert.match(cli(dir, ['help']).stdout, /plan check/);
  assert.equal(cli(dir, ['nimporte']).code, 2);
  execFileSync('git', ['status'], { cwd: dir });
  cleanup(dir);
});
