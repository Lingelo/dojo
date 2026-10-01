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
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { analyze, mix } from './audio.mjs';
import { parseSubs, toSrt, toVtt, wordsOf } from './captions.mjs';
import { LAUNCH_ARGS, ensureDeps, routeCdnToLocal } from './deps.mjs';

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
      --audio <file>      Music / voice track: mixed in, AND analyzed (tempo, beats, energy)
                          and exposed to the page as window.__audio (image follows sound)
      --audio-gain <g>    Gain of --audio in the mix (default 1)
      --beats <json>      Exact beat grid {bpm, beats[]} (e.g. from sfx.mjs bed) overriding analysis
      --no-sfx            Ignore sound cues (data-sfx, __sfx(), <audio data-start>)
      --voice <json>      Narration from voice.mjs (voice.json): mixed on top, music ducked under it,
                          subtitles taken from it, exposed to the page as window.__captions
      --subs <file>       Subtitles (.srt .vtt .json) — burned in, exported next to the video
      --captions <style>  Burned-in style: bottom (default) | karaoke | center | off
                          (off = no overlay, the page draws its own from window.__captions)
      --embed-subs        Also add a soft (toggleable) subtitle track (mp4 / webm)
      --duck <dB|off>     Music attenuation while the voice speaks (default -9)
      --lufs <n|off>      Loudness target of the final mix (default -14, streaming standard)
      --cues <file.json>  Also write the collected sound cues (debug / external DAW)
      --transparent      Transparent background (use with --format webm|mov)
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
        if (next !== undefined && !next.startsWith('--') && !['help', 'transparent', 'jpeg', 'no-sfx', 'embed-subs'].includes(key)) {
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

// ---------------------------------------------------------------- dependencies (auto-installed on first run, see setup.mjs)
// Injected before page scripts when a music track is given: the image can follow the sound.
const AUDIO_API = String.raw`
window.__audio = (() => {
  const d = __DATA__;
  const at = (arr, t) => {
    const x = t * d.rate, i = Math.floor(x);
    if (!arr.length) return 0;
    if (i < 0) return arr[0];
    if (i >= arr.length - 1) return arr[arr.length - 1];
    return arr[i] + (arr[i + 1] - arr[i]) * (x - i);
  };
  return {
    ...d,
    level: (t) => at(d.level, t),
    bass: (t) => at(d.bass, t),
    beat(t) {
      let i = -1;
      for (let k = 0; k < d.beats.length && d.beats[k] <= t + 1e-6; k++) i = k;
      const since = i < 0 ? Infinity : t - d.beats[i];
      return { index: i, since, phase: i < 0 ? 0 : Math.min(1, since / (60 / d.bpm)), pulse: i < 0 ? 0 : Math.exp(-since * 8) };
    },
    nextBeat: (t) => d.beats.find((b) => b >= t - 1e-6) ?? t,
  };
})();
`;

// Subtitles: window.__captions for the page + a burned-in overlay (deterministic: driven by virtual time).
const CAPTIONS_API = String.raw`
window.__captions = (() => {
  const d = __DATA__;
  const cues = d.cues, lines = d.lines || [];
  const find = (arr, t) => arr.find((c) => t >= c.start && t < c.end) || null;
  return {
    ...d,
    at: (t) => find(cues, t),                       // active subtitle cue (or null)
    line: (t) => find(lines, t),                    // active spoken line (or null) — image follows voice
    word: (t) => { const c = find(cues, t); return c ? c.words.find((w) => t >= w.start && t < w.end) || null : null; },
    speaking: (t) => lines.some((l) => t >= l.start && t < l.end),
  };
})();
(() => {
  const style = __STYLE__;
  if (style === 'off') return;
  let el = null, last = null;
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  window.__captionsTick = (t) => {
    if (!el) {
      el = document.createElement('div');
      el.id = '__captions';
      const W = innerWidth, H = innerHeight, portrait = H > W;
      const size = Math.round(Math.min(H * 0.046, W * 0.062));
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ffd23f';
      const pos = style === 'center' ? 'top:50%;transform:translateY(-50%);' : 'bottom:' + Math.round(H * (portrait ? 0.17 : 0.075)) + 'px;';
      el.style.cssText = 'position:fixed;left:50%;margin-left:' + (-W * 0.4) + 'px;width:' + (W * 0.8) + 'px;' + pos +
        'text-align:center;z-index:2147483647;pointer-events:none;font:700 ' + size + 'px/1.25 ' + (getComputedStyle(document.body).fontFamily || 'sans-serif') +
        ';color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.9),0 0 ' + Math.round(size * 0.35) + 'px rgba(0,0,0,.85),0 0 2px #000;' +
        '-webkit-text-stroke:' + Math.max(2, Math.round(size / 14)) + 'px rgba(0,0,0,.9);paint-order:stroke fill;text-wrap:balance;';
      el.style.setProperty('--cap-accent', accent);
      (document.body || document.documentElement).appendChild(el);
    }
    const c = window.__captions.at(t);
    if (!c) { el.style.opacity = 0; last = null; return; }
    // fade in / out by hand (no CSS animation → nothing to seek)
    const k = Math.min(1, (t - c.start) / 0.12, (c.end - t) / 0.12);
    el.style.opacity = Math.max(0, k);
    const w = style === 'karaoke' ? window.__captions.word(t) : null;
    const key = c.start + '|' + (w ? w.start : '');
    if (key === last) return;
    last = key;
    el.innerHTML = style === 'karaoke'
      ? (c.words || []).map((x) => '<span style="' + (t >= x.start ? 'color:var(--cap-accent)' : '') + '">' + esc(x.w) + '</span>').join(' ')
      : esc(c.text).replace(/\n/g, '<br>');
  };
})();
`;

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

  // --- sound cues, stamped with the exact virtual time → audio is in sync by construction
  const cues = [], cueKeys = new Set();
  window.__sfx = (src, o = {}) => {
    const at = o.at ?? now / 1000;
    const key = o.id ?? src + '@' + at.toFixed(4);
    if (cueKeys.has(key)) return;           // idempotent: safe to call from __seek / rAF every frame
    cueKeys.add(key);
    cues.push({ src: String(src), at, gain: o.gain ?? 1, pan: o.pan ?? 0, align: o.align });
  };
  const autoPan = (el) => { const r = el.getBoundingClientRect(); return +((((r.left + r.width / 2) / innerWidth) * 2 - 1) * 0.6).toFixed(2); };
  // data-sfx="whoosh" on an animated element → cue at the moment its animation starts (birth + delay)
  const sfxDone = new WeakSet();
  const sfxFor = (an) => {
    const el = an.effect && an.effect.target;
    if (!el || !el.dataset || !el.dataset.sfx) return;
    const name = an.animationName || an.transitionProperty || an.id || '';
    const on = el.dataset.sfxOn;
    if (on ? !on.split(',').map((x) => x.trim()).includes(name) : sfxDone.has(el)) return;
    sfxDone.add(el);
    const delay = an.effect.getTiming().delay || 0;
    const pan = el.dataset.sfxPan === 'auto' ? autoPan(el) : parseFloat(el.dataset.sfxPan || '0');
    window.__sfx(el.dataset.sfx, { at: (now + delay) / 1000 + parseFloat(el.dataset.sfxOffset || '0'), gain: parseFloat(el.dataset.sfxGain || '1'), pan, id: 'anim:' + cues.length + ':' + now });
  };

  // --- animation bookkeeping: remember the virtual time each animation was born at
  const born = new WeakMap();
  const birth = (an) => { born.set(an, now); sfxFor(an); };
  const nativeAnimate = Element.prototype.animate;
  Element.prototype.animate = function (...a) { const an = nativeAnimate.apply(this, a); birth(an); return an; };
  // SMIL timelines start with their <svg> document; inline <svg> present at load are born at 0.
  const svgBorn = new WeakMap();
  const register = () => {
    for (const an of document.getAnimations()) if (!born.has(an)) birth(an);
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
      if (!born.has(an)) birth(an);
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
      if (window.__captionsTick) window.__captionsTick(ms / 1000);
      await sync();
      if (document.fonts) await document.fonts.ready;
      return now;
    },
    get now() { return now; },
    // all cues + <audio src data-start> elements, for the final mix
    cues() {
      const media = [...document.querySelectorAll('audio[src]')].map((a) => ({
        src: a.currentSrc || a.src, at: parseFloat(a.dataset.start || '0'),
        gain: parseFloat(a.dataset.volume ?? a.volume ?? 1), pan: parseFloat(a.dataset.pan || '0'),
      }));
      return [...cues, ...media].sort((x, y) => x.at - y.at);
    },
  };
})();
`;

// ---------------------------------------------------------------- main
const input = args._[0];
const url = /^(https?|file|data):/.test(input) ? input : pathToFileURL(path.resolve(input)).href;
if (!/^(https?|data):/.test(url) && !fs.existsSync(new URL(url))) die(`Input not found: ${input}`);

let deps;
try { deps = await ensureDeps({ needFfmpeg: !args.stills || !!args.audio }); } catch (e) { die(e.message); }
const { chromium, ffmpeg } = deps;

// Image follows sound: analyze the music once, expose it to the page as window.__audio.
let audioData = null;
if (args.audio) {
  const file = path.resolve(args.audio);
  if (!fs.existsSync(file)) die(`Audio not found: ${args.audio}`);
  audioData = analyze(ffmpeg, file);
  if (args.beats) Object.assign(audioData, JSON.parse(fs.readFileSync(path.resolve(args.beats), 'utf8')));
  log(`♪ ${path.basename(file)}  ${audioData.bpm} BPM  ${audioData.beats.length} beats  ${audioData.onsets.length} onsets  → window.__audio`);
}

// Narration + subtitles: voice.json (from voice.mjs) and/or a subtitle file. Cues get word timings for karaoke.
let voice = null, captionData = null;
if (args.voice) {
  const f = path.resolve(args.voice);
  if (!fs.existsSync(f)) die(`Voice not found: ${args.voice}`);
  if (/\.json$/i.test(f)) {
    voice = JSON.parse(fs.readFileSync(f, 'utf8'));
    voice.file = path.resolve(path.dirname(f), voice.narration);
  } else voice = { file: f, lines: [], cues: [] }; // a bare recording: mixed, no timing data
  if (!fs.existsSync(voice.file)) die(`Narration audio missing: ${voice.file}`);
}
if (args.subs || voice?.cues?.length) {
  const cues = args.subs ? parseSubs(path.resolve(args.subs)) : voice.cues;
  captionData = { cues: cues.map((c) => ({ ...c, words: wordsOf(c) })), lines: voice?.lines ?? [] };
  log(`✎ ${cues.length} subtitle cue(s)${args.captions === 'off' ? ' (no overlay)' : ''}`);
}
const captionStyle = captionData ? (args.captions === true ? 'bottom' : args.captions || 'bottom') : 'off';
if (!['bottom', 'karaoke', 'center', 'off'].includes(captionStyle)) die(`Unknown --captions style: ${captionStyle} (bottom | karaoke | center | off)`);

const browser = await chromium.launch({ ...deps.browser.opts, args: LAUNCH_ARGS });

try {
  // 1. read composition config from <body data-*> / <html data-*>
  const probeCtx = await browser.newContext();
  await routeCdnToLocal(probeCtx, log);
  const probe = await probeCtx.newPage();
  await probe.goto(url, { waitUntil: 'domcontentloaded' });
  const meta = await probe.evaluate(() => ({ ...document.documentElement.dataset, ...document.body.dataset }));
  await probeCtx.close();

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
  await context.addInitScript({
    content: `globalThis.__realSetTimeout = setTimeout;\n` + VIRTUAL_TIME.replace('__SEED__', String(cfg.seed)) +
      (audioData ? AUDIO_API.replace('__DATA__', JSON.stringify(audioData)) : '') +
      (captionData ? CAPTIONS_API.replace('__DATA__', () => JSON.stringify(captionData)).replace('__STYLE__', JSON.stringify(captionStyle)) : ''),
  });
  await routeCdnToLocal(context, log);
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

    // video goes to a temp file first; audio is mixed once all cues are known, then muxed
    const videoOnly = out.replace(/(\.[^.]+)$/, '.video$1');
    const ff = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(captureFps), '-i', '-'];
    if (format === 'gif') ff.push('-filter_complex', `${vf.join(',')},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a`);
    else if (vf.length) ff.push('-vf', vf.join(','));
    ff.push(...codecArgs, '-r', String(format === 'gif' ? Math.min(cfg.fps, 30) : cfg.fps));
    ff.push(videoOnly);

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

    // Sound follows image: every cue was stamped with its exact virtual time during the render.
    const cues = args.noSfx ? [] : await page.evaluate(() => window.__vt.cues());
    if (args.cues) fs.writeFileSync(path.resolve(args.cues), JSON.stringify(cues, null, 1));
    const beds = args.audio ? [{ src: path.resolve(args.audio), at: 0, gain: num(args.audioGain, 1) }] : [];
    const voices = voice ? [{ src: voice.file, at: 0, gain: num(args.voiceGain, 1) }] : [];
    const wav = format === 'gif' ? null : mix({
      ffmpeg, duration: to - from, from, beds, voices, duck: args.duck === 'off' ? 0 : num(args.duck, -9),
      cues: cues.filter((c) => c.at < to),
      baseDir: /^file:/.test(url) ? path.dirname(fileURLToPath(url)) : process.cwd(),
      out: out.replace(/(\.[^.]+)$/, '.mix.wav'),
    });
    // Subtitle sidecars (.srt / .vtt) cut to the rendered range, so they match the video's own timeline.
    let srt = null;
    if (captionData && format !== 'gif') {
      const cut = captionData.cues.filter((c) => c.end > from && c.start < to)
        .map((c) => ({ ...c, start: Math.max(0, c.start - from), end: Math.min(to, c.end) - from, words: undefined }));
      const stem = out.replace(/\.[^.]+$/, '');
      fs.writeFileSync(`${stem}.srt`, toSrt(cut));
      fs.writeFileSync(`${stem}.vtt`, toVtt(cut));
      log(`✎ ${path.basename(stem)}.srt / .vtt`);
      if (args.embedSubs) {
        if (format === 'mov') log('⚠ --embed-subs: not supported for mov, sidecar files only');
        else srt = `${stem}.srt`;
      }
    }
    if (wav || srt) {
      const lufs = args.lufs === 'off' ? null : num(args.lufs, -14);
      const mux = ['-y', '-hide_banner', '-loglevel', 'error', '-i', videoOnly];
      if (wav) mux.push('-i', wav);
      if (srt) mux.push('-i', srt);
      mux.push('-map', '0:v');
      if (wav) mux.push('-map', '1:a');
      if (srt) mux.push('-map', `${wav ? 2 : 1}:s`);
      mux.push('-c:v', 'copy');
      if (wav) {
        if (lufs !== null) mux.push('-af', `loudnorm=I=${lufs}:TP=-1.5:LRA=11,aresample=48000`);
        mux.push('-c:a', { webm: 'libopus', mov: 'pcm_s16le' }[format] || 'aac', '-b:a', '192k');
      }
      if (srt) mux.push('-c:s', format === 'webm' ? 'webvtt' : 'mov_text', '-metadata:s:s:0', `language=${{ fr: 'fra', en: 'eng', es: 'spa', de: 'deu', it: 'ita', pt: 'por', nl: 'nld' }[voice?.lang] || 'und'}`);
      mux.push('-t', String(to - from), out);
      const r = spawnSync(ffmpeg, mux, { stdio: 'inherit' });
      if (r.status !== 0) die('ffmpeg mux failed');
      fs.rmSync(videoOnly); if (wav) fs.rmSync(wav);
      if (wav) log(`♪ ${cues.length} sound cue(s)${beds.length ? ' + music' : ''}${voices.length ? ' + voice' : ''} mixed${lufs !== null ? ` @ ${lufs} LUFS` : ''}`);
    } else fs.renameSync(videoOnly, out);

    const size = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
    log(`✔ ${out}  (${size} MB, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    console.log(out);
  }
} finally {
  await browser.close();
}
