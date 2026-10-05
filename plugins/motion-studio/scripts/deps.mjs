/**
 * motion-studio dependency resolution — reuse what the machine already has,
 * install only what is missing, remember the result.
 *
 * Home (where deps + env.json live), first match wins:
 *   MOTION_STUDIO_HOME  →  CLAUDE_PLUGIN_DATA  →  ~/.cache/motion-studio
 *
 * MOTION_STUDIO_ISOLATED=1  ignore system installs (reproducible / test)
 * MOTION_STUDIO_NO_INSTALL=1  never auto-install, just report
 */
import { createRequire } from 'node:module';
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// `--home <dir>` on any script = MOTION_STUDIO_HOME (the skill passes ${CLAUDE_PLUGIN_DATA} this way,
// since plugin variables are not exported to Bash commands).
{
  const i = process.argv.findIndex((a) => a === '--home' || a.startsWith('--home='));
  if (i >= 0) process.env.MOTION_STUDIO_HOME = process.argv[i].includes('=') ? process.argv[i].split('=')[1] : process.argv[i + 1];
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = path.resolve(HERE, '..');
export const ISOLATED = process.env.MOTION_STUDIO_ISOLATED === '1';

export function home() {
  return path.resolve(process.env.MOTION_STUDIO_HOME || process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.cache', 'motion-studio'));
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

/** Returns { mod, path } for playwright / playwright-core, or null. */
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

export const LAUNCH_ARGS = ['--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'];

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

// ---------------------------------------------------------------- ffmpeg
const hasX264 = (bin) => {
  if (!bin || (path.isAbsolute(bin) && !fs.existsSync(bin))) return false;
  const r = spawnSync(bin, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.includes('libx264');
};

/** Locate an ffmpeg with libx264: FFMPEG_PATH, ffmpeg-static in home, PATH, imageio-ffmpeg, ffmpeg-static elsewhere. */
export function findFfmpeg() {
  const c = [];
  if (process.env.FFMPEG_PATH) c.push(process.env.FFMPEG_PATH);
  try { c.push(createRequire(path.join(home(), 'noop.js'))('ffmpeg-static')); } catch {}
  if (!ISOLATED) {
    c.push('ffmpeg');
    try {
      const p = execSync('python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      if (p) c.push(p);
    } catch {}
    for (const base of bases().slice(1)) { try { c.push(createRequire(base)('ffmpeg-static')); } catch {} }
  }
  return c.find(hasX264) || null;
}

// ---------------------------------------------------------------- CDN libraries → local npm cache
const CDN = /^https:\/\/(?:cdn\.jsdelivr\.net\/npm|unpkg\.com|esm\.sh)\/((?:@[^/]+\/)?[^/@?#]+)(?:@([^/?#]+))?(\/[^?#]*)?/;
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.cjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.gif': 'image/gif', '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ktx2': 'image/ktx2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.webm': 'video/webm' };

/** npm-install `name@version` once into <home>/libs, return the package directory. */
function localPackage(name, version = 'latest', log) {
  const dir = path.join(home(), 'libs', `${name.replace('/', '__')}@${version}`);
  const pkgDir = path.join(dir, 'node_modules', name);
  if (!fs.existsSync(path.join(pkgDir, 'package.json'))) {
    if (process.env.MOTION_STUDIO_NO_INSTALL === '1') return null;
    log(`📦 ${name}@${version} → local cache (npm)`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), '{"private":true}');
    const isWin = process.platform === 'win32';
    const r = spawnSync(isWin ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', '--loglevel=error', `${name}@${version}`], { cwd: dir, stdio: ['ignore', 'ignore', 'inherit'], shell: isWin });
    if (r.status !== 0) return null;
  }
  return pkgDir;
}

/**
 * Serve jsDelivr / unpkg / esm.sh `npm/<pkg>@<ver>/<file>` URLs from a local npm cache, so a
 * composition written against a CDN (and viewable as-is in any browser) renders offline,
 * deterministically, with pinned versions. Unknown URLs go to the network untouched.
 */
export async function routeCdnToLocal(context, log = (m) => process.stderr.write(m + '\n')) {
  await context.route(CDN, async (route) => {
    const m = route.request().url().match(CDN);
    const [, name, version = 'latest', sub = ''] = m;
    const pkgDir = localPackage(name, decodeURIComponent(version), log);
    if (!pkgDir) return route.continue();
    let file = path.join(pkgDir, sub);
    if (!sub || sub === '/') {
      const pj = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
      file = path.join(pkgDir, pj.module || pj.main || 'index.js');
    }
    if (!file.startsWith(pkgDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.continue();
    await route.fulfill({
      status: 200, body: fs.readFileSync(file),
      headers: { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'access-control-allow-origin': '*' },
    });
  });
}

// ---------------------------------------------------------------- local composition → virtual origin
/** Origin the composition is served from: a real http origin, so fetch() and WebGL textures work. */
export const LOCAL_ORIGIN = 'http://composition.local';

/**
 * Serve the folder `root` at LOCAL_ORIGIN, so `file` loads as http://composition.local/<rel>.
 * Under file:// Chrome refuses fetch() of sibling files and taints WebGL textures (SecurityError):
 * no HDRI, glTF or PBR texture could load. Playwright answers the requests itself: no port, no server.
 * Returns the URL of `file`. Nothing outside `root` is served.
 */
export async function serveLocal(context, root, file) {
  const base = path.resolve(root);
  await context.route(`${LOCAL_ORIGIN}/**`, async (route) => {
    let rel;
    try { rel = decodeURIComponent(new URL(route.request().url()).pathname); } catch { return route.fulfill({ status: 400 }); }
    const f = path.resolve(base, '.' + rel);
    if (f !== base && !f.startsWith(base + path.sep)) return route.fulfill({ status: 403 });
    let body;
    try { body = fs.readFileSync(f); } catch { return route.fulfill({ status: 404, body: `not found: ${rel}` }); }
    await route.fulfill({ status: 200, body, headers: { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' } });
  });
  return `${LOCAL_ORIGIN}/${path.relative(base, path.resolve(file)).split(path.sep).map(encodeURIComponent).join('/')}`;
}

// ---------------------------------------------------------------- one call for the renderer
/**
 * Resolve everything render.mjs needs. Uses the cached env.json when still valid,
 * otherwise runs setup.mjs (auto-install) unless MOTION_STUDIO_NO_INSTALL=1.
 */
export async function ensureDeps({ needBrowser = true, needFfmpeg = true, log = (m) => process.stderr.write(m + '\n') } = {}) {
  const cached = readEnv();
  const valid = cached
    && (!needFfmpeg || hasX264(cached.ffmpeg))
    && (!needBrowser || (cached.playwright && fs.existsSync(cached.playwright)));
  if (!valid) {
    if (process.env.MOTION_STUDIO_NO_INSTALL === '1') throw new Error('Missing dependencies and MOTION_STUDIO_NO_INSTALL=1: run node scripts/setup.mjs');
    log('⚙ First use: installing the dependencies (setup.mjs)…');
    const r = spawnSync(process.execPath, [path.join(HERE, 'setup.mjs')], { stdio: ['ignore', 'inherit', 'inherit'], env: process.env });
    if (r.status !== 0) throw new Error('setup.mjs failed — see the messages above');
  }
  const env = readEnv();
  const pw = needBrowser ? createRequire(import.meta.url)(env.playwright) : null;
  return { chromium: pw?.chromium, browser: env.browser, ffmpeg: env.ffmpeg };
}
