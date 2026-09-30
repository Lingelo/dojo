#!/usr/bin/env node
/**
 * motion-studio renderer — HTML/CSS/SVG/Canvas → deterministic video.
 *
 * The page never plays in real time. A virtual clock (performance.now, Date,
 * requestAnimationFrame, setTimeout/setInterval, Math.random) is injected before
 * any page script runs; for every frame the renderer advances that clock to t,
 * seeks every CSS / WAAPI / SVG-SMIL / <video> animation to t, screenshots the
 * page through CDP and pipes the PNG into ffmpeg. Same input → same frames.
 *
 * Usage: node render.mjs <file.html|url> [options]   (see --help)
 */
import { createRequire } from 'node:module';
import { spawn, spawnSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HELP = `
motion-studio render — HTML animation → video (deterministic, frame by frame)

  node render.mjs <composition.html|url> [options]

Options (CLI overrides the <body data-*> attributes of the composition):
  -o, --out <file>        Output file (default: <input>.mp4). Extension sets format
                          when --format is omitted: .mp4 .webm .gif .mov
      --format <f>        mp4 (H.264) | webm (VP9) | gif | mov (ProRes 4444)
      --width <px>        Viewport width           (data-width,  default 1920)
      --height <px>       Viewport height          (data-height, default 1080)
      --fps <n>           Frames per second        (data-fps,    default 60)
      --duration <s>      Duration in seconds      (data-duration, required somewhere)
      --scale <n>         Supersampling factor: render at n× then downscale (default 1)
      --motion-blur <n>   Sub-frames blended per frame (default 1 = off, 4-8 = cinematic)
      --crf <n>           Quality (mp4 default 16, webm default 20; lower = better)
      --audio <file>      Mux an audio track (trimmed to video length)
      --transparent       Transparent background (use with --format webm|mov)
      --seed <n>          Seed for Math.random (default 42)
      --stills <t,t,...>  Only export PNG stills at these times (seconds) — preview mode
      --from <s> --to <s> Render only a time range (fast iteration on one scene)
      --jpeg              Capture JPEG q95 instead of PNG (≈2× faster, slight loss)
  -h, --help
`;

// ---------------------------------------------------------------- CLI parsing
function parseArgs(argv) {
  const a = { _: [] };
  const alias = { o: 'out', h: 'help' };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith('-')) {
      let key = tok.replace(/^--?/, '');
      let val;
      if (key.includes('=')) [key, val] = key.split(/=(.*)/s);
      key = alias[key] || key;
      if (val === undefined) {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--') && !['help', 'transparent', 'jpeg'].includes(key)) {
          val = next; i++;
        } else val = true;
      }
      a[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = val;
    } else a._.push(tok);
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args._[0]) { console.log(HELP); process.exit(args.help ? 0 : 1); }

const log = (...m) => process.stderr.write(m.join(' ') + '\n');
const die = (m) => { log(`✖ ${m}`); process.exit(1); };

// ---------------------------------------------------------------- dependencies
function loadPlaywright() {
  const bases = [path.join(process.cwd(), 'noop.js'), import.meta.url];
  try { bases.push(path.join(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(), 'noop.js')); } catch {}
  for (const base of bases) {
    for (const name of ['playwright', 'playwright-core', '@playwright/test']) {
      try { return createRequire(base)(name); } catch {}
    }
  }
  die('Playwright not found. Install it: npm i -D playwright  (or npm i -g playwright) then npx playwright install chromium');
}

function findFfmpeg() {
  const candidates = [process.env.FFMPEG_PATH, 'ffmpeg'].filter(Boolean);
  try {
    const p = execSync('python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (p) candidates.push(p);
  } catch {}
  for (const base of [path.join(process.cwd(), 'noop.js'), import.meta.url]) {
    try { candidates.push(createRequire(base)('ffmpeg-static')); } catch {}
  }
  for (const c of candidates) {
    const r = spawnSync(c, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.includes('libx264')) return c;
  }
  die('ffmpeg with libx264 not found. Install one of: brew/apt install ffmpeg | pip install imageio-ffmpeg | npm i ffmpeg-static  (or set FFMPEG_PATH)');
}

// ---------------------------------------------------------------- virtual clock (injected before page scripts)
const VIRTUAL_TIME = String.raw`
(() => {
  const SEED = __SEED__;
  const EPOCH = 1735689600000; // fixed wall clock: 2025-01-01T00:00:00Z
  const setTimeoutReal = globalThis.__realSetTimeout || setTimeout;
  let now = 0;                 // virtual ms since page start
  let seq = 0;
  const timers = new Map();    // id -> {at, fn, args, every}
  let rafs = new Map();

  // deterministic PRNG (mulberry32)
  let s = SEED >>> 0;
  Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  performance.now = () => now;
  const RealDate = Date;
  function VDate(...a) {
    if (!new.target) return new RealDate(EPOCH + now).toString();
    return a.length ? new RealDate(...a) : new RealDate(EPOCH + now);
  }
  VDate.prototype = RealDate.prototype;
  VDate.now = () => EPOCH + now;
  VDate.parse = RealDate.parse;
  VDate.UTC = RealDate.UTC;
  window.Date = VDate;

  const call = (fn, a) => { try { typeof fn === 'function' ? fn(...a) : (0, eval)(fn); } catch (e) { console.error(e); } };
  window.setTimeout = (fn, d = 0, ...a) => { const id = ++seq; timers.set(id, { at: now + Math.max(0, +d || 0), fn, args: a, seq: id }); return id; };
  window.setInterval = (fn, d = 0, ...a) => { const id = ++seq; const every = Math.max(1, +d || 0); timers.set(id, { at: now + every, fn, args: a, every, seq: id }); return id; };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  window.requestAnimationFrame = (fn) => { const id = ++seq; rafs.set(id, fn); return id; };
  window.cancelAnimationFrame = (id) => { rafs.delete(id); };
  window.requestIdleCallback = (fn) => window.setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 50 }), 1);
  window.cancelIdleCallback = window.clearTimeout;

  // --- animation bookkeeping: remember the virtual time each animation was born at
  const born = new WeakMap();
  const nativeAnimate = Element.prototype.animate;
  Element.prototype.animate = function (...a) { const an = nativeAnimate.apply(this, a); born.set(an, now); return an; };
  // SMIL timelines start with their <svg> document; inline <svg> present at load are born at 0.
  const svgBorn = new WeakMap();
  const register = () => {
    for (const an of document.getAnimations()) if (!born.has(an)) born.set(an, now);
    for (const svg of document.querySelectorAll('svg')) if (!svg.ownerSVGElement && !svgBorn.has(svg)) svgBorn.set(svg, now);
  };

  function advance(target) {
    register(); // anything created since the last frame was born at the previous 'now'
    for (;;) {
      let next = null;
      for (const t of timers.values()) if (t.at <= target && (!next || t.at < next.at || (t.at === next.at && t.seq < next.seq))) next = t;
      if (!next) break;
      now = Math.max(now, next.at);
      if (next.every) next.at += next.every; else timers.delete(next.seq);
      call(next.fn, next.args);
      register();
    }
    now = target;
    const batch = rafs; rafs = new Map();
    for (const fn of batch.values()) call(fn, [now]);
    register();
  }

  function sync() {
    for (const an of document.getAnimations()) {
      if (!born.has(an)) born.set(an, now);
      an.pause();
      an.currentTime = Math.max(0, now - born.get(an));
    }
    for (const svg of document.querySelectorAll('svg')) {
      if (svg.ownerSVGElement || typeof svg.pauseAnimations !== 'function') continue;
      svg.pauseAnimations();
      svg.setCurrentTime(Math.max(0, now - svgBorn.get(svg)) / 1000);
    }
    const seeks = [];
    for (const v of document.querySelectorAll('video, audio')) {
      const start = parseFloat(v.dataset.start || '0') * 1000;
      const want = Math.max(0, now - start) / 1000;
      v.pause();
      if (Math.abs(v.currentTime - want) > 1e-3) {
        seeks.push(new Promise((r) => { v.addEventListener('seeked', r, { once: true }); setTimeoutReal(r, 2000); }));
        v.currentTime = want;
      }
    }
    return Promise.all(seeks);
  }

  window.__vt = {
    async frame(ms) {
      if (ms < now) throw new Error('virtual time only moves forward');
      advance(ms);
      if (typeof window.__seek === 'function') await window.__seek(ms / 1000);
      await sync();
      if (document.fonts) await document.fonts.ready;
      return now;
    },
    get now() { return now; },
  };
})();
`;

// ---------------------------------------------------------------- main
const input = args._[0];
const url = /^(https?|file|data):/.test(input) ? input : pathToFileURL(path.resolve(input)).href;
if (!/^(https?|data):/.test(url) && !fs.existsSync(new URL(url))) die(`Input not found: ${input}`);

const { chromium } = loadPlaywright();
const ffmpeg = args.stills ? null : findFfmpeg();

const launchOpts = { args: ['--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'] };
if (process.env.CHROMIUM_PATH) launchOpts.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launchOpts);

try {
  // 1. read composition config from <body data-*> / <html data-*>
  const probe = await browser.newPage();
  await probe.goto(url, { waitUntil: 'domcontentloaded' });
  const meta = await probe.evaluate(() => ({ ...document.documentElement.dataset, ...document.body.dataset }));
  await probe.close();

  const num = (v, d) => (v === undefined || v === true ? d : Number(v));
  const cfg = {
    width: num(args.width ?? meta.width, 1920),
    height: num(args.height ?? meta.height, 1080),
    fps: num(args.fps ?? meta.fps, 60),
    duration: num(args.duration ?? meta.duration, NaN),
    scale: num(args.scale, 1),
    blur: Math.max(1, Math.round(num(args.motionBlur, 1))),
    seed: num(args.seed ?? meta.seed, 42),
  };
  if (!Number.isFinite(cfg.duration) && !args.stills) die('No duration: add data-duration="6" on <body> or pass --duration 6');

  // 2. real page, virtual time installed before any script
  const context = await browser.newContext({ viewport: { width: cfg.width, height: cfg.height }, deviceScaleFactor: cfg.scale, reducedMotion: 'no-preference' });
  await context.addInitScript({ content: `globalThis.__realSetTimeout = setTimeout;\n` + VIRTUAL_TIME.replace('__SEED__', String(cfg.seed)) });
  const page = await context.newPage();
  page.on('pageerror', (e) => log(`⚠ page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') log(`⚠ console: ${m.text()}`); });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(async () => {
    if (document.fonts) await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? null : i.decode().catch(() => null))));
  });

  const cdp = await context.newCDPSession(page);
  if (args.transparent) await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  const shotFormat = args.jpeg && !args.transparent ? 'jpeg' : 'png';
  const capture = async () => Buffer.from((await cdp.send('Page.captureScreenshot', { format: shotFormat, quality: shotFormat === 'jpeg' ? 95 : undefined, optimizeForSpeed: true, captureBeyondViewport: false })).data, 'base64');

  // 3a. stills mode (preview key moments before a full render)
  if (args.stills) {
    const times = String(args.stills).split(',').map(Number).sort((x, y) => x - y);
    const base = args.out ? path.resolve(args.out) : path.resolve(input.replace(/\.[^.]+$/, ''));
    const dir = args.out && !path.extname(args.out) ? base : path.dirname(base);
    const stem = args.out && !path.extname(args.out) ? 'still' : path.basename(base);
    fs.mkdirSync(dir, { recursive: true });
    for (const t of times) {
      await page.evaluate((ms) => window.__vt.frame(ms), t * 1000);
      const f = path.join(dir, `${stem}-${t.toFixed(2)}s.png`);
      fs.writeFileSync(f, await capture());
      console.log(f);
    }
    process.exitCode = 0;
  } else {
    // 3b. full render → ffmpeg
    const out = path.resolve(args.out || input.replace(/\.[^.]+$/, '') + '.mp4');
    const format = args.format || path.extname(out).slice(1) || 'mp4';
    const from = num(args.from, 0), to = Math.min(num(args.to, cfg.duration), cfg.duration);
    const captureFps = cfg.fps * cfg.blur;
    const total = Math.round((to - from) * captureFps);

    const vf = [];
    if (cfg.blur > 1) vf.push(`tmix=frames=${cfg.blur}`, `framestep=${cfg.blur}`);
    if (cfg.scale !== 1) vf.push(`scale=${cfg.width}:${cfg.height}:flags=lanczos`);
    const enc = {
      mp4: () => { vf.push('scale=out_color_matrix=bt709:out_range=tv', 'format=yuv420p'); return ['-c:v', 'libx264', '-preset', 'slow', '-crf', String(args.crf ?? 16), '-tune', 'animation', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart']; },
      webm: () => { vf.push(args.transparent ? 'format=yuva420p' : 'format=yuv420p'); return ['-c:v', 'libvpx-vp9', '-crf', String(args.crf ?? 20), '-b:v', '0', '-row-mt', '1']; },
      mov: () => ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', args.transparent ? 'yuva444p10le' : 'yuv444p10le'],
      gif: () => { vf.push(`fps=${Math.min(cfg.fps, 30)}`, `scale=${Math.min(cfg.width, 960)}:-1:flags=lanczos`); return []; },
    }[format];
    if (!enc) die(`Unknown format: ${format}`);
    const codecArgs = enc();

    const ff = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(captureFps), '-i', '-'];
    if (args.audio) ff.push('-ss', String(from), '-i', path.resolve(args.audio));
    if (format === 'gif') ff.push('-filter_complex', `${vf.join(',')},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a`);
    else if (vf.length) ff.push('-vf', vf.join(','));
    ff.push(...codecArgs, '-r', String(format === 'gif' ? Math.min(cfg.fps, 30) : cfg.fps));
    if (args.audio) ff.push('-map', '0:v', '-map', '1:a', '-c:a', format === 'webm' ? 'libopus' : 'aac', '-b:a', '192k', '-shortest');
    ff.push(out);

    fs.mkdirSync(path.dirname(out), { recursive: true });
    const proc = spawn(ffmpeg, ff, { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((res, rej) => proc.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited with ${c}`)))));

    log(`▶ ${path.basename(input)} → ${path.basename(out)}  ${cfg.width}×${cfg.height} @${cfg.fps}fps  ${(to - from).toFixed(2)}s  scale×${cfg.scale}  blur×${cfg.blur}  (${total} captures)`);
    const t0 = Date.now();
    let lastLog = 0;
    for (let i = 0; i < total; i++) {
      await page.evaluate((ms) => window.__vt.frame(ms), (from + i / captureFps) * 1000);
      const buf = await capture();
      if (!proc.stdin.write(buf)) await new Promise((r) => proc.stdin.once('drain', r));
      if (Date.now() - lastLog > 2000 || i === total - 1) {
        lastLog = Date.now();
        const rate = (i + 1) / ((Date.now() - t0) / 1000);
        log(`  ${String(Math.round(((i + 1) / total) * 100)).padStart(3)}%  ${i + 1}/${total}  ${rate.toFixed(1)} cap/s  ETA ${Math.max(0, (total - i - 1) / rate).toFixed(0)}s`);
      }
    }
    proc.stdin.end();
    await done;
    const size = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
    log(`✔ ${out}  (${size} MB, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    console.log(out);
  }
} finally {
  await browser.close();
}
