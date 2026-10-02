// Kaizen — bibliothèque partagée (Node ≥ 18, zéro dépendance).
// Racine du repo, configuration, frontmatter YAML (sous-ensemble), détection de stack.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

// ---------------------------------------------------------------------------
// Repo & configuration
// ---------------------------------------------------------------------------

// Commande gh à lancer : KAIZEN_GH peut pointer vers un script Node (faux gh des tests) ; on le
// passe alors à node, car Windows n'exécute pas un .mjs directement.
export function ghCommand(args) {
  const gh = process.env.KAIZEN_GH || 'gh';
  return /\.(mjs|cjs|js)$/i.test(gh) ? [process.execPath, [gh, ...args]] : [gh, args];
}

export function repoRoot(cwd = process.cwd()) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

export const DEFAULT_CONFIG = {
  docs_root: 'docs',
  language: 'auto',
  tracker: 'auto',
  verify: {},
  gate: { enabled: true, max_blocks: 3, timeout_seconds: 600, max_age_hours: 24 },
  pr: { max_lines: 400, ignore: ['*.lock', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', '*.min.*', '*.snap', '*.generated.*', 'dist/**', 'vendor/**'] },
  packs: [],
};

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new Error(`${file} : JSON invalide (${err.message})`);
  }
}

// config.local.json (non versionné) l'emporte sur config.json, clé par clé.
// docs_root n'est lu que dans config.json : l'emplacement des livrables est une décision d'équipe.
export function loadConfig(root) {
  const base = root ? readJson(join(root, '.kaizen', 'config.json')) || {} : {};
  const local = root ? readJson(join(root, '.kaizen', 'config.local.json')) || {} : {};
  const { docs_root: _ignored, ...localRest } = local;
  const merged = { ...DEFAULT_CONFIG, ...base, ...localRest };
  merged.gate = { ...DEFAULT_CONFIG.gate, ...(base.gate || {}), ...(local.gate || {}) };
  merged.verify = { ...(base.verify || {}), ...(local.verify || {}) };
  merged.pr = { ...DEFAULT_CONFIG.pr, ...(base.pr || {}), ...(local.pr || {}) };
  if (base.docs_root) merged.docs_root = base.docs_root;
  return merged;
}

export function docsRoot(root, config = loadConfig(root)) {
  const value = config.docs_root || 'docs';
  if (isAbsolute(value)) throw new Error(`docs_root doit être relatif au repo : "${value}"`);
  const abs = resolve(root, value);
  const rel = relative(root, abs);
  if (!rel || rel.startsWith('..') || rel.split(sep)[0] === '.git') {
    throw new Error(`docs_root invalide : "${value}" (doit rester dans le repo, hors racine et hors .git)`);
  }
  return abs;
}

export function expandHome(p) {
  return p.startsWith('~/') || p === '~' ? join(homedir(), p.slice(1)) : p;
}

// ---------------------------------------------------------------------------
// Frontmatter YAML — sous-ensemble suffisant pour les leçons et les packs :
// scalaires, chaînes entre guillemets, listes en ligne [a, b] et listes en tirets.
// ---------------------------------------------------------------------------

function unquote(v) {
  const s = v.trim();
  if (s.length >= 2 && ((s[0] === '"' && s.at(-1) === '"') || (s[0] === "'" && s.at(-1) === "'"))) {
    return s.slice(1, -1).replace(/\\"/g, '"');
  }
  return s;
}

function splitInline(list) {
  const out = [];
  let cur = '';
  let quote = null;
  for (const ch of list) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map(unquote).filter((x) => x !== '');
}

function scalar(v) {
  let s = v.trim();
  // Commentaire YAML en fin de ligne (« # » précédé d'un blanc), hors chaînes entre guillemets.
  if (!/^["']/.test(s)) s = s.replace(/\s+#.*$/, '');
  if (s === '') return '';
  if (s.startsWith('[') && s.endsWith(']')) return splitInline(s.slice(1, -1));
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  return unquote(s);
}

export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { data: null, body: text, error: 'frontmatter absent' };
  const data = {};
  let key = null;
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const item = /^\s+-\s?(.*)$/.exec(line);
    if (item && key) {
      if (!Array.isArray(data[key])) data[key] = [];
      data[key].push(unquote(item[1]));
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*)\s*:(.*)$/.exec(line);
    if (kv) {
      key = kv[1];
      const raw = kv[2];
      if (raw.trim() === '|' || raw.trim() === '>') {
        const block = [];
        while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]) || !lines[i + 1].trim())) {
          block.push(lines[++i].trim());
        }
        data[key] = block.join(raw.trim() === '|' ? '\n' : ' ').trim();
      } else {
        data[key] = raw.trim() === '' ? [] : scalar(raw);
      }
      continue;
    }
    return { data, body: text.slice(m[0].length), error: `ligne illisible : "${line.trim()}"` };
  }
  return { data, body: text.slice(m[0].length), error: null };
}

// ---------------------------------------------------------------------------
// Fichiers
// ---------------------------------------------------------------------------

export function walkMarkdown(dir, { skipDirs = ['_archived', 'node_modules', '.git'] } = {}) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skipDirs.includes(entry.name)) out.push(...walkMarkdown(full, { skipDirs }));
    } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name.toLowerCase() !== 'readme.md') {
      out.push(full);
    }
  }
  return out.sort();
}

export function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Détection de stack → commandes de vérification (test, lint, typecheck)
// ---------------------------------------------------------------------------

function onPath(bin) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' });
  return r.status === 0;
}

function nodeRunner(root) {
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(root, 'bun.lockb')) || existsSync(join(root, 'bun.lock'))) return 'bun';
  return 'npm';
}

function runScript(pm, name) {
  return pm === 'npm' ? `npm run -s ${name}` : `${pm} run ${name}`;
}

export function detectStack(root) {
  const stacks = [];
  const verify = {};
  const set = (k, v) => {
    if (v && !verify[k]) verify[k] = v;
  };

  const pkgFile = join(root, 'package.json');
  if (existsSync(pkgFile)) {
    let scripts = {};
    try {
      scripts = JSON.parse(readFileSync(pkgFile, 'utf8')).scripts || {};
    } catch {}
    const pm = nodeRunner(root);
    stacks.push(`node (${pm})`);
    const placeholder = /no test specified/.test(scripts.test || '');
    if (scripts.test && !placeholder) set('test', pm === 'npm' ? 'npm test --silent' : `${pm} test`);
    for (const n of ['lint', 'eslint']) if (scripts[n]) set('lint', runScript(pm, n));
    for (const n of ['typecheck', 'type-check', 'tsc', 'check-types']) if (scripts[n]) set('typecheck', runScript(pm, n));
    if (!verify.typecheck && existsSync(join(root, 'tsconfig.json'))) set('typecheck', 'npx --no-install tsc --noEmit');
    set('audit', pm === 'npm' ? 'npm audit --audit-level=high' : pm === 'pnpm' ? 'pnpm audit --audit-level high' : pm === 'yarn' ? 'yarn npm audit --severity high' : null);
  }

  if (existsSync(join(root, 'pyproject.toml')) || existsSync(join(root, 'setup.py')) || existsSync(join(root, 'requirements.txt'))) {
    stacks.push('python');
    const py = existsSync(join(root, 'uv.lock')) ? 'uv run ' : existsSync(join(root, 'poetry.lock')) ? 'poetry run ' : '';
    if (existsSync(join(root, 'tests')) || existsSync(join(root, 'pytest.ini')) || existsSync(join(root, 'conftest.py'))) set('test', `${py}pytest -q`);
    let pyproject = '';
    try {
      pyproject = readFileSync(join(root, 'pyproject.toml'), 'utf8');
    } catch {}
    if (/\[tool\.ruff/.test(pyproject) || existsSync(join(root, 'ruff.toml'))) set('lint', `${py}ruff check .`);
    if (/\[tool\.mypy/.test(pyproject) || existsSync(join(root, 'mypy.ini'))) set('typecheck', `${py}mypy .`);
    if (onPath('pip-audit')) set('audit', 'pip-audit');
  }

  if (existsSync(join(root, 'go.mod'))) {
    stacks.push('go');
    set('test', 'go test ./...');
    set('lint', 'go vet ./...');
    if (onPath('govulncheck')) set('audit', 'govulncheck ./...');
  }

  if (existsSync(join(root, 'Cargo.toml'))) {
    stacks.push('rust');
    set('test', 'cargo test --quiet');
    set('lint', 'cargo clippy --quiet -- -D warnings');
    if (onPath('cargo-audit')) set('audit', 'cargo audit');
  }

  if (existsSync(join(root, 'pom.xml'))) {
    stacks.push('java (maven)');
    set('test', `${existsSync(join(root, 'mvnw')) ? './mvnw' : 'mvn'} -q test`);
  }

  if (existsSync(join(root, 'build.gradle')) || existsSync(join(root, 'build.gradle.kts'))) {
    stacks.push('jvm (gradle)');
    set('test', `${existsSync(join(root, 'gradlew')) ? './gradlew' : 'gradle'} test -q`);
  }

  if (existsSync(join(root, 'Gemfile'))) {
    stacks.push('ruby');
    if (existsSync(join(root, 'spec'))) set('test', 'bundle exec rspec');
    else if (existsSync(join(root, 'test'))) set('test', 'bundle exec rake test');
    if (existsSync(join(root, '.rubocop.yml'))) set('lint', 'bundle exec rubocop');
    if (onPath('bundle-audit')) set('audit', 'bundle-audit check --update');
  }

  if (existsSync(join(root, 'composer.json'))) {
    stacks.push('php');
    if (existsSync(join(root, 'vendor', 'bin', 'phpunit'))) set('test', 'vendor/bin/phpunit');
  }

  if (!verify.test && existsSync(join(root, 'Makefile'))) {
    try {
      if (/^test\s*:/m.test(readFileSync(join(root, 'Makefile'), 'utf8'))) set('test', 'make test');
    } catch {}
  }

  return { stacks, verify };
}

// Commandes effectives : la config du repo l'emporte, la détection complète.
export function verifyCommands(root, config = loadConfig(root)) {
  const detected = detectStack(root);
  const cmds = { ...detected.verify, ...config.verify };
  for (const k of Object.keys(cmds)) if (!cmds[k]) delete cmds[k];
  return { stacks: detected.stacks, commands: cmds, configured: Object.keys(config.verify || {}) };
}

// ---------------------------------------------------------------------------
// Exécution des vérifications (partagée par le CLI et le hook Stop)
// ---------------------------------------------------------------------------

function tail(text, n = 40) {
  const lines = text.replace(/\s+$/, '').split(/\r?\n/);
  return lines.slice(-n).join('\n');
}

export function runVerify(root, { only, timeoutSeconds } = {}) {
  const config = loadConfig(root);
  const { commands } = verifyCommands(root, config);
  // L'audit des dépendances (réseau, lent) ne tourne que sur demande explicite (--only audit).
  const wanted = only ? only.split(',').map((s) => s.trim()) : Object.keys(commands).filter((k) => k !== 'audit');
  const timeout = (timeoutSeconds || config.gate.timeout_seconds || 600) * 1000;
  const results = [];
  for (const name of wanted) {
    const cmd = commands[name];
    if (!cmd) continue;
    const started = Date.now();
    const r = spawnSync(cmd, { cwd: root, shell: true, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024 });
    const timedOut = r.error && r.error.code === 'ETIMEDOUT';
    results.push({
      name,
      command: cmd,
      ok: r.status === 0 && !timedOut,
      exit: timedOut ? 'timeout' : r.status,
      seconds: Math.round((Date.now() - started) / 100) / 10,
      output: tail(`${r.stdout || ''}${r.stderr || ''}`),
    });
  }
  return results;
}


// ---------------------------------------------------------------------------
// Git : branche par défaut, base de comparaison, taille d'un diff
// ---------------------------------------------------------------------------

export function git(root, args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).trim();
  } catch (err) {
    if (allowFail) return null;
    throw new Error(`git ${args.join(' ')} : ${String(err.stderr || err.message).trim().split('\n')[0]}`);
  }
}

export function defaultBranch(root) {
  const head = git(root, ['rev-parse', '--abbrev-ref', 'origin/HEAD'], { allowFail: true });
  if (head && head.startsWith('origin/')) return head.slice('origin/'.length);
  for (const b of ['main', 'master', 'trunk', 'develop']) {
    if (git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${b}`], { allowFail: true })) return b;
    if (git(root, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${b}`], { allowFail: true })) return b;
  }
  return null;
}

export function diffBase(root, explicit) {
  if (explicit) return explicit;
  const def = defaultBranch(root);
  if (!def) return null;
  for (const ref of [`origin/${def}`, def]) {
    const mb = git(root, ['merge-base', 'HEAD', ref], { allowFail: true });
    if (mb) return mb;
  }
  return null;
}

function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*';
      i++;
      if (glob[i + 1] === '/') i++;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`(^|/)${re}$`);
}

export function diffSize(root, { base, ignore = [] } = {}) {
  const from = diffBase(root, base);
  if (!from) throw new Error('base introuvable : passe --base <ref>');
  const out = git(root, ['diff', '--numstat', from]);
  const res = ignore.map(globToRegex);
  const files = [];
  let added = 0;
  let removed = 0;
  let ignored = 0;
  for (const line of out ? out.split('\n') : []) {
    const [a, d, ...rest] = line.split('\t');
    const file = rest.join('\t');
    if (a === '-' || res.some((r) => r.test(file))) {
      ignored++;
      continue;
    }
    added += Number(a);
    removed += Number(d);
    files.push({ file, added: Number(a), removed: Number(d) });
  }
  return { base: from, files: files.length, added, removed, total: added + removed, ignored, largest: files.sort((x, y) => y.added + y.removed - (x.added + x.removed)).slice(0, 5) };
}
