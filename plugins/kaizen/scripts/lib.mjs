// Kaizen — shared library (Node ≥ 18, zero dependencies).
// Repo root, configuration, YAML frontmatter (subset), stack detection.

import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Repo & configuration
// ---------------------------------------------------------------------------

// gh command to run: KAIZEN_GH may point to a Node script (the tests' fake gh); it is then
// passed to node, because Windows does not execute a .mjs directly.
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

// Adoption profiles: ceremony scales, deterministic gates stay.
export const PROFILES = ['lean', 'standard', 'full'];

export const DEFAULT_CONFIG = {
  docs_root: 'docs',
  language: 'auto',
  tracker: 'auto',
  verify: {},
  profile: 'standard',
  gate: { enabled: true, max_blocks: 3, timeout_seconds: 600, budget_seconds: 840, max_age_hours: 24, targeted: {} },
  review: { require_before_push: true, max_unreviewed_lines: 80 },
  // Deployment and monitoring: the team's commands, Kaizen knows no platform.
  deploy: { environments: {}, watch_minutes: 15, auto_rollback: false, push_tags: true, timeout_seconds: 1800, flags: {} },
  monitor: { signals: {}, interval_seconds: 60, consecutive: 2 },
  // Model per agent role: profile defaults (scripts/models.mjs), adjustable per role or per agent.
  models: { roles: {}, agents: {} },
  // Secret scan before every commit Claude makes (secret-gate hook); ignore = path globs.
  secrets: { scan: true, ignore: [] },
  pr: { max_lines: 400, ignore: ['*.lock', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', '*.min.*', '*.snap', '*.generated.*', 'dist/**', 'vendor/**'] },
  packs: [],
};

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new Error(`${file}: invalid JSON (${err.message})`);
  }
}

// config.local.json (not versioned) wins over config.json, key by key.
// docs_root is only read from config.json: where deliverables live is a team decision.
export function loadConfig(root) {
  const base = root ? readJson(join(root, '.kaizen', 'config.json')) || {} : {};
  const local = root ? readJson(join(root, '.kaizen', 'config.local.json')) || {} : {};
  const { docs_root: _ignored, ...localRest } = local;
  const merged = { ...DEFAULT_CONFIG, ...base, ...localRest };
  merged.gate = { ...DEFAULT_CONFIG.gate, ...(base.gate || {}), ...(local.gate || {}) };
  merged.verify = { ...(base.verify || {}), ...(local.verify || {}) };
  merged.pr = { ...DEFAULT_CONFIG.pr, ...(base.pr || {}), ...(local.pr || {}) };
  merged.review = { ...DEFAULT_CONFIG.review, ...(base.review || {}), ...(local.review || {}) };
  merged.deploy = { ...DEFAULT_CONFIG.deploy, ...(base.deploy || {}), ...(local.deploy || {}) };
  merged.secrets = { ...DEFAULT_CONFIG.secrets, ...(base.secrets || {}), ...(local.secrets || {}) };
  merged.monitor = { ...DEFAULT_CONFIG.monitor, ...(base.monitor || {}), ...(local.monitor || {}) };
  merged.models = {
    roles: { ...(base.models?.roles || {}), ...(local.models?.roles || {}) },
    agents: { ...(base.models?.agents || {}), ...(local.models?.agents || {}) },
  };
  // A mistyped profile must not break the hooks: fall back to "standard", reported by `config`.
  if (!PROFILES.includes(merged.profile)) {
    merged.profile_warning = `unknown profile: "${merged.profile}" (expected: ${PROFILES.join(', ')}) — "standard" applied`;
    merged.profile = 'standard';
  }
  if (base.docs_root) merged.docs_root = base.docs_root;
  return merged;
}

export function docsRoot(root, config = loadConfig(root)) {
  const value = config.docs_root || 'docs';
  if (isAbsolute(value)) throw new Error(`docs_root must be relative to the repo: "${value}"`);
  const abs = resolve(root, value);
  const rel = relative(root, abs);
  if (!rel || rel.startsWith('..') || rel.split(sep)[0] === '.git') {
    throw new Error(`invalid docs_root: "${value}" (must stay inside the repo, not the root itself and not .git)`);
  }
  return abs;
}

export function expandHome(p) {
  return p.startsWith('~/') || p === '~' ? join(homedir(), p.slice(1)) : p;
}

// ---------------------------------------------------------------------------
// YAML frontmatter — a subset sufficient for learnings and packs:
// scalars, quoted strings, inline lists [a, b] and dash lists.
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
  // Trailing YAML comment ("#" preceded by whitespace), outside quoted strings.
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
  if (!m) return { data: null, body: text, error: 'missing frontmatter' };
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
    return { data, body: text.slice(m[0].length), error: `unreadable line: "${line.trim()}"` };
  }
  return { data, body: text.slice(m[0].length), error: null };
}

// ---------------------------------------------------------------------------
// Files
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
// Stack detection → verification commands (test, lint, typecheck)
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

// Effective commands: the repo config wins, detection fills the gaps.
export function verifyCommands(root, config = loadConfig(root)) {
  const detected = detectStack(root);
  const cmds = { ...detected.verify, ...config.verify };
  for (const k of Object.keys(cmds)) if (!cmds[k]) delete cmds[k];
  return { stacks: detected.stacks, commands: cmds, configured: Object.keys(config.verify || {}) };
}

// ---------------------------------------------------------------------------
// Running the checks (shared by the CLI and the Stop hook)
// ---------------------------------------------------------------------------

function tail(text, n = 40) {
  const lines = text.replace(/\s+$/, '').split(/\r?\n/);
  return lines.slice(-n).join('\n');
}

// Replaces {files} with the file list, each one quoted for the shell.
export function withFiles(command, files) {
  const quoted = files.map((f) => (process.platform === 'win32' ? `"${f.replace(/"/g, '\\"')}"` : `'${f.replace(/'/g, "'\\''")}'`)).join(' ');
  return command.replaceAll('{files}', quoted);
}

// Runs a shell command synchronously with a timeout, and kills its whole process tree when the
// timeout is exceeded (run-bounded.mjs): an interrupted check never survives in the background.
// → { status, timedOut, stdout, stderr }
const BOUNDED = fileURLToPath(new URL('./run-bounded.mjs', import.meta.url));

export function runBounded(command, { cwd, env, timeoutMs }) {
  const r = spawnSync(process.execPath, [BOUNDED, String(Math.max(1, Math.round(timeoutMs))), command], {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    // Safety net in case the launcher itself never returns.
    timeout: timeoutMs + 15000,
    killSignal: 'SIGKILL',
  });
  let meta = {};
  try {
    meta = JSON.parse(r.output?.[3] || '{}');
  } catch {}
  const timedOut = Boolean(meta.timedOut) || r.error?.code === 'ETIMEDOUT';
  return { status: timedOut ? null : (meta.code ?? r.status), timedOut, stdout: r.stdout || '', stderr: r.stderr || '' };
}

export function runVerify(root, { only, timeoutSeconds, budgetSeconds, overrides = {} } = {}) {
  const config = loadConfig(root);
  const { commands: detected } = verifyCommands(root, config);
  const commands = { ...detected, ...overrides };
  // The dependency audit (network, slow) only runs when explicitly requested (--only audit).
  const wanted = only ? only.split(',').map((s) => s.trim()) : Object.keys(commands).filter((k) => k !== 'audit');
  const perCommand = (timeoutSeconds || config.gate.timeout_seconds || 600) * 1000;
  // Global budget (Stop hook): a command only starts if time remains, and never exceeds what is
  // left — otherwise the hook would be killed by its own timeout and protect nothing.
  const deadline = budgetSeconds ? Date.now() + budgetSeconds * 1000 : Infinity;
  const results = [];
  for (const name of wanted) {
    const cmd = commands[name];
    if (!cmd) continue;
    const remaining = deadline - Date.now();
    if (remaining < 1000) {
      results.push({ name, command: cmd, ok: true, skipped: true, exit: 'budget', seconds: 0, output: '' });
      continue;
    }
    const started = Date.now();
    const r = runBounded(cmd, { cwd: root, timeoutMs: Math.min(perCommand, remaining) });
    results.push({
      name,
      command: cmd,
      ok: r.status === 0 && !r.timedOut,
      exit: r.timedOut ? 'timeout' : r.status,
      seconds: Math.round((Date.now() - started) / 100) / 10,
      output: tail(`${r.stdout}${r.stderr}`),
    });
  }
  return results;
}


// ---------------------------------------------------------------------------
// Git: default branch, comparison base, diff size
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

export function globToRegex(glob) {
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
  if (!from) throw new Error('base not found: pass --base <ref>');
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

// Git tree of the current state (committed + uncommitted, .gitignore honored), without touching the
// user's index: this is what a review actually read. Comparing this tree to HEAD at push time tells
// exactly what changed since the review.
export function worktreeTree(root) {
  const dir = mkdtempSync(join(tmpdir(), 'kaizen-index-'));
  const env = { ...process.env, GIT_INDEX_FILE: join(dir, 'index') };
  try {
    const run = (args) => execFileSync('git', args, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    // Starting from a copy of the real index reuses its stat cache: only modified files are
    // rehashed, even in a large repo. Without an index (fresh repo), start from HEAD.
    const real = git(root, ['rev-parse', '--path-format=absolute', '--git-path', 'index'], { allowFail: true });
    if (real && existsSync(real)) copyFileSync(real, env.GIT_INDEX_FILE);
    else run(['read-tree', 'HEAD']);
    run(['add', '-A']);
    return run(['write-tree']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Lines changed between two trees or commits, excluding files ignored by pr.ignore.
export function changedLines(root, from, to, ignore = []) {
  const out = git(root, ['diff', '--numstat', from, to], { allowFail: true });
  if (out === null) return null;
  const res = ignore.map(globToRegex);
  let total = 0;
  for (const line of out ? out.split('\n') : []) {
    const [a, d, ...rest] = line.split('\t');
    if (a === '-' || res.some((r) => r.test(rest.join('\t')))) continue;
    total += Number(a) + Number(d);
  }
  return total;
}

// Files touched by the branch: diff vs the base (uncommitted included) and new non-ignored files.
// Deleted files are excluded: a linter or test runner would fail on them.
export function changedFiles(root, base = diffBase(root)) {
  const listed = [
    ...(base ? (git(root, ['diff', '--name-only', base], { allowFail: true }) || '').split('\n') : []),
    ...(git(root, ['ls-files', '--others', '--exclude-standard'], { allowFail: true }) || '').split('\n'),
  ];
  return [...new Set(listed.filter(Boolean))].filter((f) => existsSync(join(root, f))).sort();
}

// Token usage of a session from its transcript (Claude Code JSONL), from a given date on. The same
// message may appear several times (streaming): deduplicated by id.
// Only the main session is counted here: subagents have their own transcripts (see subagentUsage).
const USAGE_KEYS = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'];

export function emptyUsage() {
  return { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, messages: 0 };
}

export function usageTotal(usage) {
  return usage ? USAGE_KEYS.reduce((n, k) => n + (Number(usage[k]) || 0), 0) : 0;
}

function addUsage(into, usage) {
  for (const k of USAGE_KEYS) into[k] += Number(usage[k]) || 0;
  into.messages += usage.messages ?? 1;
  return into;
}

function readUsage(text, from, seen, usage = emptyUsage()) {
  for (const line of text.split('\n')) {
    if (!line.includes('"usage"')) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const msg = entry.message;
    if (!msg?.usage || (entry.timestamp && Date.parse(entry.timestamp) < from)) continue;
    const id = msg.id || entry.uuid;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    addUsage(usage, msg.usage);
  }
  return usage;
}

export function transcriptUsage(file, since) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  return readUsage(text, since ? Date.parse(since) : 0, new Set());
}

// Subagent transcripts of a session: Claude Code stores them next to the main transcript,
// `<project>/<session>.jsonl` → `<project>/<session>/subagents/[…/]agent-<id>.jsonl`.
function subagentTranscripts(file) {
  const dir = join(file.replace(/\.jsonl$/, ''), 'subagents');
  const found = [];
  const walk = (d) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (/^agent-.+\.jsonl$/.test(e.name)) found.push(join(d, e.name));
    }
  };
  walk(dir);
  return found.sort();
}

// Start of the first user message of a subagent transcript: the prompt that launched it.
export function promptKey(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

function firstPrompt(text) {
  for (const line of text.split('\n')) {
    if (!line.includes('"user"')) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.type !== 'user' && entry.message?.role !== 'user') continue;
      const c = entry.message?.content;
      return promptKey(typeof c === 'string' ? c : Array.isArray(c) ? c.filter((p) => p.type === 'text').map((p) => p.text).join('\n') : '');
    } catch {}
  }
  return '';
}

// Subagent tokens of a session since a date, broken down by role. Each transcript is matched to the
// launch logged by the Agent hook (`launches`: { agent_id, prompt, role }), by agent id, otherwise by
// the start of the prompt; without a match, the role is `unknown`.
// → { agents, usage, by_role: { role: usage } }; null if the main transcript is unreadable.
export function subagentUsage(file, since, launches = []) {
  if (!file || !existsSync(file)) return null;
  const from = since ? Date.parse(since) : 0;
  const seen = new Set();
  const result = { agents: 0, usage: emptyUsage(), by_role: {} };
  for (const path of subagentTranscripts(file)) {
    let text;
    try {
      text = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    const usage = readUsage(text, from, seen);
    if (!usage.messages) continue;
    const id = /agent-(.+)\.jsonl$/.exec(path)[1];
    const prompt = firstPrompt(text);
    const launch = launches.find((l) => l.agent_id && l.agent_id === id) || launches.find((l) => prompt && l.prompt && l.prompt === prompt);
    const role = launch?.role || 'unknown';
    result.agents++;
    addUsage(result.usage, usage);
    result.by_role[role] = addUsage(result.by_role[role] || emptyUsage(), usage);
  }
  return result;
}
