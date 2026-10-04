#!/usr/bin/env node
// Kaizen — CLI déterministe utilisé par les skills et le hook.
//
//   node kaizen.mjs status [--json]              où en est le repo dans la boucle, et la commande suivante
//   node kaizen.mjs root                         chemins des livrables (JSON)
//   node kaizen.mjs models [--json] [--agent a]  modèle de chaque agent selon le profil et la config
//   node kaizen.mjs audit [--json] [--no-github] | audit fix <id> [--owner @x]   maturité SDLC du projet
//   node kaizen.mjs deploy request|run <env> [--ref r] | rollback <env> [--reason …] [--to r] | list [--env e]
//                                                 déploiement par les commandes de l'équipe, tag deploy/<env>/…
//   node kaizen.mjs deploy flag on|off <nom> [--env e]     feature flag (deploy.flags)
//   node kaizen.mjs deploy detect [--json] | configure <id> [--force]   plateforme reconnue → config
//   node kaizen.mjs monitor check|watch [--env e] [--plan p] [--minutes 15] [--interval 60]
//                                                 signaux de production (exit 1 si seuil franchi)
//   node kaizen.mjs config                       configuration effective (JSON)
//   node kaizen.mjs init [--docs-root d] [--language fr] [--profile lean|standard|full]   initialise .kaizen/ et les dossiers
//   node kaizen.mjs detect                       stack et commandes de vérification (JSON)
//   node kaizen.mjs verify [--only test,lint] [--json]     lance les vérifications (exit 1 si rouge)
//   node kaizen.mjs plan new --type feat --topic export-csv   réserve le chemin d'un plan
//   node kaizen.mjs plan latest | list           plans existants
//   node kaizen.mjs learnings search <mots…> [--limit 8] [--json]
//   node kaizen.mjs learnings validate [fichiers…]
//   node kaizen.mjs learnings stats
//   node kaizen.mjs packs [--json] [--refresh]   règles des Kaizen Packs déclarés
//   node kaizen.mjs pack new <nom>               crée et déclare un pack local
//   node kaizen.mjs gate on [--plan p] | off | status      garde-fou qualité du hook Stop
//   node kaizen.mjs review record --verdict ready|reserves|blocked [--run d] | waive --reason "…" | status | check
//                                                 état relu par branche, exigé par le hook avant git push ;
//                                                 record exige des relecteurs réellement lancés (sauf revue
//                                                 légère), waive attend la confirmation tapée par l'utilisateur
//   node kaizen.mjs run-dir <type>                dossier de run local (ex. reviews), ignoré par git
//   node kaizen.mjs constitution [check] [--json] articles de CONSTITUTION.md / validation
//   node kaizen.mjs plan check <chemin> [--json]  contrôle structurel d'un plan (traçabilité R/AE → U)
//   node kaizen.mjs size [--base <ref>] [--json]  taille du diff vs pr.max_lines (exit 1 si au-delà)
//   node kaizen.mjs dev detect | probe --url U    serveur de dev (polish)
//   node kaizen.mjs metrics [--since 90d] [--no-github]   indicateurs DORA approchés + santé de la boucle
//   node kaizen.mjs adr new --title "…" | adr list        décisions d'architecture (docs/adr)
//   node kaizen.mjs postmortem new --title "…"            réserve un post-mortem (docs/postmortems)
//   node kaizen.mjs release notes [--from <tag>]          notes de version + version SemVer proposée
//   node kaizen.mjs pr snapshot|watch|mark|threads|reply|resolve|comment|update-branch …   suivi de PR (voir pr.mjs)

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { loadConstitution, validateConstitution } from './constitution.mjs';
import { checkPlan } from './plancheck.mjs';
import * as prmod from './pr.mjs';
import { detectDevServers, probe } from './devserver.mjs';
import { computeMetrics } from './metrics.mjs';
import { releaseNotes } from './release.mjs';
import { deploy, deployments, flag, requestDeploy, rollback } from './deploy.mjs';
import { configureDeploy, detectDeploy } from './deploydetect.mjs';
import { ROLE_LABELS, resolveModels } from './models.mjs';
import { audit, scaffold } from './audit.mjs';
import { check as monitorCheck, watch as monitorWatch } from './monitor.mjs';
import { checkPush, currentBranch, recordReview, requestWaiver, reviewStatus } from './review-state.mjs';
import {
  DEFAULT_CONFIG,
  PROFILES,
  defaultBranch,
  diffBase,
  diffSize,
  detectStack,
  docsRoot,
  expandHome,
  git,
  loadConfig,
  parseFrontmatter,
  repoRoot,
  runVerify,
  verifyCommands,
  walkMarkdown,
} from './lib.mjs';

const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else flags[key] = true;
  } else positional.push(a);
}

function die(msg, code = 2) {
  process.stderr.write(`kaizen: ${msg}\n`);
  process.exit(code);
}

function out(value) {
  process.stdout.write(typeof value === 'string' ? `${value}\n` : `${JSON.stringify(value, null, 2)}\n`);
}

function requireRepo() {
  const root = repoRoot();
  if (!root) die('pas de dépôt git ici — Kaizen range ses livrables dans le repo.');
  return root;
}

// Chemins affichés en style POSIX, y compris sous Windows : git, Node et les skills les acceptent tels quels.
const rel = (root, p) => relative(root, p).split(sep).join('/') || '.';

// ---------------------------------------------------------------------------
// root / config / init
// ---------------------------------------------------------------------------

function paths(root) {
  const config = loadConfig(root);
  const docs = docsRoot(root, config);
  return {
    repo: root,
    docs_root: rel(root, docs),
    plans: rel(root, join(docs, 'plans')),
    learnings: rel(root, join(docs, 'learnings')),
    ideation: rel(root, join(docs, 'ideation')),
    debug: rel(root, join(docs, 'debug')),
    config_file: existsSync(join(root, '.kaizen', 'config.json')) ? '.kaizen/config.json' : null,
    concepts: existsSync(join(root, 'CONCEPTS.md')) ? 'CONCEPTS.md' : null,
  };
}

function cmdInit(root) {
  const dir = join(root, '.kaizen');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'config.json');
  const created = [];
  if (flags.profile && !PROFILES.includes(flags.profile)) die(`--profile attendu : ${PROFILES.join(' | ')}`);
  if (!existsSync(file)) {
    const config = {
      docs_root: flags['docs-root'] || DEFAULT_CONFIG.docs_root,
      language: flags.language || DEFAULT_CONFIG.language,
      tracker: flags.tracker || DEFAULT_CONFIG.tracker,
      profile: flags.profile || DEFAULT_CONFIG.profile,
      verify: {},
      gate: DEFAULT_CONFIG.gate,
      review: DEFAULT_CONFIG.review,
      packs: [],
    };
    writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
    created.push('.kaizen/config.json');
  }
  ensureStateDir(root);
  const docs = docsRoot(root);
  for (const sub of ['plans', 'learnings', 'ideation']) {
    const d = join(docs, sub);
    if (!existsSync(d)) {
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, '.gitkeep'), '');
      created.push(rel(root, d));
    }
  }
  // config.local.json reste personnel.
  const gi = join(root, '.gitignore');
  const line = '.kaizen/config.local.json';
  const current = existsSync(gi) ? readFileSync(gi, 'utf8') : '';
  if (!current.split(/\r?\n/).includes(line)) {
    writeFileSync(gi, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${line}\n`);
    created.push('.gitignore (+ .kaizen/config.local.json)');
  }
  out({ created, ...paths(root), detected: detectStack(root) });
}

// ---------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------

function cmdVerify(root) {
  const results = runVerify(root, { only: flags.only });
  if (flags.json) out(results);
  else if (!results.length) out('Aucune commande de vérification détectée ni configurée (.kaizen/config.json → verify).');
  else {
    for (const r of results) {
      out(`${r.ok ? '✔' : '✘'} ${r.name.padEnd(10)} ${r.command}  (${r.seconds}s)`);
      if (!r.ok) out(r.output.split('\n').map((l) => `    ${l}`).join('\n'));
    }
  }
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

// ---------------------------------------------------------------------------
// plans
// ---------------------------------------------------------------------------

function slugify(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function cmdPlan(root, sub) {
  const dir = join(docsRoot(root), 'plans');
  if (sub === 'new') {
    const type = slugify(flags.type || 'feat');
    const topic = slugify(flags.topic || positional[2] || '');
    if (!topic) die('--topic requis (ex. --topic export-csv-commandes)');
    mkdirSync(dir, { recursive: true });
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
    const ext = flags.ext === 'html' ? 'html' : 'md';
    for (let n = 1; n < 100; n++) {
      const name = `${stamp}-${type}-${topic}-plan${n > 1 ? `-${n}` : ''}.${ext}`;
      const file = join(dir, name);
      try {
        // Réservation atomique : 'wx' échoue si le fichier existe déjà.
        const fd = openSync(file, 'wx');
        closeSync(fd);
        out(rel(root, file));
        return;
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
      }
    }
    die('impossible de réserver un nom de plan');
  }
  const plans = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => /\.(md|html)$/.test(f))
        .map((f) => ({ file: join(dir, f), mtime: statSync(join(dir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)
    : [];
  if (sub === 'latest') {
    if (!plans.length) die('aucun plan', 1);
    out(rel(root, plans[0].file));
    return;
  }
  if (sub === 'list') {
    out(
      plans.map((p) => {
        const { data } = parseFrontmatter(readFileSync(p.file, 'utf8'));
        return {
          path: rel(root, p.file),
          title: data?.title || basename(p.file),
          stage: /<!-- kaizen:units -->/.test(readFileSync(p.file, 'utf8')) ? 'implementation-ready' : 'requirements',
          updated: new Date(p.mtime).toISOString().slice(0, 16).replace('T', ' '),
        };
      }),
    );
    return;
  }
  if (sub === 'check') {
    const target = positional[2];
    if (!target) die('usage : plan check <chemin>');
    const report = checkPlan(resolve(target), { constitution: loadConstitution(root) });
    if (flags.json) out(report);
    else {
      out(`${report.errors.length ? '✘' : '✔'} ${target} — ${report.stage} · ${report.requirements} R · ${report.acceptance_examples} AE · ${report.units} U${report.slices ? ` · ${report.slices} tranche(s)` : ''}`);
      for (const e of report.errors) out(`    ✘ ${e}`);
      for (const w of report.warnings) out(`    ⚠ ${w}`);
    }
    process.exit(report.errors.length ? 1 : 0);
  }
  die('usage : plan new --type <type> --topic <slug> | plan latest | plan list | plan check <chemin>');
}

// ---------------------------------------------------------------------------
// learnings (docs/learnings)
// ---------------------------------------------------------------------------

export const SCHEMA = {
  bug: ['build_error', 'test_failure', 'runtime_error', 'performance_issue', 'database_issue', 'security_issue', 'ui_bug', 'integration_issue', 'logic_error'],
  knowledge: ['best_practice', 'documentation_gap', 'workflow_issue', 'developer_experience', 'architecture_pattern', 'design_pattern', 'tooling_decision', 'convention'],
  severity: ['critical', 'high', 'medium', 'low'],
  resolution_type: ['code_fix', 'migration', 'config_change', 'test_fix', 'dependency_update', 'environment_setup', 'workflow_improvement', 'documentation_update', 'tooling_addition', 'seed_data_update'],
};

const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

function validateLearning(file) {
  const errors = [];
  const { data, error } = parseFrontmatter(readFileSync(file, 'utf8'));
  if (!data) return [error];
  if (error) errors.push(error);
  for (const k of ['title', 'date', 'module', 'problem_type', 'component', 'severity']) if (isEmpty(data[k])) errors.push(`champ requis manquant : ${k}`);
  if (data.date && !/^\d{4}-\d{2}-\d{2}$/.test(String(data.date))) errors.push(`date au format YYYY-MM-DD attendu : "${data.date}"`);
  const track = SCHEMA.bug.includes(data.problem_type) ? 'bug' : SCHEMA.knowledge.includes(data.problem_type) ? 'knowledge' : null;
  if (data.problem_type && !track) errors.push(`problem_type inconnu : "${data.problem_type}"`);
  if (data.severity && !SCHEMA.severity.includes(data.severity)) errors.push(`severity inconnue : "${data.severity}" (${SCHEMA.severity.join('|')})`);
  if (!isEmpty(data.resolution_type) && !SCHEMA.resolution_type.includes(data.resolution_type)) errors.push(`resolution_type inconnu : "${data.resolution_type}"`);
  if (track === 'bug') {
    for (const k of ['symptoms', 'root_cause', 'resolution_type']) if (isEmpty(data[k])) errors.push(`piste bug : champ requis manquant : ${k}`);
    if (data.symptoms && (!Array.isArray(data.symptoms) || data.symptoms.length > 5)) errors.push('symptoms : liste de 1 à 5 éléments');
  }
  if (track === 'knowledge' && data.applies_when && (!Array.isArray(data.applies_when) || data.applies_when.length > 5)) errors.push('applies_when : liste de 5 éléments maximum');
  if (data.tags && (!Array.isArray(data.tags) || data.tags.length > 8)) errors.push('tags : liste de 8 éléments maximum');
  if (track !== 'bug' && !isEmpty(data.framework_version)) errors.push('framework_version : réservé à la piste bug');
  return errors;
}

function loadLearnings(root) {
  const dir = join(docsRoot(root), 'learnings');
  return walkMarkdown(dir).map((file) => {
    const text = readFileSync(file, 'utf8');
    const { data, body } = parseFrontmatter(text);
    return { file, rel: rel(root, file), data: data || {}, body };
  });
}

function norm(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function cmdLearnings(root, sub) {
  if (sub === 'validate') {
    const files = positional.slice(2).length
      ? positional.slice(2).map((f) => resolve(f))
      : walkMarkdown(join(docsRoot(root), 'learnings'));
    let bad = 0;
    for (const f of files) {
      const errors = validateLearning(f);
      if (errors.length) {
        bad++;
        out(`✘ ${rel(root, f)}\n${errors.map((e) => `    - ${e}`).join('\n')}`);
      } else out(`✔ ${rel(root, f)}`);
    }
    if (!files.length) out('Aucune leçon à valider.');
    process.exit(bad ? 1 : 0);
  }
  const all = loadLearnings(root);
  if (sub === 'stats') {
    const count = (k) => all.reduce((acc, l) => ((acc[l.data[k] || '?'] = (acc[l.data[k] || '?'] || 0) + 1), acc), {});
    out({ total: all.length, by_problem_type: count('problem_type'), by_component: count('component'), by_module: count('module') });
    return;
  }
  if (sub === 'search') {
    const terms = positional.slice(2).flatMap((t) => norm(t).split(/[^a-z0-9_]+/)).filter((t) => t.length > 2);
    if (!terms.length) die('usage : learnings search <mots-clés…>');
    const limit = Number(flags.limit || 8);
    const scored = all
      .map((l) => {
        const d = l.data;
        const fields = [
          [norm(d.title), 4],
          [norm([].concat(d.tags || []).join(' ')), 4],
          [norm(`${d.module} ${d.component} ${[].concat(d.related_components || []).join(' ')}`), 3],
          [norm([].concat(d.applies_when || [], d.symptoms || []).join(' ')), 2],
          [norm(`${d.root_cause} ${d.problem_type}`), 2],
          [norm(l.body), 1],
        ];
        let score = 0;
        const hits = new Set();
        for (const t of terms)
          for (const [text, w] of fields)
            if (text.includes(t)) {
              score += w;
              hits.add(t);
            }
        score *= 1 + hits.size / terms.length;
        return { score: Math.round(score * 10) / 10, path: l.rel, title: d.title, problem_type: d.problem_type, module: d.module, date: d.date, severity: d.severity, matched: [...hits] };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || String(b.date).localeCompare(String(a.date)))
      .slice(0, limit);
    if (flags.json) out(scored);
    else if (!scored.length) out(`Aucune leçon ne correspond (${all.length} au total).`);
    else for (const r of scored) out(`${String(r.score).padStart(5)}  ${r.path}  — ${r.title} [${r.problem_type}, ${r.module}]`);
    return;
  }
  if (sub === 'list') {
    out(all.map((l) => ({ path: l.rel, title: l.data.title, problem_type: l.data.problem_type, module: l.data.module, date: l.data.date })));
    return;
  }
  die('usage : learnings search <mots…> | validate [fichiers…] | list | stats');
}

// ---------------------------------------------------------------------------
// Kaizen Packs — règles prescriptives déclarées dans .kaizen/config.json
// ---------------------------------------------------------------------------

function packCacheDir() {
  const base = process.env.CLAUDE_PLUGIN_DATA || join(homedir(), '.cache', 'kaizen');
  return join(base, 'packs');
}

function fetchGitSource(source, ref, refresh) {
  const key = createHash('sha1').update(`${source}#${ref || ''}`).digest('hex').slice(0, 12);
  const dir = join(packCacheDir(), key);
  if (existsSync(dir) && !refresh) return { dir, warning: null };
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dirname(dir), { recursive: true });
  const args = ['clone', '--depth', '1', '--quiet'];
  if (ref) args.push('--branch', ref);
  try {
    execFileSync('git', [...args, source, dir], { stdio: ['ignore', 'ignore', 'pipe'] });
    return { dir, warning: null };
  } catch (err) {
    return { dir: null, warning: `pack ${source}${ref ? `@${ref}` : ''} : clonage impossible (${String(err.stderr || err.message).trim().split('\n')[0]})` };
  }
}

function readRules(packDir) {
  const rules = [];
  const skipped = [];
  for (const entry of readdirSync(packDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name.toLowerCase() === 'readme.md') continue;
    const { data } = parseFrontmatter(readFileSync(join(packDir, entry.name), 'utf8'));
    if (!data || isEmpty(data.title) || isEmpty(data.applies_when)) skipped.push(entry.name);
    else rules.push({ file: entry.name, title: data.title, applies_when: [].concat(data.applies_when), tags: [].concat(data.tags || []) });
  }
  return { rules: rules.slice(0, 25), skipped };
}

function hasRules(dir) {
  return readdirSync(dir, { withFileTypes: true }).some((e) => e.isFile() && e.name.endsWith('.md') && e.name.toLowerCase() !== 'readme.md');
}

function resolvePacks(root, refresh) {
  const config = loadConfig(root);
  const packs = [];
  const warnings = [];
  for (const decl of config.packs || []) {
    const entry = typeof decl === 'string' ? { source: decl } : decl;
    if (!entry?.source) {
      warnings.push(`déclaration de pack sans "source" : ${JSON.stringify(decl)}`);
      continue;
    }
    let base;
    const remote = /^(https?:\/\/|git@|ssh:\/\/|file:\/\/)/.test(entry.source);
    if (remote) {
      const fetched = fetchGitSource(entry.source, entry.ref, refresh);
      if (!fetched.dir) {
        warnings.push(fetched.warning);
        continue;
      }
      base = entry.path ? join(fetched.dir, entry.path) : fetched.dir;
    } else {
      const p = expandHome(entry.source);
      base = isAbsolute(p) ? p : join(root, p);
    }
    if (!existsSync(base)) {
      warnings.push(`pack introuvable : ${entry.source}${entry.path ? `/${entry.path}` : ''}`);
      continue;
    }
    // Un dossier avec des règles au premier niveau = un pack ; sinon chaque sous-dossier en est un.
    const wanted = entry.pack ? [].concat(entry.pack) : null;
    const candidates = hasRules(base)
      ? [{ id: entry.id || basename(base), dir: base }]
      : readdirSync(base, { withFileTypes: true })
          .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
          .map((e) => ({ id: e.name, dir: join(base, e.name) }));
    for (const c of candidates) {
      if (wanted && !wanted.includes(c.id)) continue;
      const { rules, skipped } = readRules(c.dir);
      for (const s of skipped) warnings.push(`pack ${c.id} : ${s} ignoré (title et applies_when requis)`);
      if (!rules.length) {
        warnings.push(`pack ${c.id} : aucune règle au premier niveau`);
        continue;
      }
      packs.push({ id: c.id, source: entry.source, ref: entry.ref || null, dir: remote ? c.dir : rel(root, c.dir), rules });
    }
  }
  return { packs, warnings };
}

function cmdPacks(root) {
  const res = resolvePacks(root, Boolean(flags.refresh));
  if (flags.json) return out(res);
  if (!res.packs.length && !res.warnings.length) return out('Aucun pack déclaré (.kaizen/config.json → packs).');
  for (const p of res.packs) {
    out(`📦 ${p.id}  (${p.source}${p.ref ? `@${p.ref}` : ''}) → ${p.dir}`);
    for (const r of p.rules) out(`   • ${r.file} — ${r.title}\n       quand : ${r.applies_when.join(' | ')}`);
  }
  for (const w of res.warnings) out(`⚠ ${w}`);
}

function cmdPackNew(root) {
  const name = slugify(positional[2] || '');
  if (!name) die('usage : pack new <nom>');
  const dir = join(root, 'kaizen-packs', name);
  if (existsSync(dir) && readdirSync(dir).length) die(`${rel(root, dir)} existe déjà et n'est pas vide`);
  mkdirSync(join(dir, 'research'), { recursive: true });
  writeFileSync(join(dir, 'README.md'), `# Pack ${name}\n\nRègles que le plan doit respecter et que la revue fait appliquer.\nUne règle = un fichier .md au premier niveau avec \`title\` et \`applies_when\`.\nLes sous-dossiers (ex. research/) servent de stockage et ne sont jamais lus comme des règles.\n`);
  const cfgFile = join(root, '.kaizen', 'config.json');
  mkdirSync(dirname(cfgFile), { recursive: true });
  const cfg = existsSync(cfgFile) ? JSON.parse(readFileSync(cfgFile, 'utf8')) : { ...DEFAULT_CONFIG };
  cfg.packs = cfg.packs || [];
  const source = `kaizen-packs/${name}`;
  if (!cfg.packs.some((p) => (typeof p === 'string' ? p : p.source) === source)) cfg.packs.push({ source });
  writeFileSync(cfgFile, `${JSON.stringify(cfg, null, 2)}\n`);
  out({ pack: rel(root, dir), declared_in: '.kaizen/config.json' });
}

// ---------------------------------------------------------------------------
// gate — état du garde-fou lu par le hook Stop
// ---------------------------------------------------------------------------

function ensureStateDir(root) {
  const dir = join(root, '.kaizen', 'state');
  mkdirSync(dir, { recursive: true });
  const gi = join(dir, '.gitignore');
  if (!existsSync(gi)) writeFileSync(gi, '*\n');
  return dir;
}

function cmdGate(root, sub) {
  const file = join(ensureStateDir(root), 'gate.json');
  if (sub === 'on') {
    const state = { active: true, plan: flags.plan || null, since: new Date().toISOString(), blocks: 0 };
    writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
    out(state);
  } else if (sub === 'off') {
    // Un cycle terminé laisse une trace locale (durée, blocages, tokens) que /kaizen:metrics agrège :
    // c'est ce qui permet de juger si la cérémonie rapporte plus qu'elle ne coûte.
    let cycle = null;
    if (existsSync(file)) {
      try {
        const st = JSON.parse(readFileSync(file, 'utf8'));
        if (st.active && st.since) {
          const ended = new Date();
          cycle = {
            plan: st.plan || null,
            since: st.since,
            ended: ended.toISOString(),
            minutes: Math.round((ended - Date.parse(st.since)) / 6000) / 10,
            gate_blocks: st.blocks_total || 0,
            usage: st.usage || null,
          };
          appendFileSync(join(dirname(file), 'cycles.jsonl'), `${JSON.stringify(cycle)}\n`);
        }
      } catch {}
    }
    rmSync(file, { force: true });
    out({ active: false, cycle });
  } else if (sub === 'status') {
    out(existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { active: false });
  } else die('usage : gate on [--plan <chemin>] | off | status');
}

// ---------------------------------------------------------------------------
// status — diagnostic de l'état du repo dans la boucle (lu par /kaizen:help)
// ---------------------------------------------------------------------------

function repoStatus(root) {
  const config = loadConfig(root);
  const initialized = existsSync(join(root, '.kaizen', 'config.json'));
  const branch = currentBranch(root);
  const def = defaultBranch(root);
  const base = diffBase(root);
  const ahead = base ? Number(git(root, ['rev-list', '--count', `${base}..HEAD`], { allowFail: true }) || 0) : 0;
  const dirty = (git(root, ['status', '--porcelain'], { allowFail: true }) || '').split('\n').filter(Boolean).length;

  const c = loadConstitution(root);
  const constitution = c ? { exists: true, version: c.meta.version ?? null, valid: validateConstitution(c).errors.length === 0 } : { exists: false };

  let docs = null;
  try {
    docs = docsRoot(root, config);
  } catch {}
  const plansDir = docs && join(docs, 'plans');
  const plans = plansDir && existsSync(plansDir)
    ? readdirSync(plansDir).filter((f) => f.endsWith('.md')).map((f) => join(plansDir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    : [];
  let latest = null;
  if (plans.length) {
    const r = checkPlan(plans[0], { constitution: c });
    latest = { path: rel(root, plans[0]), stage: r.stage, errors: r.errors.length };
  }
  const learnings = docs ? walkMarkdown(join(docs, 'learnings')).length : 0;

  const gateFile = join(root, '.kaizen', 'state', 'gate.json');
  let gate = { active: false };
  try {
    if (existsSync(gateFile)) gate = JSON.parse(readFileSync(gateFile, 'utf8'));
  } catch {}
  const review = initialized && branch ? reviewStatus(root) : null;

  // Prochaine étape : la première situation qui s'applique, dans l'ordre de la boucle.
  const next = [];
  const say = (command, why) => next.push({ command, why });
  if (!initialized) say('/kaizen:setup', 'Kaizen n’est pas initialisé dans ce repo');
  else if (!constitution.exists) say('/kaizen:constitution', 'pas de CONSTITUTION.md : plan et revue n’ont que des règles génériques');
  if (gate.active) say('/kaizen:work', `un travail est en cours sous garde-fou${gate.plan ? ` (${gate.plan})` : ''} : le reprendre, ou \`gate off\` s’il est abandonné`);
  else if (branch && branch !== def && (ahead || dirty)) {
    if (review?.pending_waiver) say('kaizen waive <code>', 'une renonciation à la revue attend votre confirmation (à taper vous-même)');
    else if (review?.review && review.push.allowed && ahead && !dirty) say('/kaizen:ship', `branche ${branch} relue (${review.push.reason}) : prête à livrer`);
    else say('/kaizen:review', `branche ${branch} : ${review?.review ? review.push.reason : 'changements pas encore relus'}${dirty ? ' (non commités compris)' : ''}`);
  } else if (branch && branch === def && undeployed(root, config)) {
    const u = undeployed(root, config);
    say(`/kaizen:deploy ${u.env}`, `${u.commits} commit(s) de ${def} pas encore déployé(s) sur ${u.env}${u.last ? ` (dernier : ${u.last})` : ''}`);
  } else if (latest?.stage === 'requirements') say(`/kaizen:plan ${latest.path}`, 'des exigences attendent leur plan d’implémentation');
  else if (latest?.stage === 'implementation-ready' && !latest.errors) say(`/kaizen:work ${latest.path}`, 'un plan prêt attend d’être exécuté (si ce n’est pas déjà fait)');
  if (!next.length || (initialized && constitution.exists && !gate.active && !(branch && branch !== def && (ahead || dirty)))) {
    say('/kaizen:brainstorm <idée>', 'définir la prochaine fonctionnalité (ou /kaizen:ideate pour trouver quoi faire, /kaizen:debug pour un bug)');
  }
  return {
    repo: basename(root),
    branch,
    default_branch: def,
    ahead_of_base: ahead,
    uncommitted_files: dirty,
    initialized,
    profile: config.profile,
    constitution,
    plans: plans.length,
    latest_plan: latest,
    learnings,
    gate: { active: Boolean(gate.active), plan: gate.plan || null, since: gate.since || null },
    deploy: Object.keys(config.deploy.environments || {}).length ? { environments: Object.keys(config.deploy.environments), undeployed: undeployed(root, config) } : null,
    review: review ? { verdict: review.review?.verdict || null, depth: review.review?.depth || null, push_allowed: review.push.allowed, reason: review.push.reason, pending_waiver: Boolean(review.pending_waiver) } : null,
    next,
  };
}

// Commits de la branche courante pas encore déployés sur le premier environnement déclaré (staging
// avant production) : null si rien n'est configuré ou si tout est déployé.
function undeployed(root, config) {
  const envs = Object.keys(config.deploy.environments || {});
  if (!envs.length) return null;
  const env = envs.includes('production') ? 'production' : envs[0];
  const last = deployments(root, { env }).filter((d) => d.kind === 'deploy').at(-1);
  const commits = Number(git(root, ['rev-list', '--count', last ? `${last.sha}..HEAD` : 'HEAD'], { allowFail: true }) || 0);
  return commits ? { env, commits, last: last?.tag || null } : null;
}

function cmdStatus(root) {
  const st = repoStatus(root);
  if (flags.json) return out(st);
  const yes = (b) => (b ? '✔' : '✘');
  out(`Kaizen — ${st.branch || 'HEAD détachée'}${st.ahead_of_base ? ` (+${st.ahead_of_base} commit(s))` : ''}${st.uncommitted_files ? `, ${st.uncommitted_files} fichier(s) modifié(s)` : ''}`);
  out(`  ${yes(st.initialized)} initialisé${st.initialized ? ` · profil ${st.profile}` : ''}`);
  out(`  ${yes(st.constitution.exists)} constitution${st.constitution.exists ? ` v${st.constitution.version}${st.constitution.valid ? '' : ' (invalide)'}` : ''}`);
  out(`  · ${st.plans} plan(s)${st.latest_plan ? ` — dernier : ${st.latest_plan.path} (${st.latest_plan.stage})` : ''} · ${st.learnings} leçon(s)`);
  if (st.gate.active) out(`  ⚠ garde-fou actif depuis ${st.gate.since}`);
  if (st.review) out(`  ${yes(st.review.push_allowed)} push : ${st.review.reason}`);
  out('\nEnsuite :');
  for (const n of st.next) out(`  → ${n.command} — ${n.why}`);
}

// ---------------------------------------------------------------------------

const [cmd, sub] = positional;
try {
  switch (cmd) {
    case 'status':
      cmdStatus(requireRepo());
      break;
    case 'root':
      out(paths(requireRepo()));
      break;
    case 'audit': {
      const root = requireRepo();
      if (sub === 'fix') {
        const id = positional[2];
        if (!id) die('usage : audit fix <ci|pr_template|dependabot|codeowners|gitignore_env> [--owner @x]');
        out(scaffold(root, id, { owner: typeof flags.owner === 'string' ? flags.owner : undefined }));
        break;
      }
      const r = audit(root, { github: !flags['no-github'] });
      if (flags.json) {
        out(r);
        break;
      }
      const icon = { ok: '✔', warn: '⚠', missing: '✘', unknown: '?' };
      out(`Maturité SDLC — ${r.stacks.join(', ') || 'stack non reconnue'}`);
      for (const [area, a] of Object.entries(r.areas)) {
        out(`\n${area}${a.score === null ? '' : ` — ${a.score} %`}`);
        for (const ch of r.checks.filter((x) => x.area === area)) out(`  ${icon[ch.status]} ${ch.title} — ${ch.evidence}`);
      }
      if (r.next.length) {
        out('\nPar priorité :');
        for (const n of r.next) out(`  P${n.priority} ${n.title} → ${n.how}${n.scaffold ? ` (gabarit : audit fix ${n.scaffold})` : ''}`);
      }
      break;
    }
    case 'models': {
      const m = resolveModels(loadConfig(requireRepo()));
      if (typeof flags.agent === 'string') {
        const a = m.agents[flags.agent.replace(/^kaizen:/, '')];
        if (!a) die(`agent inconnu : ${flags.agent}`);
        out(a.model);
      } else if (flags.json) out(m);
      else {
        out(`Modèles — profil ${m.profile}`);
        for (const [r, v] of Object.entries(m.roles)) out(`  ${ROLE_LABELS[r].padEnd(52)} ${v.model.padEnd(8)} (${v.source})`);
        const own = Object.entries(m.agents).filter(([, v]) => v.source === 'config' && m.roles[v.role].source !== 'config');
        for (const [a, v] of own) out(`  ↳ ${a.padEnd(50)} ${v.model.padEnd(8)} (config)`);
        for (const w of m.warnings) out(`  ⚠ ${w}`);
      }
      break;
    }
    case 'deploy': {
      const root = requireRepo();
      const env = positional[2];
      const ref = typeof flags.ref === 'string' ? flags.ref : undefined;
      if (sub === 'detect') {
        const found = detectDeploy(root);
        if (flags.json) out(found);
        else if (!found.length) out('Aucun mécanisme de déploiement reconnu : déclarez vos commandes dans .kaizen/config.json → deploy.environments.');
        else {
          for (const c of found) {
            out(`● ${c.id} — ${c.platform} (confiance ${c.confidence}, ${c.source})`);
            for (const [e, d] of Object.entries(c.environments)) out(`    ${e.padEnd(10)} déployer : ${d.command}\n               revenir  : ${d.rollback || '— (à prévoir)'}`);
            for (const [n, s] of Object.entries(c.signals)) out(`    signal ${n} : ${s.url}`);
            for (const n of c.notes) out(`    · ${n}`);
          }
          out('\nÉcrire un candidat dans la config : node kaizen.mjs deploy configure <id>');
        }
      } else if (sub === 'configure') {
        if (!env) die('usage : deploy configure <id> [--force]   (id : voir deploy detect)');
        out(configureDeploy(root, env, { force: Boolean(flags.force) }));
      } else if (sub === 'request') out(requestDeploy(root, env, { ref }));
      else if (sub === 'run') {
        // Plans livrés depuis le dernier déploiement de cet environnement : leurs signaux et seuils
        // serviront à la surveillance qui suit.
        const last = deployments(root, { env }).filter((d) => d.kind === 'deploy').at(-1);
        const plans = releaseNotes(root, { from: last?.tag, to: ref || 'HEAD' }).rollout.map((r) => r.plan);
        const r = deploy(root, env, { ref, plans });
        out(r);
        process.exit(r.ok ? 0 : 1);
      } else if (sub === 'rollback') {
        const r = rollback(root, env, { reason: typeof flags.reason === 'string' ? flags.reason : null, to: typeof flags.to === 'string' ? flags.to : undefined });
        out(r);
        process.exit(r.ok ? 0 : 1);
      } else if (sub === 'list') out(deployments(root, { env: typeof flags.env === 'string' ? flags.env : null }));
      else if (sub === 'flag') {
        const state = positional[2];
        if (!['on', 'off'].includes(state) || !positional[3]) die('usage : deploy flag on|off <nom> [--env e]');
        const r = flag(root, state, positional[3], { env: typeof flags.env === 'string' ? flags.env : null });
        out(r);
        process.exit(r.ok ? 0 : 1);
      } else die('usage : deploy request|run <env> [--ref r] | deploy rollback <env> [--reason …] [--to r] | deploy list [--env e] | deploy flag on|off <nom>');
      break;
    }
    case 'monitor': {
      const root = requireRepo();
      const env = typeof flags.env === 'string' ? flags.env : null;
      // Sans --plan : les plans du dernier déploiement de l'environnement (seuils de leur rollout).
      const plan = typeof flags.plan === 'string' ? flags.plan : (env ? deployments(root, { env }).filter((d) => d.kind === 'deploy').at(-1)?.note?.plans || null : null);
      if (sub === 'check') {
        const r = await monitorCheck(root, { env, plan });
        out(r);
        process.exit(r.ok ? 0 : 1);
      } else if (sub === 'watch') {
        const r = await monitorWatch(root, {
          env,
          plan,
          minutes: flags.minutes,
          intervalSeconds: flags.interval,
          onSample: (c) => process.stderr.write(`[kaizen] ${c.at} ${c.ok ? '✔' : '✘'} ${Object.entries(c.signals).map(([n, s]) => `${n}=${s.value ?? '—'}${s.ok ? '' : '!'}`).join(' ')}\n`),
        });
        const config = loadConfig(root);
        if (r.status === 'breach' && env && config.deploy.auto_rollback && config.deploy.environments?.[env]?.rollback) {
          r.rollback = rollback(root, env, { reason: `monitor : ${r.breached.join(', ')} hors seuil` });
        }
        out(r);
        process.exit(r.status === 'breach' ? 1 : 0);
      } else die('usage : monitor check|watch [--env e] [--plan p] [--minutes 15] [--interval 60]');
      break;
    }
    case 'config':
      out(loadConfig(requireRepo()));
      break;
    case 'init':
      cmdInit(requireRepo());
      break;
    case 'detect': {
      const root = requireRepo();
      out(verifyCommands(root));
      break;
    }
    case 'verify':
      cmdVerify(requireRepo());
      break;
    case 'plan':
      cmdPlan(requireRepo(), sub);
      break;
    case 'learnings':
      cmdLearnings(requireRepo(), sub);
      break;
    case 'packs':
      cmdPacks(requireRepo());
      break;
    case 'pack':
      if (sub !== 'new') die('usage : pack new <nom>');
      cmdPackNew(requireRepo());
      break;
    case 'gate':
      cmdGate(requireRepo(), sub);
      break;
    case 'review': {
      const root = requireRepo();
      if (sub === 'record') out(recordReview(root, { verdict: flags.verdict, run: typeof flags.run === 'string' ? flags.run : null }));
      else if (sub === 'waive') out(requestWaiver(root, { reason: typeof flags.reason === 'string' ? flags.reason : null }));
      else if (sub === 'status') out(reviewStatus(root));
      else if (sub === 'check') {
        const res = checkPush(root);
        out(res);
        process.exit(res.allowed ? 0 : 1);
      } else die('usage : review record --verdict ready|reserves|blocked [--run <dossier>] | review waive --reason "…" | review status | review check');
      break;
    }
    case 'constitution': {
      const root = requireRepo();
      const c = loadConstitution(root);
      if (!c) {
        if (flags.json) out({ exists: false });
        else out('Aucune CONSTITUTION.md à la racine du repo (/kaizen:constitution pour la créer).');
        process.exit(sub === 'check' ? 1 : 0);
      }
      if (sub === 'check') {
        const v = validateConstitution(c);
        if (flags.json) out({ exists: true, version: c.meta.version, articles: c.articles.length, ...v });
        else {
          out(`${v.errors.length ? '✘' : '✔'} CONSTITUTION.md v${c.meta.version ?? '?'} — ${c.articles.length} article(s)`);
          for (const e of v.errors) out(`    ✘ ${e}`);
          for (const w of v.warnings) out(`    ⚠ ${w}`);
        }
        process.exit(v.errors.length ? 1 : 0);
      }
      if (flags.json) out({ exists: true, ...c });
      else {
        out(`CONSTITUTION.md v${c.meta.version ?? '?'} (ratifiée ${c.meta.ratified ?? '?'}, amendée ${c.meta.last_amended ?? '?'})`);
        for (const a of c.articles) out(`  ${a.id}. ${a.title}${a.non_negotiable ? ' — NON NÉGOCIABLE' : ''}\n      contrôle : ${a.control || '—'}`);
      }
      break;
    }
    case 'size': {
      const root = requireRepo();
      const config = loadConfig(root);
      const s = diffSize(root, { base: flags.base, ignore: config.pr.ignore });
      const max = Number(flags.max || config.pr.max_lines);
      const over = s.total > max;
      if (flags.json) out({ ...s, max_lines: max, over });
      else {
        out(`${over ? '✘' : '✔'} ${s.total} lignes modifiées (+${s.added} −${s.removed}) sur ${s.files} fichier(s) — plafond ${max}${s.ignored ? ` · ${s.ignored} fichier(s) ignoré(s)` : ''}`);
        if (over) for (const f of s.largest) out(`    ${String(f.added + f.removed).padStart(6)}  ${f.file}`);
      }
      process.exit(over ? 1 : 0);
    }
    case 'metrics': {
      const root = requireRepo();
      out(computeMetrics(root, { since: flags.since || '90d', useGitHub: !flags['no-github'] }));
      break;
    }
    case 'adr': {
      const root = requireRepo();
      const dir = join(docsRoot(root), 'adr');
      const existing = existsSync(dir) ? readdirSync(dir).filter((f) => /^\d{4}-.*\.md$/.test(f)).sort() : [];
      if (sub === 'list') {
        out(existing.map((f) => {
          const { data } = parseFrontmatter(readFileSync(join(dir, f), 'utf8'));
          return { path: rel(root, join(dir, f)), title: data?.title || f, status: data?.status || '?', date: data?.date || null };
        }));
      } else if (sub === 'new') {
        const title = flags.title || positional.slice(2).join(' ');
        if (!title) die('usage : adr new --title "Choix de la file de messages"');
        mkdirSync(dir, { recursive: true });
        const n = existing.length ? Number(existing.at(-1).slice(0, 4)) + 1 : 1;
        for (let k = n; k < n + 50; k++) {
          const file = join(dir, `${String(k).padStart(4, '0')}-${slugify(title)}.md`);
          try {
            closeSync(openSync(file, 'wx'));
            out(rel(root, file));
            break;
          } catch (err) {
            if (err.code !== 'EEXIST') throw err;
          }
        }
      } else die('usage : adr new --title "…" | adr list');
      break;
    }
    case 'postmortem': {
      const root = requireRepo();
      if (sub !== 'new') die('usage : postmortem new --title "…"');
      const title = flags.title || positional.slice(2).join(' ');
      if (!title) die('usage : postmortem new --title "Panne des exports du 3 novembre"');
      const dir = join(docsRoot(root), 'postmortems');
      mkdirSync(dir, { recursive: true });
      const day = new Date().toISOString().slice(0, 10);
      for (let k = 1; k < 50; k++) {
        const file = join(dir, `${day}-${slugify(title)}${k > 1 ? `-${k}` : ''}.md`);
        try {
          closeSync(openSync(file, 'wx'));
          out(rel(root, file));
          break;
        } catch (err) {
          if (err.code !== 'EEXIST') throw err;
        }
      }
      break;
    }
    case 'release': {
      const root = requireRepo();
      if (sub !== 'notes') die('usage : release notes [--from <tag>] [--to <ref>]');
      out(releaseNotes(root, { from: flags.from, to: flags.to || 'HEAD' }));
      break;
    }
    case 'dev': {
      const root = requireRepo();
      if (sub === 'detect') out(detectDevServers(root));
      else if (sub === 'probe') {
        if (!flags.url) die('usage : dev probe --url http://localhost:3000 [--timeout-seconds 30]');
        const r = await probe(flags.url, Number(flags['timeout-seconds'] || 30));
        out(r);
        process.exit(r.reachable ? 0 : 1);
      } else die('usage : dev detect | dev probe --url <url>');
      break;
    }
    case 'pr': {
      const root = requireRepo();
      const stateRoot = ensureStateDir(root);
      const opts = {
        pr: flags.pr,
        repo: flags.repo,
        start: Boolean(flags.start),
        budgetSeconds: flags['budget-seconds'],
        settleSeconds: flags['settle-seconds'],
        interval: flags.interval,
        thread: flags.thread,
        comment: flags.comment,
        check: flags.check,
        disposition: flags.disposition,
        note: flags.note,
        bodyFile: flags['body-file'],
        all: Boolean(flags.all),
      };
      if (sub === 'watch') process.exit(await prmod.watch(stateRoot, opts));
      const handlers = {
        snapshot: () => prmod.snapshot(stateRoot, opts),
        mark: () => prmod.mark(stateRoot, opts),
        threads: () => prmod.threads(opts),
        reply: () => prmod.reply(opts),
        resolve: () => prmod.resolveThread(opts),
        comment: () => prmod.comment(opts),
        'update-branch': () => prmod.updateBranch(stateRoot, opts),
      };
      if (!handlers[sub]) die('usage : pr snapshot|watch|mark|threads|reply|resolve|comment|update-branch');
      out(handlers[sub]());
      break;
    }
    case 'run-dir': {
      const root = requireRepo();
      const kind = slugify(sub || 'runs') || 'runs';
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const id = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      const dir = join(ensureStateDir(root), kind, id);
      mkdirSync(dir, { recursive: true });
      out(rel(root, dir));
      break;
    }
    default:
      out(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//   ')).map((l) => l.slice(3)).join('\n'));
      if (cmd && cmd !== 'help') process.exit(2);
  }
} catch (err) {
  die(err.message);
}
