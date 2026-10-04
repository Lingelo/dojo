// Kaizen — diagnostic de maturité du projet : ce qu'un SDLC solide suppose, ce qui est en place,
// ce qui manque, et comment le corriger, par ordre de priorité.
//
// Cinq domaines, du socle à la boucle : Fondations (CI, tests, secrets), Flux (revue, ownership,
// dépendances), Livraison (déploiement, retour arrière), Exploitation (signaux, santé), Boucle Kaizen.
// Chaque contrôle rend { id, area, title, status: ok|warn|missing|unknown, evidence, fix, priority }.
// Lecture seule. Les corrections simples et sans ambiguïté ont un **gabarit** (`audit fix <id>`), qui
// n'écrase jamais un fichier existant ; les autres renvoient vers la skill qui s'en charge.

import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadConstitution, validateConstitution } from './constitution.mjs';
import { detectDeploy } from './deploydetect.mjs';
import { defaultBranch, ghCommand, git, loadConfig, verifyCommands } from './lib.mjs';

const read = (root, p) => {
  try {
    return readFileSync(join(root, p), 'utf8');
  } catch {
    return null;
  }
};
const has = (root, p) => existsSync(join(root, p));
const firstOf = (root, list) => list.find((p) => has(root, p)) || null;

function ls(root, dir) {
  try {
    return readdirSync(join(root, dir));
  } catch {
    return [];
  }
}

function sourceFiles(root, dir = '', depth = 4, out = []) {
  if (depth < 0 || out.length > 4000) return out;
  for (const name of ls(root, dir)) {
    if (name.startsWith('.') || ['node_modules', 'vendor', 'dist', 'build', 'target', 'coverage', '__pycache__'].includes(name)) continue;
    const p = dir ? `${dir}/${name}` : name;
    let st;
    try {
      st = statSync(join(root, p));
    } catch {
      continue;
    }
    if (st.isDirectory()) sourceFiles(root, p, depth - 1, out);
    else if (/\.(m?[jt]sx?|py|go|rs|rb|java|kt|php|cs|ex|exs)$/.test(name)) out.push(p);
  }
  return out;
}

const TEST_FILE = /(^|\/)(tests?|spec|__tests__)\/|[._-](test|spec)\.[a-z]+$|_test\.(go|py)$|^test_.*\.py$|Test\.(java|kt)$/;
const CI_FILES = ['.gitlab-ci.yml', 'Jenkinsfile', '.circleci/config.yml', 'azure-pipelines.yml', 'bitbucket-pipelines.yml', '.buildkite/pipeline.yml'];

function githubRepo(root) {
  const url = git(root, ['remote', 'get-url', 'origin'], { allowFail: true }) || '';
  const m = /github\.com[:/]([^/]+)\/([^/]+?)(\.git)?$/.exec(url);
  return m ? { owner: m[1], repo: m[2] } : null;
}

function branchProtection(root, branch) {
  const gh = githubRepo(root);
  if (!gh || !branch) return { status: 'unknown', evidence: 'dépôt non hébergé sur GitHub, ou branche par défaut inconnue' };
  try {
    const [cmd, argv] = ghCommand(['api', `repos/${gh.owner}/${gh.repo}/branches/${branch}/protection`, '--jq', '{reviews: .required_pull_request_reviews.required_approving_review_count, checks: (.required_status_checks.contexts | length)}']);
    const r = spawnSync(cmd, argv, { encoding: 'utf8', timeout: 20000 });
    if (r.status === 0) {
      const p = JSON.parse(r.stdout || '{}');
      const ok = (p.reviews || 0) >= 1 && (p.checks || 0) >= 1;
      return { status: ok ? 'ok' : 'warn', evidence: `${p.reviews || 0} approbation(s) requise(s), ${p.checks || 0} check(s) requis` };
    }
    if (/Branch not protected|404/.test(`${r.stderr}${r.stdout}`)) return { status: 'missing', evidence: `${branch} n'est pas protégée` };
    return { status: 'unknown', evidence: 'gh n’a pas pu lire la protection (droits admin requis ?)' };
  } catch {
    return { status: 'unknown', evidence: 'gh indisponible' };
  }
}

export function audit(root, { github = true } = {}) {
  const config = loadConfig(root);
  const { stacks, commands } = verifyCommands(root, config);
  const branch = defaultBranch(root);
  const checks = [];
  const add = (id, area, title, status, evidence, fix, priority) => checks.push({ id, area, title, status, evidence, fix, priority });

  // --- Fondations -------------------------------------------------------------------------------------
  const remote = git(root, ['remote'], { allowFail: true });
  add('remote', 'Fondations', 'Dépôt distant', remote ? 'ok' : 'missing', remote ? `remote : ${remote.split('\n').join(', ')}` : 'aucun remote', { how: 'ajouter un remote (git remote add origin …) : sans lui, ni PR, ni CI, ni partage des leçons' }, 1);

  const workflows = ls(root, '.github/workflows').filter((f) => /\.ya?ml$/.test(f));
  const otherCi = CI_FILES.filter((f) => has(root, f));
  const ciText = [...workflows.map((f) => read(root, `.github/workflows/${f}`)), ...otherCi.map((f) => read(root, f))].join('\n');
  const ciRunsTests = /\btest\b|pytest|rspec|go test|cargo test|phpunit|mvn|gradle/.test(ciText);
  const ciFound = workflows.length || otherCi.length;
  add('ci', 'Fondations', 'Intégration continue qui lance les tests', !ciFound ? 'missing' : ciRunsTests ? 'ok' : 'warn',
    !ciFound ? 'aucune configuration de CI' : `${[...workflows.map((f) => `.github/workflows/${f}`), ...otherCi].join(', ')}${ciRunsTests ? '' : ' — aucune étape de test reconnue'}`,
    { how: 'une CI qui lance test, lint et typage à chaque PR', scaffold: commands.test ? 'ci' : null }, 1);

  const files = sourceFiles(root);
  const testFiles = files.filter((f) => TEST_FILE.test(f));
  add('tests', 'Fondations', 'Tests automatisés', commands.test && testFiles.length ? 'ok' : commands.test || testFiles.length ? 'warn' : 'missing',
    `${commands.test ? `commande : ${commands.test}` : 'aucune commande de test'} · ${testFiles.length} fichier(s) de test sur ${files.length} source(s)`,
    { how: commands.test ? 'écrire des tests (le garde-fou et la revue les exigent)' : 'déclarer la commande de test (.kaizen/config.json → verify.test) et écrire les premiers tests' }, 1);

  add('lint', 'Fondations', 'Lint', commands.lint ? 'ok' : 'warn', commands.lint || 'aucun linter détecté', { how: 'ajouter un linter de la stack et le déclarer dans verify.lint' }, 3);
  const typed = has(root, 'tsconfig.json') || /mypy|pyright/.test(read(root, 'pyproject.toml') || '');
  if (typed || commands.typecheck) add('typecheck', 'Fondations', 'Typage vérifié', commands.typecheck ? 'ok' : 'warn', commands.typecheck || 'projet typé sans commande de vérification', { how: 'déclarer verify.typecheck (ex. tsc --noEmit)' }, 2);

  const gi = read(root, '.gitignore') || '';
  const envIgnored = /(^|\n)\s*\/?\.env(\*|\b)/.test(gi);
  add('gitignore_env', 'Fondations', 'Fichiers de secrets ignorés par git', envIgnored ? 'ok' : 'missing', envIgnored ? '.env ignoré' : '.env absent de .gitignore', { how: 'ignorer .env et ses variantes', scaffold: 'gitignore_env' }, 1);

  const settings = `${read(root, '.claude/settings.json') || ''}${read(root, '.claude/settings.local.json') || ''}`;
  const scanning = /security@angelo-plugins/.test(settings) ? 'plugin security' : firstOf(root, ['.gitleaks.toml', '.secrets.baseline', '.trufflehog.yml']) || (/gitleaks|detect-secrets|trufflehog/.test(`${read(root, '.pre-commit-config.yaml') || ''}${ciText}`) ? 'scanner dans pre-commit ou la CI' : null);
  add('secret_scanning', 'Fondations', 'Détection de secrets', scanning ? 'ok' : 'missing', scanning || 'aucun scanner de secrets', { how: 'activer le plugin security du marketplace (enabledPlugins → security@angelo-plugins) ou gitleaks en CI' }, 2);

  // --- Flux ---------------------------------------------------------------------------------------------
  const prot = github ? branchProtection(root, branch) : { status: 'unknown', evidence: 'non vérifié (--no-github)' };
  add('branch_protection', 'Flux', `Branche ${branch || 'par défaut'} protégée (revue + checks requis)`, prot.status, prot.evidence, { how: 'GitHub → Settings → Branches : exiger une PR, une approbation et la CI verte' }, 1);
  const owners = firstOf(root, ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS']);
  add('codeowners', 'Flux', 'Propriétaires du code (CODEOWNERS)', owners ? 'ok' : 'missing', owners || 'aucun CODEOWNERS', { how: 'désigner qui relit quoi, dont CONSTITUTION.md et kaizen-packs/', scaffold: 'codeowners' }, 2);
  const tpl = firstOf(root, ['.github/pull_request_template.md', '.github/PULL_REQUEST_TEMPLATE.md', 'PULL_REQUEST_TEMPLATE.md', 'docs/pull_request_template.md']) || (ls(root, '.github/PULL_REQUEST_TEMPLATE').length ? '.github/PULL_REQUEST_TEMPLATE/' : null);
  add('pr_template', 'Flux', 'Modèle de PR', tpl ? 'ok' : 'missing', tpl || 'aucun modèle de PR', { how: 'un modèle qui demande pourquoi, preuves, retour arrière', scaffold: 'pr_template' }, 3);
  const deps = firstOf(root, ['.github/dependabot.yml', '.github/dependabot.yaml', 'renovate.json', '.github/renovate.json', 'renovate.json5', '.renovaterc']);
  add('dependency_updates', 'Flux', 'Mises à jour de dépendances automatisées', deps ? 'ok' : 'missing', deps || 'ni Dependabot ni Renovate', { how: 'petites PR de mise à jour régulières plutôt qu’un grand saut annuel', scaffold: stacks.length ? 'dependabot' : null }, 3);
  add('claude_md', 'Flux', 'Instructions projet pour les agents (CLAUDE.md)', has(root, 'CLAUDE.md') ? 'ok' : 'missing', has(root, 'CLAUDE.md') ? 'CLAUDE.md' : 'aucun CLAUDE.md', { how: '/init, puis /kaizen:setup ajoute la section Kaizen' }, 2);

  // --- Livraison --------------------------------------------------------------------------------------
  const envs = config.deploy.environments || {};
  const envNames = Object.keys(envs);
  const candidates = envNames.length ? [] : detectDeploy(root);
  add('deploy', 'Livraison', 'Déploiement outillé', envNames.length ? 'ok' : candidates.length ? 'warn' : 'missing',
    envNames.length ? `environnements : ${envNames.join(', ')}` : candidates.length ? `reconnu, non configuré : ${candidates.map((c) => c.id).join(', ')}` : 'aucun mécanisme de déploiement reconnu',
    { how: candidates.length ? `node kaizen.mjs deploy configure ${candidates[0].id} (après revue des commandes : deploy detect)` : 'déclarer deploy.environments (commande de déploiement par environnement)', skill: '/kaizen:setup' }, 1);
  if (envNames.length) {
    const noRb = envNames.filter((e) => !envs[e].rollback);
    add('rollback', 'Livraison', 'Retour arrière déclaré', noRb.length ? 'missing' : 'ok', noRb.length ? `sans retour arrière : ${noRb.join(', ')}` : 'chaque environnement a son retour arrière', { how: 'deploy.environments.<env>.rollback (deploy detect propose la commande native de la plateforme)' }, 1);
    const prod = envs.production;
    if (prod) add('protected', 'Livraison', 'Production protégée', prod.protected === false ? 'warn' : 'ok', prod.protected === false ? 'production déclarée non protégée' : 'approbation humaine exigée', { how: 'retirer "protected": false de production' }, 2);
  }

  // --- Exploitation -----------------------------------------------------------------------------------
  const signals = config.monitor.signals || {};
  const names = Object.keys(signals);
  const httpSignals = names.filter((n) => signals[n].type === 'http');
  // Une vraie déclaration de route, pas une chaîne qui traîne : app.get('/health'…), @app.route("/up"),
  // HandleFunc("/healthz"…), @GetMapping("/health"), get "/up" (Rails)…
  const ROUTE = /(\.(get|route|all|handle|HandleFunc|Get|GET)\s*\(|@(app|router|bp|api)\.(get|route)\s*\(|@(Get|Request)Mapping\s*\(\s*(value\s*=\s*)?|\bpath\s*\(|^\s*get\s+)\s*['"`]\/(health|healthz|healthcheck|up|ready|readyz|livez)['"`]/m;
  const healthRoute = files.filter((f) => !TEST_FILE.test(f)).slice(0, 1500).find((f) => ROUTE.test(read(root, f) || ''));
  add('monitoring', 'Exploitation', 'Signaux de production surveillés', names.length ? 'ok' : 'missing', names.length ? `signaux : ${names.join(', ')}` : 'aucun signal (monitor.signals)', { how: 'déclarer au moins un health-check HTTP, puis taux d’erreur et latence (commande qui affiche un nombre)' }, envNames.length ? 1 : 2);
  add('health', 'Exploitation', 'Endpoint de santé', httpSignals.length ? 'ok' : healthRoute ? 'warn' : 'missing', httpSignals.length ? `health-check : ${httpSignals.join(', ')}` : healthRoute ? `route de santé trouvée dans ${healthRoute}, non surveillée` : 'aucune route de santé trouvée', { how: 'exposer /health (dépendances critiques comprises) et le déclarer dans monitor.signals' }, 2);

  // --- Boucle Kaizen ----------------------------------------------------------------------------------
  const initialized = has(root, '.kaizen/config.json');
  add('kaizen', 'Boucle Kaizen', 'Kaizen initialisé', initialized ? 'ok' : 'missing', initialized ? `profil ${config.profile}` : 'pas de .kaizen/config.json', { how: '/kaizen:setup', skill: '/kaizen:setup' }, 1);
  const c = loadConstitution(root);
  const valid = c ? validateConstitution(c).errors.length === 0 : false;
  add('constitution', 'Boucle Kaizen', 'Constitution d’ingénierie', c ? (valid ? 'ok' : 'warn') : 'missing', c ? `v${c.meta.version} — ${c.articles.length} article(s)${valid ? '' : ', invalide'}` : 'pas de CONSTITUTION.md', { how: '/kaizen:constitution', skill: '/kaizen:constitution' }, 2);
  const findable = /learnings/.test(read(root, 'CLAUDE.md') || '');
  add('learnings', 'Boucle Kaizen', 'Leçons trouvables par les agents', findable ? 'ok' : 'warn', findable ? 'CLAUDE.md cite docs/learnings/' : 'CLAUDE.md ne mentionne pas les leçons', { how: '/kaizen:setup (étape trouvabilité)', skill: '/kaizen:setup' }, 3);

  const weight = { missing: 0, warn: 0.5, unknown: null, ok: 1 };
  const areas = {};
  for (const ch of checks) {
    const a = (areas[ch.area] ||= { ok: 0, total: 0 });
    if (weight[ch.status] === null) continue;
    a.total++;
    a.ok += weight[ch.status];
  }
  for (const a of Object.values(areas)) a.score = a.total ? Math.round((a.ok / a.total) * 100) : null;
  const todo = checks.filter((ch) => ch.status === 'missing' || ch.status === 'warn').sort((x, y) => x.priority - y.priority);
  return { stacks, default_branch: branch, areas, checks, next: todo.map((ch) => ({ id: ch.id, priority: ch.priority, title: ch.title, how: ch.fix.how, scaffold: ch.fix.scaffold || null, skill: ch.fix.skill || null })) };
}

// --- Gabarits : corrections simples, jamais d'écrasement -------------------------------------------------

function ciWorkflow(root) {
  const { stacks, commands } = verifyCommands(root);
  const steps = ['      - uses: actions/checkout@v4'];
  const s = stacks.join(' ');
  if (/node/.test(s)) {
    const pm = /pnpm/.test(s) ? 'pnpm' : /yarn/.test(s) ? 'yarn' : /bun/.test(s) ? 'bun' : 'npm';
    // pnpm/action-setup lit packageManager dans package.json ; sinon il lui faut une version explicite.
    if (pm === 'pnpm') steps.push(/"packageManager"\s*:\s*"pnpm@/.test(read(root, 'package.json') || '') ? '      - uses: pnpm/action-setup@v4' : '      - uses: pnpm/action-setup@v4\n        with:\n          version: 9');
    // npm ci et le cache de setup-node exigent un lockfile : sans lui, la CI échouerait dès le premier run.
    const npmLock = pm !== 'npm' || has(root, 'package-lock.json') || has(root, 'npm-shrinkwrap.json');
    if (pm === 'bun') steps.push('      - uses: oven-sh/setup-bun@v2');
    else steps.push(`      - uses: actions/setup-node@v4\n        with:\n          node-version: 22${npmLock ? `\n          cache: ${pm}` : ''}`);
    steps.push(`      - run: ${{ npm: npmLock ? 'npm ci' : 'npm install', pnpm: 'pnpm install --frozen-lockfile', yarn: 'yarn install --immutable', bun: 'bun install --frozen-lockfile' }[pm]}`);
  } else if (/python/.test(s)) {
    const py = Object.values(commands).join(' ');
    if (/\buv run\b/.test(py)) steps.push('      - uses: astral-sh/setup-uv@v6', '      - run: uv sync');
    else if (/\bpoetry run\b/.test(py)) steps.push("      - uses: actions/setup-python@v5\n        with:\n          python-version: '3.12'", '      - run: pip install poetry && poetry install');
    else steps.push("      - uses: actions/setup-python@v5\n        with:\n          python-version: '3.12'", `      - run: pip install ${has(root, 'requirements.txt') ? '-r requirements.txt' : '-e .'}${has(root, 'requirements-dev.txt') ? ' -r requirements-dev.txt' : ''}`);
  } else if (/\bgo\b/.test(s)) steps.push("      - uses: actions/setup-go@v5\n        with:\n          go-version-file: go.mod");
  else if (/rust/.test(s)) steps.push('      - uses: dtolnay/rust-toolchain@stable\n        with:\n          components: clippy');
  else if (/ruby/.test(s)) steps.push('      - uses: ruby/setup-ruby@v1\n        with:\n          bundler-cache: true');
  else if (/maven|gradle/.test(s)) steps.push("      - uses: actions/setup-java@v4\n        with:\n          distribution: temurin\n          java-version: '21'");
  else if (/php/.test(s)) steps.push('      - uses: shivammathur/setup-php@v2', '      - run: composer install --no-interaction');
  for (const k of ['lint', 'typecheck', 'test']) if (commands[k]) steps.push(`      - name: ${k}\n        run: ${commands[k]}`);
  return `# CI générée par Kaizen (audit fix ci) depuis les commandes de vérification détectées : à relire.
name: CI

on:
  pull_request:
  push:
    branches: [${defaultBranch(root) || 'main'}]

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
${steps.join('\n')}
`;
}

const PR_TEMPLATE = `## Pourquoi
<!-- le problème ou le besoin ; lien vers le ticket et le plan -->

## Ce qui change
<!-- l'essentiel, pour un relecteur pressé ; ce qui n'est volontairement pas fait -->

## Comment vérifier
<!-- commandes lancées, tests ajoutés, captures pour une interface -->

## Déploiement et retour arrière
<!-- exposition (flag ?), migrations, comment revenir en arrière, signal à surveiller et son seuil -->

## Points ouverts
<!-- décisions laissées au relecteur, réserves ; supprimer si vide -->
`;

function dependabot(root) {
  const { stacks } = verifyCommands(root);
  const s = stacks.join(' ');
  const eco = [];
  if (/node/.test(s)) eco.push('npm');
  if (/python/.test(s)) eco.push(has(root, 'uv.lock') ? 'uv' : 'pip');
  if (/\bgo\b/.test(s)) eco.push('gomod');
  if (/rust/.test(s)) eco.push('cargo');
  if (/ruby/.test(s)) eco.push('bundler');
  if (/maven/.test(s)) eco.push('maven');
  if (/gradle/.test(s)) eco.push('gradle');
  if (/php/.test(s)) eco.push('composer');
  if (ls(root, '.github/workflows').length) eco.push('github-actions');
  if (has(root, 'Dockerfile')) eco.push('docker');
  return `# Mises à jour de dépendances (générées par Kaizen, audit fix dependabot) : petites PR régulières.
version: 2
updates:
${eco.map((e) => `  - package-ecosystem: ${e}\n    directory: /\n    schedule:\n      interval: weekly\n    open-pull-requests-limit: 5`).join('\n')}
`;
}

export function scaffold(root, id, { owner } = {}) {
  const write = (path, content) => {
    if (has(root, path)) throw new Error(`${path} existe déjà : rien n'est écrasé`);
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
    return { written: path };
  };
  switch (id) {
    case 'ci':
      if (!verifyCommands(root).commands.test) throw new Error('aucune commande de test détectée ni configurée : impossible de générer une CI utile');
      return write('.github/workflows/ci.yml', ciWorkflow(root));
    case 'pr_template':
      return write('.github/pull_request_template.md', PR_TEMPLATE);
    case 'dependabot':
      return write('.github/dependabot.yml', dependabot(root));
    case 'codeowners': {
      if (!owner || !/^@[\w./-]+$/.test(owner)) throw new Error('--owner @utilisateur ou @org/equipe requis (qui relit par défaut)');
      const rules = ['/CONSTITUTION.md', '/kaizen-packs/', '/.kaizen/config.json'].map((p) => `${p} ${owner}`).join('\n');
      return write('.github/CODEOWNERS', `# Propriétaires par défaut (généré par Kaizen, audit fix codeowners) : affinez par dossier.\n* ${owner}\n\n# Règles d'ingénierie : leur changement est relu par les approbateurs.\n${rules}\n`);
    }
    case 'gitignore_env': {
      const gi = read(root, '.gitignore') || '';
      if (/(^|\n)\s*\/?\.env(\*|\b)/.test(gi)) throw new Error('.env est déjà ignoré');
      appendFileSync(join(root, '.gitignore'), `${gi && !gi.endsWith('\n') ? '\n' : ''}# Secrets locaux (ajouté par Kaizen, audit fix gitignore_env)\n.env\n.env.*\n!.env.example\n`);
      return { written: '.gitignore' };
    }
    default:
      throw new Error(`pas de gabarit pour "${id}" (gabarits : ci, pr_template, dependabot, codeowners, gitignore_env)`);
  }
}
