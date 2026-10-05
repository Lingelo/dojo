// Kaizen — project maturity diagnosis: what a solid SDLC assumes, what is in place, what is missing,
// and how to fix it, in priority order.
//
// Five areas, from the base to the loop: Foundations (CI, tests, secrets), Flow (review, ownership,
// dependencies), Delivery (deployment, rollback), Operations (signals, health), Kaizen loop.
// Each check returns { id, area, title, status: ok|warn|missing|unknown, evidence, fix, priority }.
// Read-only. Simple, unambiguous fixes have a **scaffold** (`audit fix <id>`), which never overwrites an
// existing file; the others point to the skill that handles them.

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
  if (!gh || !branch) return { status: 'unknown', evidence: 'repository not hosted on GitHub, or default branch unknown' };
  try {
    const [cmd, argv] = ghCommand(['api', `repos/${gh.owner}/${gh.repo}/branches/${branch}/protection`, '--jq', '{reviews: .required_pull_request_reviews.required_approving_review_count, checks: (.required_status_checks.contexts | length)}']);
    const r = spawnSync(cmd, argv, { encoding: 'utf8', timeout: 20000 });
    if (r.status === 0) {
      const p = JSON.parse(r.stdout || '{}');
      const ok = (p.reviews || 0) >= 1 && (p.checks || 0) >= 1;
      return { status: ok ? 'ok' : 'warn', evidence: `${p.reviews || 0} required approval(s), ${p.checks || 0} required check(s)` };
    }
    if (/Branch not protected|404/.test(`${r.stderr}${r.stdout}`)) return { status: 'missing', evidence: `${branch} is not protected` };
    return { status: 'unknown', evidence: 'gh could not read the protection (admin rights required?)' };
  } catch {
    return { status: 'unknown', evidence: 'gh unavailable' };
  }
}

export function audit(root, { github = true } = {}) {
  const config = loadConfig(root);
  const { stacks, commands } = verifyCommands(root, config);
  const branch = defaultBranch(root);
  const checks = [];
  const add = (id, area, title, status, evidence, fix, priority) => checks.push({ id, area, title, status, evidence, fix, priority });

  // --- Foundations -----------------------------------------------------------------------------------
  const remote = git(root, ['remote'], { allowFail: true });
  add('remote', 'Foundations', 'Remote repository', remote ? 'ok' : 'missing', remote ? `remote: ${remote.split('\n').join(', ')}` : 'no remote', { how: 'add a remote (git remote add origin …): without it, no PR, no CI, no shared learnings' }, 1);

  const workflows = ls(root, '.github/workflows').filter((f) => /\.ya?ml$/.test(f));
  const otherCi = CI_FILES.filter((f) => has(root, f));
  const ciText = [...workflows.map((f) => read(root, `.github/workflows/${f}`)), ...otherCi.map((f) => read(root, f))].join('\n');
  const ciRunsTests = /\btest\b|pytest|rspec|go test|cargo test|phpunit|mvn|gradle/.test(ciText);
  const ciFound = workflows.length || otherCi.length;
  add('ci', 'Foundations', 'Continuous integration running the tests', !ciFound ? 'missing' : ciRunsTests ? 'ok' : 'warn',
    !ciFound ? 'no CI configuration' : `${[...workflows.map((f) => `.github/workflows/${f}`), ...otherCi].join(', ')}${ciRunsTests ? '' : ' — no recognized test step'}`,
    { how: 'a CI that runs tests, lint and type checks on every PR', scaffold: commands.test ? 'ci' : null }, 1);

  const files = sourceFiles(root);
  const testFiles = files.filter((f) => TEST_FILE.test(f));
  add('tests', 'Foundations', 'Automated tests', commands.test && testFiles.length ? 'ok' : commands.test || testFiles.length ? 'warn' : 'missing',
    `${commands.test ? `command: ${commands.test}` : 'no test command'} · ${testFiles.length} test file(s) out of ${files.length} source(s)`,
    { how: commands.test ? 'write tests (the quality gate and the review require them)' : 'declare the test command (.kaizen/config.json → verify.test) and write the first tests' }, 1);

  add('lint', 'Foundations', 'Lint', commands.lint ? 'ok' : 'warn', commands.lint || 'no linter detected', { how: 'add a linter for the stack and declare it in verify.lint' }, 3);
  const typed = has(root, 'tsconfig.json') || /mypy|pyright/.test(read(root, 'pyproject.toml') || '');
  if (typed || commands.typecheck) add('typecheck', 'Foundations', 'Type checking', commands.typecheck ? 'ok' : 'warn', commands.typecheck || 'typed project without a check command', { how: 'declare verify.typecheck (e.g. tsc --noEmit)' }, 2);

  const gi = read(root, '.gitignore') || '';
  const envIgnored = /(^|\n)\s*\/?\.env(\*|\b)/.test(gi);
  add('gitignore_env', 'Foundations', 'Secret files ignored by git', envIgnored ? 'ok' : 'missing', envIgnored ? '.env ignored' : '.env missing from .gitignore', { how: 'ignore .env and its variants', scaffold: 'gitignore_env' }, 1);

  const settings = `${read(root, '.claude/settings.json') || ''}${read(root, '.claude/settings.local.json') || ''}`;
  const scanning = /security@angelo-plugins/.test(settings) ? 'security plugin' : firstOf(root, ['.gitleaks.toml', '.secrets.baseline', '.trufflehog.yml']) || (/gitleaks|detect-secrets|trufflehog/.test(`${read(root, '.pre-commit-config.yaml') || ''}${ciText}`) ? 'scanner in pre-commit or CI' : null);
  add('secret_scanning', 'Foundations', 'Secret scanning', scanning ? 'ok' : 'missing', scanning || 'no secret scanner', { how: 'add gitleaks (or detect-secrets/trufflehog) to pre-commit or CI' }, 2);

  // --- Flow ---------------------------------------------------------------------------------------------
  const prot = github ? branchProtection(root, branch) : { status: 'unknown', evidence: 'not checked (--no-github)' };
  add('branch_protection', 'Flow', `${branch ? `Branch ${branch}` : 'Default branch'} protected (review + checks required)`, prot.status, prot.evidence, { how: 'GitHub → Settings → Branches: require a PR, an approval and green CI' }, 1);
  const owners = firstOf(root, ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS']);
  add('codeowners', 'Flow', 'Code owners (CODEOWNERS)', owners ? 'ok' : 'missing', owners || 'no CODEOWNERS', { how: 'state who reviews what, including CONSTITUTION.md and kaizen-packs/', scaffold: 'codeowners' }, 2);
  const tpl = firstOf(root, ['.github/pull_request_template.md', '.github/PULL_REQUEST_TEMPLATE.md', 'PULL_REQUEST_TEMPLATE.md', 'docs/pull_request_template.md']) || (ls(root, '.github/PULL_REQUEST_TEMPLATE').length ? '.github/PULL_REQUEST_TEMPLATE/' : null);
  add('pr_template', 'Flow', 'PR template', tpl ? 'ok' : 'missing', tpl || 'no PR template', { how: 'a template asking for why, evidence, rollback', scaffold: 'pr_template' }, 3);
  const deps = firstOf(root, ['.github/dependabot.yml', '.github/dependabot.yaml', 'renovate.json', '.github/renovate.json', 'renovate.json5', '.renovaterc']);
  add('dependency_updates', 'Flow', 'Automated dependency updates', deps ? 'ok' : 'missing', deps || 'neither Dependabot nor Renovate', { how: 'small regular update PRs rather than one big yearly jump', scaffold: stacks.length ? 'dependabot' : null }, 3);
  add('claude_md', 'Flow', 'Project instructions for agents (CLAUDE.md)', has(root, 'CLAUDE.md') ? 'ok' : 'missing', has(root, 'CLAUDE.md') ? 'CLAUDE.md' : 'no CLAUDE.md', { how: '/init, then /kaizen:setup adds the Kaizen section' }, 2);

  // --- Delivery ---------------------------------------------------------------------------------------
  const envs = config.deploy.environments || {};
  const envNames = Object.keys(envs);
  const candidates = envNames.length ? [] : detectDeploy(root);
  add('deploy', 'Delivery', 'Tooled deployment', envNames.length ? 'ok' : candidates.length ? 'warn' : 'missing',
    envNames.length ? `environments: ${envNames.join(', ')}` : candidates.length ? `recognized, not configured: ${candidates.map((c) => c.id).join(', ')}` : 'no recognized deployment mechanism',
    { how: candidates.length ? `node kaizen.mjs deploy configure ${candidates[0].id} (after reviewing the commands: deploy detect)` : 'declare deploy.environments (a deploy command per environment)', skill: '/kaizen:setup' }, 1);
  if (envNames.length) {
    const noRb = envNames.filter((e) => !envs[e].rollback);
    add('rollback', 'Delivery', 'Declared rollback', noRb.length ? 'missing' : 'ok', noRb.length ? `no rollback: ${noRb.join(', ')}` : 'every environment has its rollback', { how: 'deploy.environments.<env>.rollback (deploy detect proposes the platform\'s native command)' }, 1);
    const prod = envs.production;
    if (prod) add('protected', 'Delivery', 'Protected production', prod.protected === false ? 'warn' : 'ok', prod.protected === false ? 'production declared unprotected' : 'human approval required', { how: 'remove "protected": false from production' }, 2);
  }

  // --- Operations -------------------------------------------------------------------------------------
  const signals = config.monitor.signals || {};
  const names = Object.keys(signals);
  const httpSignals = names.filter((n) => signals[n].type === 'http');
  // A real route declaration, not a stray string: app.get('/health'…), @app.route("/up"),
  // HandleFunc("/healthz"…), @GetMapping("/health"), get "/up" (Rails)…
  const ROUTE = /(\.(get|route|all|handle|HandleFunc|Get|GET)\s*\(|@(app|router|bp|api)\.(get|route)\s*\(|@(Get|Request)Mapping\s*\(\s*(value\s*=\s*)?|\bpath\s*\(|^\s*get\s+)\s*['"`]\/(health|healthz|healthcheck|up|ready|readyz|livez)['"`]/m;
  const healthRoute = files.filter((f) => !TEST_FILE.test(f)).slice(0, 1500).find((f) => ROUTE.test(read(root, f) || ''));
  add('monitoring', 'Operations', 'Watched production signals', names.length ? 'ok' : 'missing', names.length ? `signals: ${names.join(', ')}` : 'no signal (monitor.signals)', { how: 'declare at least one HTTP health-check, then error rate and latency (a command that prints a number)' }, envNames.length ? 1 : 2);
  if (envNames.length && names.length) {
    const wf = ls(root, '.github/workflows').map((f) => read(root, `.github/workflows/${f}`) || '').join('\n');
    const continuous = /monitor\s+(patrol|alert)\b/.test(wf);
    add('continuous_monitoring', 'Operations', 'Continuous incident detection', continuous ? 'ok' : 'warn',
      continuous ? 'monitor patrol/alert workflow present' : 'signals only watched during the post-deployment window (or by a routine outside the repo)',
      { how: 'scheduled check (patrol) as a safety net, the team\'s alerts (alert) as the main path', scaffold: 'monitor_patrol' }, 3);
  }
  add('health', 'Operations', 'Health endpoint', httpSignals.length ? 'ok' : healthRoute ? 'warn' : 'missing', httpSignals.length ? `health-check: ${httpSignals.join(', ')}` : healthRoute ? `health route found in ${healthRoute}, not watched` : 'no health route found', { how: 'expose /health (critical dependencies included) and declare it in monitor.signals' }, 2);

  // --- Kaizen loop -----------------------------------------------------------------------------------
  const initialized = has(root, '.kaizen/config.json');
  add('kaizen', 'Kaizen loop', 'Kaizen initialized', initialized ? 'ok' : 'missing', initialized ? `profile ${config.profile}` : 'no .kaizen/config.json', { how: '/kaizen:setup', skill: '/kaizen:setup' }, 1);
  const c = loadConstitution(root);
  const valid = c ? validateConstitution(c).errors.length === 0 : false;
  add('constitution', 'Kaizen loop', 'Engineering constitution', c ? (valid ? 'ok' : 'warn') : 'missing', c ? `v${c.meta.version} — ${c.articles.length} article(s)${valid ? '' : ', invalid'}` : 'no CONSTITUTION.md', { how: '/kaizen:constitution', skill: '/kaizen:constitution' }, 2);
  const findable = /learnings/.test(read(root, 'CLAUDE.md') || '');
  add('learnings', 'Kaizen loop', 'Learnings findable by agents', findable ? 'ok' : 'warn', findable ? 'CLAUDE.md cites docs/learnings/' : 'CLAUDE.md does not mention learnings', { how: '/kaizen:setup (findability step)', skill: '/kaizen:setup' }, 3);

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

// --- Scaffolds: simple fixes, never overwriting ----------------------------------------------------------

function ciWorkflow(root) {
  const { stacks, commands } = verifyCommands(root);
  const steps = ['      - uses: actions/checkout@v4'];
  const s = stacks.join(' ');
  if (/node/.test(s)) {
    const pm = /pnpm/.test(s) ? 'pnpm' : /yarn/.test(s) ? 'yarn' : /bun/.test(s) ? 'bun' : 'npm';
    // pnpm/action-setup reads packageManager from package.json; otherwise it needs an explicit version.
    if (pm === 'pnpm') steps.push(/"packageManager"\s*:\s*"pnpm@/.test(read(root, 'package.json') || '') ? '      - uses: pnpm/action-setup@v4' : '      - uses: pnpm/action-setup@v4\n        with:\n          version: 9');
    // npm ci and the setup-node cache require a lockfile: without one, CI would fail on its first run.
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
  return `# CI generated by Kaizen (audit fix ci) from the detected verification commands: review it.
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

const PR_TEMPLATE = `## Why
<!-- the problem or need; link to the ticket and the plan -->

## What changes
<!-- the essentials, for a busy reviewer; what is deliberately not done -->

## How to verify
<!-- commands run, tests added, screenshots for a UI -->

## Rollout and rollback
<!-- exposure (flag?), migrations, how to roll back, signal to watch and its threshold -->

## Open points
<!-- decisions left to the reviewer, concerns; delete if empty -->
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
  return `# Dependency updates (generated by Kaizen, audit fix dependabot): small regular PRs.
version: 2
updates:
${eco.map((e) => `  - package-ecosystem: ${e}\n    directory: /\n    schedule:\n      interval: weekly\n    open-pull-requests-limit: 5`).join('\n')}
`;
}

// Continuous detection workflows (docs/guides/monitor.md, "Continuous monitoring"). The Kaizen CLI,
// dependency-free, comes from the marketplace repository: pin `ref` to a commit (sha) rather than a
// branch. Incident tags are pushed by the CLI: it needs write access and a git identity.
const KAIZEN_SOURCE = 'Lingelo/marketplace-claude-code';

function monitorWorkflow(kind, { env, ref }) {
  const header =
    kind === 'patrol'
      ? `# Scheduled check of ${env} signals (generated by Kaizen, audit fix monitor_patrol): review it.
# A confirmed breach opens an incident (incident/${env}/… tag) and fails the job.
name: kaizen-patrol

on:
  schedule:
    - cron: '*/30 * * * *'
  workflow_dispatch:
`
      : `# Team alerts → Kaizen incidents (generated by Kaizen, audit fix monitor_alert): review it.
# The alerting tool (or a relay) calls POST /repos/<owner>/<repo>/dispatches
#   {"event_type": "alert", "client_payload": <Alertmanager, PagerDuty, Datadog or plain JSON payload>}
name: kaizen-alert

on:
  repository_dispatch:
    types: [alert]
`;
  const run =
    kind === 'patrol'
      ? `      - run: node .kaizen-cli/plugins/kaizen/scripts/kaizen.mjs monitor patrol --env ${env}`
      : `      # Payload passed through the environment, never interpolated into the script: no injection.
      - env:
          PAYLOAD: \${{ toJson(github.event.client_payload) }}
        run: printf '%s' "$PAYLOAD" | node .kaizen-cli/plugins/kaizen/scripts/kaizen.mjs monitor alert --env ${env} --file -`;
  return `${header}
permissions:
  contents: write   # push incident/… and resolve/… tags

concurrency:
  group: kaizen-incidents-${env}
  cancel-in-progress: false

jobs:
  ${kind}:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # deploy/… and incident/… tags included
      - uses: actions/checkout@v4
        with:
          repository: ${KAIZEN_SOURCE}
          ref: ${ref}   # pin a sha
          path: .kaizen-cli
      - run: |
          git config user.name "kaizen[bot]"
          git config user.email "kaizen[bot]@users.noreply.github.com"
${run}
`;
}

export function scaffold(root, id, { owner, env, ref } = {}) {
  const write = (path, content) => {
    if (has(root, path)) throw new Error(`${path} already exists: nothing is overwritten`);
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
    return { written: path };
  };
  switch (id) {
    case 'ci':
      if (!verifyCommands(root).commands.test) throw new Error('no test command detected or configured: cannot generate a useful CI');
      return write('.github/workflows/ci.yml', ciWorkflow(root));
    case 'pr_template':
      return write('.github/pull_request_template.md', PR_TEMPLATE);
    case 'dependabot':
      return write('.github/dependabot.yml', dependabot(root));
    case 'codeowners': {
      if (!owner || !/^@[\w./-]+$/.test(owner)) throw new Error('--owner @user or @org/team required (who reviews by default)');
      const rules = ['/CONSTITUTION.md', '/kaizen-packs/', '/.kaizen/config.json'].map((p) => `${p} ${owner}`).join('\n');
      return write('.github/CODEOWNERS', `# Default owners (generated by Kaizen, audit fix codeowners): refine per folder.\n* ${owner}\n\n# Engineering rules: changes to them are reviewed by the approvers.\n${rules}\n`);
    }
    case 'monitor_patrol':
    case 'monitor_alert': {
      const envs = Object.keys(loadConfig(root).deploy.environments || {});
      const target = env || (envs.includes('production') ? 'production' : envs[0]);
      if (!target) throw new Error('no environment in deploy.environments: configure deployment first (deploy detect)');
      if (!/^[\w.-]+$/.test(target)) throw new Error(`invalid environment: ${target}`);
      if (ref !== undefined && !/^[\w./-]+$/.test(ref)) throw new Error(`invalid --ref: ${ref}`);
      const kind = id === 'monitor_patrol' ? 'patrol' : 'alert';
      return write(`.github/workflows/kaizen-${kind}.yml`, monitorWorkflow(kind, { env: target, ref: ref || 'main' }));
    }
    case 'gitignore_env': {
      const gi = read(root, '.gitignore') || '';
      if (/(^|\n)\s*\/?\.env(\*|\b)/.test(gi)) throw new Error('.env is already ignored');
      appendFileSync(join(root, '.gitignore'), `${gi && !gi.endsWith('\n') ? '\n' : ''}# Local secrets (added by Kaizen, audit fix gitignore_env)\n.env\n.env.*\n!.env.example\n`);
      return { written: '.gitignore' };
    }
    default:
      throw new Error(`no scaffold for "${id}" (scaffolds: ci, pr_template, dependabot, codeowners, gitignore_env, monitor_patrol, monitor_alert)`);
  }
}
