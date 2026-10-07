// Kaizen — which tools this repo can reach, and which one to pick for a step.
//
// The choice is a decision, not a generation: Claude classifies the situation into one intent of a
// fixed vocabulary, then this module answers deterministically — ordered preferences, first available
// wins, "ask" when nothing fits. Inventory: MCP servers declared for the repo (project .mcp.json, local
// and user scopes of ~/.claude.json, the servers Kaizen ships) and CLIs on the PATH. Never prints a
// server's env, headers or URL credentials.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

// Category of a server, from its name, command, arguments and URL. First match wins.
const CATEGORIES = [
  ['user-browser', /claude-in-chrome|chrome-devtools|browsermcp|browser-?use/i],
  ['browser', /playwright|puppeteer|browser|chromium|selenium/i],
  ['github', /github/i],
  ['tracker', /jira|atlassian|linear|asana|youtrack|shortcut|clickup/i],
  ['observability', /datadog|sentry|grafana|pagerduty|new-?relic|honeycomb|opsgenie|prometheus/i],
  ['database', /postgres|mysql|sqlite|mongo|supabase|redis|neon|planetscale|bigquery|snowflake|\bdb\b/i],
  ['design', /figma|penpot/i],
  ['docs', /context7|docs|confluence|notion|devdocs/i],
  ['chat', /slack|teams|discord/i],
];

const CLIS = ['gh', 'curl', 'npx', 'docker', 'psql', 'mysql', 'sqlite3', 'playwright'];

// Fixed vocabulary. Each preference: `mcp:<category>`, `cli:<name>`, `repo:playwright-test`,
// `builtin:<tool>` (always there in Claude Code). Nothing available → `ask`.
export const INTENTS = {
  'see-page': {
    question: 'look at or interact with a running page, now (touch-up, quick check, reproduce a UI bug)',
    prefs: [
      ['mcp:browser', 'browser_navigate, then browser_snapshot (accessibility tree, cheap) before any screenshot; browser_take_screenshot only for a visual judgment; browser_console_messages for errors'],
      ['repo:playwright-test', 'a throwaway script with the repo\'s Playwright (`npx playwright screenshot <url> <file>`), deleted afterwards'],
      ['cli:playwright', '`playwright screenshot <url> <file>`, then read the image'],
    ],
    fallback: 'give the URL and ask the user what they see',
  },
  'ui-check': {
    question: 'a UI behavior that must keep holding (acceptance example, regression, evidence for the gate)',
    prefs: [
      ['repo:playwright-test', 'a test in the repo\'s Playwright suite, run by `verify`: it survives the session, a browser session does not'],
    ],
    fallback: 'propose adding @playwright/test as a dev dependency (the user decides); meanwhile check with see-page and say the check is not repeatable',
  },
  'logged-in': {
    question: 'a page behind the user\'s own sign-in (admin, SaaS dashboard, private app)',
    prefs: [
      ['mcp:user-browser', 'the user\'s browser with their session; never ask for nor type a password'],
    ],
    fallback: 'ask the user to open the page and share what they see; never type credentials into an automated browser',
  },
  'read-web': {
    question: 'read a public page (article, changelog, issue on another site)',
    prefs: [
      ['builtin:WebFetch', 'WebFetch with a precise question'],
      ['mcp:browser', 'only if the page needs JavaScript to render'],
    ],
    fallback: 'ask the user to paste the content',
  },
  'library-docs': {
    question: 'the API of a library or framework at the version the repo uses',
    prefs: [
      ['mcp:docs', 'the docs server, with the version from the lockfile'],
      ['builtin:WebFetch', 'the official docs page for that version'],
    ],
    fallback: 'read the types or sources in node_modules / the vendored package',
  },
  'call-api': {
    question: 'call an HTTP/JSON API and read the raw answer',
    prefs: [
      ['cli:curl', '`curl -sS` with tokens from the environment, never inline; no write method without the user'],
      ['cli:npx', 'a `node -e` fetch script'],
    ],
    fallback: 'ask the user for a sample response',
  },
  github: {
    question: 'pull request, review threads, CI, issues on GitHub',
    prefs: [
      ['cli:gh', '`node $K pr …` for PR tracking (deterministic), `gh` for the rest'],
      ['mcp:github', 'the GitHub MCP server, when `gh` is missing or unauthenticated'],
    ],
    fallback: 'ask the user to install or log into `gh` (`gh auth login`)',
  },
  ticket: {
    question: 'read the ticket behind the branch (Jira, Linear…)',
    prefs: [
      ['mcp:tracker', 'the tracker server, ticket key from the branch name; read-only unless the user asks'],
    ],
    fallback: 'ask the user to paste the ticket',
  },
  observability: {
    question: 'production logs, errors, metrics, alerts',
    prefs: [
      ['mcp:observability', 'the observability server, read-only, bounded time window'],
      ['kaizen:monitor', '`node $K monitor check` with the signals declared in .kaizen/config.json'],
    ],
    fallback: 'ask the user for the logs or the dashboard screenshot',
  },
  database: {
    question: 'inspect data or a schema',
    prefs: [
      ['mcp:database', 'read-only queries with a LIMIT; never on production without the user'],
      ['cli:psql', 'local or test database only'],
      ['cli:mysql', 'local or test database only'],
      ['cli:sqlite3', 'local file only'],
    ],
    fallback: 'read the migrations and the schema in the repo',
  },
  design: {
    question: 'the design source of a screen (spacing, tokens, states)',
    prefs: [
      ['mcp:design', 'the design server, frame named by the user'],
    ],
    fallback: 'ask the user for an export or a screenshot of the frame',
  },
};

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function claudeConfigPath(env = process.env) {
  return env.CLAUDE_CONFIG_DIR ? join(env.CLAUDE_CONFIG_DIR, '.claude.json') : join(homedir(), '.claude.json');
}

function categoryOf(name, server) {
  const text = [name, server.command, ...(server.args || []), server.url].filter(Boolean).join(' ');
  return CATEGORIES.find(([, re]) => re.test(text))?.[0] || 'other';
}

// true / false for a package or image run on demand, null when nothing is fetched (local command, URL).
function pinned(server) {
  const args = (server.args || []).map(String);
  const cmd = String(server.command || '').replace(/\.(cmd|exe)$/i, '').split(/[\\/]/).pop();
  if (/^(npx|bunx|pnpx|uvx|pipx)$/.test(cmd) || (cmd === 'pnpm' && args[0] === 'dlx')) {
    const pkg = args.find((a, i) => !a.startsWith('-') && !(cmd === 'pnpm' && i === 0) && !['run', 'dlx'].includes(a));
    if (!pkg) return null;
    return /(@|==)\d[\w.+-]*$/.test(pkg) && !/@(latest|next)$/.test(pkg);
  }
  if (cmd === 'docker') {
    const image = args.slice(args.indexOf('run') + 1).find((a) => !a.startsWith('-') && /[/:]|^[a-z0-9._-]+$/.test(a) && !a.includes('='));
    if (!image) return null;
    return /@sha256:|:[\w.-]+$/.test(image) && !/:latest$/.test(image);
  }
  return null;
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return '<invalid url>';
  }
}

function describe(name, server, scope, status) {
  const transport = server.type || (server.url ? 'http' : 'stdio');
  return {
    name,
    scope,
    status,
    transport,
    category: categoryOf(name, server),
    ...(server.url ? { url: safeUrl(server.url) } : { command: [server.command, ...(server.args || [])].filter(Boolean).join(' ') }),
    pinned: pinned(server),
  };
}

function settingsList(root, key) {
  const values = [];
  let all = false;
  for (const f of ['settings.json', 'settings.local.json']) {
    const s = readJson(join(root, '.claude', f));
    if (!s) continue;
    if (Array.isArray(s[key])) values.push(...s[key]);
    if (s.enableAllProjectMcpServers === true) all = true;
  }
  return { values, all };
}

function projectEntry(claude, root) {
  const projects = claude?.projects || {};
  const want = resolve(root).toLowerCase();
  const key = Object.keys(projects).find((k) => resolve(k).toLowerCase() === want);
  return key ? projects[key] : null;
}

export function onPath(name, env = process.env) {
  const exts = process.platform === 'win32' ? (env.PATHEXT || '.EXE;.CMD;.BAT').split(';').concat('') : [''];
  for (const dir of String(env.PATH || '').split(delimiter).filter(Boolean)) {
    for (const ext of exts) {
      try {
        if (statSync(join(dir, name + ext)).isFile()) return true;
      } catch {}
    }
  }
  return false;
}

function hasPlaywrightTest(root) {
  if (['playwright.config.ts', 'playwright.config.js', 'playwright.config.mjs', 'playwright.config.cjs'].some((f) => existsSync(join(root, f)))) return true;
  const pkg = readJson(join(root, 'package.json'));
  return Boolean(pkg && { ...pkg.dependencies, ...pkg.devDependencies }['@playwright/test']);
}

export function inventory(root, { env = process.env } = {}) {
  const servers = [];
  const claude = readJson(claudeConfigPath(env));
  const project = projectEntry(claude, root);

  for (const [name, s] of Object.entries(readJson(join(PLUGIN_ROOT, '.mcp.json'))?.mcpServers || {})) {
    servers.push(describe(name, s, 'plugin:kaizen', 'enabled'));
  }
  const enabled = settingsList(root, 'enabledMcpjsonServers');
  const disabled = settingsList(root, 'disabledMcpjsonServers');
  const approved = new Set([...enabled.values, ...(project?.enabledMcpjsonServers || [])]);
  const refused = new Set([...disabled.values, ...(project?.disabledMcpjsonServers || [])]);
  for (const [name, s] of Object.entries(readJson(join(root, '.mcp.json'))?.mcpServers || {})) {
    const status = refused.has(name) ? 'disabled' : approved.has(name) || enabled.all ? 'enabled' : 'needs approval';
    servers.push(describe(name, s, 'project', status));
  }
  for (const [name, s] of Object.entries(project?.mcpServers || {})) servers.push(describe(name, s, 'local', 'enabled'));
  for (const [name, s] of Object.entries(claude?.mcpServers || {})) servers.push(describe(name, s, 'user', 'enabled'));

  const clis = Object.fromEntries(CLIS.map((c) => [c, onPath(c, env)]));
  if (!clis.playwright && existsSync(join(root, 'node_modules', '.bin', 'playwright'))) clis.playwright = true;

  const warnings = [];
  for (const s of servers) {
    if (s.pinned === false) warnings.push(`${s.name} (${s.scope}): runs whatever version is published at start — pin an exact version`);
    if (s.status === 'needs approval') warnings.push(`${s.name} (project): declared in .mcp.json but not approved yet — /mcp to approve`);
  }
  const names = new Map();
  for (const s of servers) names.set(s.name, [...(names.get(s.name) || []), s.scope]);
  for (const [name, scopes] of names) if (scopes.length > 1) warnings.push(`${name}: declared in several scopes (${scopes.join(', ')}) — Claude Code keeps one, local > project > user`);

  return {
    servers,
    clis,
    playwright_test: hasPlaywrightTest(root),
    warnings,
    not_seen: 'claude.ai connectors and other plugins\' servers: compare with the tools this session actually lists (/mcp)',
  };
}

function available(pref, inv) {
  const [kind, name] = pref.split(':');
  if (kind === 'builtin' || kind === 'kaizen') return { ok: true };
  if (kind === 'cli') return { ok: Boolean(inv.clis[name]), via: name };
  if (kind === 'repo') return { ok: inv.playwright_test, via: '@playwright/test' };
  const hits = inv.servers.filter((s) => s.category === name && s.status === 'enabled');
  return { ok: hits.length > 0, via: hits.map((s) => s.name).join(', ') || null };
}

export function pick(intent, inv) {
  const spec = INTENTS[intent];
  if (!spec) return null;
  const options = spec.prefs.map(([tool, how]) => ({ tool, how, ...available(tool, inv) }));
  const usable = options.filter((o) => o.ok).map(({ ok, ...o }) => o);
  return {
    intent,
    question: spec.question,
    pick: usable[0] || { tool: 'ask', how: spec.fallback },
    alternatives: usable.slice(1),
    missing: options.filter((o) => !o.ok).map((o) => o.tool),
    fallback: spec.fallback,
  };
}
