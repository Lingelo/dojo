/**
 * slide-studio dependency resolution — reuse the Playwright and the browser the machine already has,
 * install only what is missing, remember the result. Only `check` and `export` need it.
 *
 * Home (where deps + env.json live), first match wins:
 *   --home <dir>  →  SLIDE_STUDIO_HOME  →  CLAUDE_PLUGIN_DATA  →  ~/.cache/slide-studio
 *
 * SLIDE_STUDIO_ISOLATED=1    ignore system installs (reproducible / test)
 * SLIDE_STUDIO_NO_INSTALL=1  never auto-install, just report
 * CHROMIUM_PATH              browser to use
 */
import { createRequire } from 'node:module';
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// `--home <dir>` on any script = SLIDE_STUDIO_HOME (the skill passes ${CLAUDE_PLUGIN_DATA} this way,
// since plugin variables are not exported to Bash commands).
{
  const i = process.argv.findIndex((a) => a === '--home' || a.startsWith('--home='));
  if (i >= 0) process.env.SLIDE_STUDIO_HOME = process.argv[i].includes('=') ? process.argv[i].split('=')[1] : process.argv[i + 1];
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = path.resolve(HERE, '..');
export const ISOLATED = process.env.SLIDE_STUDIO_ISOLATED === '1';

export function home() {
  return path.resolve(process.env.SLIDE_STUDIO_HOME || process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.cache', 'slide-studio'));
}
const envFile = () => path.join(home(), 'env.json');

export function readEnv() {
  try { return JSON.parse(fs.readFileSync(envFile(), 'utf8')); } catch { return null; }
}
export function writeEnv(env) {
  fs.mkdirSync(home(), { recursive: true });
  fs.writeFileSync(envFile(), JSON.stringify({ ...env, updated: new Date().toISOString() }, null, 2));
}

// ---------------------------------------------------------------- Playwright
/** Directories to resolve node packages from: our home first, then (unless isolated) project, plugin, global. */
function bases() {
  const b = [path.join(home(), 'noop.js')];
  if (!ISOLATED) {
    b.push(path.join(process.cwd(), 'noop.js'), path.join(PLUGIN_ROOT, 'noop.js'));
    try { b.push(path.join(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(), 'noop.js')); } catch {}
  }
  return b;
}

/** Returns { mod, path, name } for playwright / playwright-core, or null. */
export function findPlaywright() {
  for (const base of bases()) {
    for (const name of ['playwright-core', 'playwright', '@playwright/test']) {
      try {
        const req = createRequire(base);
        const resolved = req.resolve(name);
        return { mod: req(name), path: resolved, name };
      } catch {}
    }
  }
  return null;
}

/** Candidate browser launch options, cheapest first. */
export function browserCandidates() {
  const c = [];
  if (process.env.CHROMIUM_PATH) c.push({ label: `CHROMIUM_PATH (${process.env.CHROMIUM_PATH})`, opts: { executablePath: process.env.CHROMIUM_PATH } });
  c.push({ label: "Playwright's Chromium", opts: {} });
  if (!ISOLATED) {
    c.push({ label: 'installed Google Chrome', opts: { channel: 'chrome' } });
    c.push({ label: 'installed Microsoft Edge', opts: { channel: 'msedge' } });
  }
  return c;
}

export const LAUNCH_ARGS = ['--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none', '--hide-scrollbars'];

/** Try each candidate; returns { label, opts } of the first that really launches, or { error }. */
export async function findBrowser(chromium) {
  let lastError = '';
  for (const cand of browserCandidates()) {
    try {
      const b = await chromium.launch({ ...cand.opts, args: LAUNCH_ARGS });
      await b.close();
      return cand;
    } catch (e) { lastError = String(e.message || e).split('\n').slice(0, 6).join('\n'); }
  }
  return { error: lastError };
}

// ---------------------------------------------------------------- local deck → virtual origin
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm' };

/** Origin the deck is served from: a real http origin, so fetch() of sibling files works. */
export const LOCAL_ORIGIN = 'http://deck.local';

/**
 * Serve the folder `root` at LOCAL_ORIGIN, so `file` loads as http://deck.local/<rel>. Playwright answers
 * the requests itself: no port, no server. Nothing outside `root` is served, nor any hidden file or folder
 * (.env, .git…): the page's JS could fetch() and leak them. Returns the URL of `file`.
 */
export async function serveLocal(context, root, file) {
  const base = path.resolve(root);
  await context.route(`${LOCAL_ORIGIN}/**`, async (route) => {
    let rel;
    try { rel = decodeURIComponent(new URL(route.request().url()).pathname); } catch { return route.fulfill({ status: 400 }); }
    const f = path.resolve(base, '.' + rel);
    if (f !== base && !f.startsWith(base + path.sep)) return route.fulfill({ status: 403 });
    if (path.relative(base, f).split(path.sep).some((seg) => seg.startsWith('.'))) return route.fulfill({ status: 403, body: `hidden path not served: ${rel}` });
    let body;
    try { body = fs.readFileSync(f); } catch { return route.fulfill({ status: 404, body: `not found: ${rel}` }); }
    await route.fulfill({ status: 200, body, headers: { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' } });
  });
  return `${LOCAL_ORIGIN}/${path.relative(base, path.resolve(file)).split(path.sep).map(encodeURIComponent).join('/')}`;
}

// ---------------------------------------------------------------- one call for slides.mjs
/**
 * Resolve Playwright + a browser. Uses the cached env.json when still valid, otherwise runs setup.mjs
 * (auto-install) unless SLIDE_STUDIO_NO_INSTALL=1.
 */
export async function ensureDeps({ log = (m) => process.stderr.write(m + '\n') } = {}) {
  const cached = readEnv();
  const valid = cached?.playwright && fs.existsSync(cached.playwright);
  if (!valid) {
    if (process.env.SLIDE_STUDIO_NO_INSTALL === '1') throw new Error('Missing dependencies and SLIDE_STUDIO_NO_INSTALL=1: run node scripts/setup.mjs');
    log('⚙ First use: installing the dependencies (setup.mjs)…');
    const r = spawnSync(process.execPath, [path.join(HERE, 'setup.mjs')], { stdio: ['ignore', 'inherit', 'inherit'], env: process.env });
    if (r.status !== 0) throw new Error('setup.mjs failed — see the messages above');
  }
  const env = readEnv();
  return { chromium: createRequire(import.meta.url)(env.playwright).chromium, browser: env.browser };
}
