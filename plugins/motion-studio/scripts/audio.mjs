#!/usr/bin/env node
/**
 * motion-studio audio — analysis (image follows sound) and sample-accurate mixing
 * (sound follows image).
 *
 *   node audio.mjs analyze music.mp3 [--ffmpeg path]   → JSON { bpm, beats, onsets, rate, level[], bass[] }
 *
 * Library use (render.mjs): analyze(), mix().
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SR, SOUNDS, parseSpec, synth, writeWav } from './sfx.mjs';
import { ensureDeps } from './deps.mjs';

/** Decode any audio/video file to float32 PCM via ffmpeg. */
export function decode(ffmpeg, file, { sr = SR, channels = 2 } = {}) {
  const r = spawnSync(ffmpeg, ['-v', 'error', '-i', file, '-vn', '-f', 'f32le', '-ac', String(channels), '-ar', String(sr), '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${file}: ${r.stderr}`);
  const all = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength / 4);
  if (channels === 1) return [Float32Array.from(all)];
  const n = all.length / channels, out = Array.from({ length: channels }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < channels; c++) out[c][i] = all[i * channels + c];
  return out;
}

// ---------------------------------------------------------------- analysis
/**
 * Onsets (spectral-flux-like on full band + bass), tempo (autocorrelation with
 * a prior around 120 BPM), beat grid (phase that best matches the onsets) and
 * 100 Hz envelopes `level` / `bass` normalized to 0..1.
 */
export function analyze(ffmpeg, file) {
  const sr = 24000, rate = 100, hop = sr / rate; // integer hop (240 samples)
  const [x] = decode(ffmpeg, file, { sr, channels: 1 });
  const frames = Math.floor(x.length / hop);
  const level = new Float32Array(frames), bass = new Float32Array(frames);
  const a = 1 - Math.exp((-2 * Math.PI * 150) / sr);
  let l1 = 0, l2 = 0;
  for (let f = 0; f < frames; f++) {
    let e = 0, eb = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) { l1 += a * (x[i] - l1); l2 += a * (l1 - l2); e += x[i] * x[i]; eb += l2 * l2; }
    level[f] = Math.sqrt(e / hop); bass[f] = Math.sqrt(eb / hop);
  }
  // onset strength: positive log-energy derivative, full band + bass weighted
  const flux = new Float32Array(frames);
  for (let f = 1; f < frames; f++) {
    const d1 = Math.log1p(1000 * level[f]) - Math.log1p(1000 * level[f - 1]);
    const d2 = Math.log1p(1000 * bass[f]) - Math.log1p(1000 * bass[f - 1]);
    flux[f] = Math.max(0, d1) + 1.5 * Math.max(0, d2);
  }
  const mean = flux.reduce((s, v) => s + v, 0) / frames;
  const std = Math.sqrt(flux.reduce((s, v) => s + (v - mean) ** 2, 0) / frames);
  const onsets = [];
  for (let f = 3, last = -1e9; f < frames - 3; f++) {
    let isMax = true;
    for (let k = -5; k <= 5; k++) if (flux[f + k] > flux[f]) { isMax = false; break; }
    if (isMax && flux[f] > mean + 1.5 * std && f - last >= 10) { onsets.push(+(f / rate).toFixed(3)); last = f; }
  }
  // tempo: autocorrelation on 60..190 BPM with a log-gaussian prior at 120
  let bestLag = 50, bestScore = -Infinity;
  const score = (lag) => { let s = 0; for (let f = lag; f < frames; f++) s += flux[f] * flux[f - lag]; return s / (frames - lag); };
  for (let lag = Math.round((60 * rate) / 190); lag <= Math.round((60 * rate) / 60); lag++) {
    const bpm = (60 * rate) / lag, prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    const s = score(lag) * prior;
    if (s > bestScore) { bestScore = s; bestLag = lag; }
  }
  const s0 = score(bestLag - 1), s1 = score(bestLag), s2 = score(bestLag + 1);
  const curv = s0 - 2 * s1 + s2;
  const lag = bestLag + (curv ? (0.5 * (s0 - s2)) / curv : 0);
  const period = lag / rate, bpm = 60 / period;
  // phase: offset maximizing the onset strength on the grid
  let bestOff = 0, bestSum = -1;
  for (let off = 0; off < lag; off++) {
    let s = 0;
    for (let t = off; t < frames; t += lag) { const i = Math.round(t); s += Math.max(flux[i] || 0, flux[i - 1] || 0, flux[i + 1] || 0); }
    if (s > bestSum) { bestSum = s; bestOff = off; }
  }
  const first = onsets.length ? onsets[0] - period * 0.25 : 0;
  const beats = [];
  for (let t = bestOff / rate; t < x.length / sr; t += period) if (t >= first) beats.push(+t.toFixed(3));
  const norm = (arr) => { const s = [...arr].sort((p, q) => p - q), p95 = s[Math.floor(s.length * 0.95)] || 1; return Array.from(arr, (v) => +Math.min(1, v / p95).toFixed(3)); };
  return { bpm: +bpm.toFixed(2), beats, onsets, rate, duration: +(x.length / sr).toFixed(3), level: norm(level), bass: norm(bass) };
}

// ---------------------------------------------------------------- mixing
const panGains = (pan) => [Math.cos(((pan + 1) * Math.PI) / 4), Math.sin(((pan + 1) * Math.PI) / 4)];

/** Resolve a cue source to a local path (file:// URL, absolute, or relative to baseDir). */
function resolveSrc(src, baseDir) {
  if (src.startsWith('file://')) return fileURLToPath(src);
  if (/^(https?|data|blob):/.test(src)) return src; // ffmpeg can read http(s)
  return path.resolve(baseDir, src);
}

/**
 * Mix beds (whole files) and cues (synth names or files) sample-accurately.
 * cue = { src, at (s, composition time), gain, pan, align: 'start'|'end' }.
 * voices = narration tracks (same shape as beds). They sit on top of the mix and DUCK the beds
 * (music) by `duck` dB while speech is present (set duck = 0 to disable).
 * Returns the written WAV path, or null when there is nothing to mix.
 */
export function mix({ ffmpeg, duration, from = 0, beds = [], cues = [], voices = [], duck = -9, baseDir = process.cwd(), out }) {
  if (!beds.length && !cues.length && !voices.length) return null;
  const n = Math.round(duration * SR), L = new Float32Array(n), R = new Float32Array(n);
  const VL = new Float32Array(n), VR = new Float32Array(n);
  let target = [L, R];
  const place = (chans, at, gain, pan) => {
    const [gl, gr] = panGains(Math.max(-1, Math.min(1, pan || 0)));
    const left = chans[0], right = chans[1] || chans[0];
    const off = Math.round((at - from) * SR);
    for (let i = Math.max(0, -off); i < left.length && off + i < n; i++) { target[0][off + i] += left[i] * gain * gl * Math.SQRT2; target[1][off + i] += right[i] * gain * gr * Math.SQRT2; }
  };
  const cache = new Map();
  const load = (src) => {
    if (!cache.has(src)) {
      const { name, params } = parseSpec(src);
      cache.set(src, SOUNDS[name] ? [synth(name, params)] : decode(ffmpeg, resolveSrc(src, baseDir)));
    }
    return cache.get(src);
  };
  for (const b of beds) place(load(b.src), b.at || 0, b.gain ?? 1, b.pan ?? 0);
  for (const c of cues) {
    const { params } = parseSpec(c.src);
    const chans = load(c.src);
    const align = c.align || params.align || 'start';
    const at = align === 'end' ? c.at - chans[0].length / SR : c.at;
    place(chans, at, (c.gain ?? 1) * Number(params.gain ?? 1), c.pan ?? Number(params.pan ?? 0));
  }
  if (voices.length) {
    target = [VL, VR];
    for (const v of voices) place(load(v.src), v.at || 0, v.gain ?? 1, v.pan ?? 0);
    // sidechain-style ducking: speech envelope (fast attack, slow release) lowers music + sfx
    const floor = Math.pow(10, duck / 20), atk = Math.exp(-1 / (0.03 * SR)), rel = Math.exp(-1 / (0.35 * SR));
    let env = 0;
    for (let i = 0; i < n; i++) {
      const x = Math.min(1, Math.max(Math.abs(VL[i]), Math.abs(VR[i])) * 6);
      env = x > env ? x + (env - x) * atk : x + (env - x) * rel;
      const g = 1 - (1 - floor) * env;
      L[i] = L[i] * g + VL[i]; R[i] = R[i] * g + VR[i];
    }
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  if (peak > 0.95) { const g = 0.95 / peak; for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; } }
  writeWav(out, L, R);
  return out;
}

// ---------------------------------------------------------------- CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [cmd, file, ...rest] = process.argv.slice(2);
  if (cmd !== 'analyze' || !file) { console.log('usage: node audio.mjs analyze <music> [--ffmpeg path]'); process.exit(1); }
  const i = rest.indexOf('--ffmpeg');
  const ffmpeg = i >= 0 ? rest[i + 1] : (await ensureDeps({ needBrowser: false })).ffmpeg;
  if (!fs.existsSync(file)) { console.error(`not found: ${file}`); process.exit(1); }
  const r = analyze(ffmpeg, file);
  console.log(JSON.stringify({ ...r, level: `[${r.level.length} values @${r.rate}Hz]`, bass: `[${r.bass.length} values @${r.rate}Hz]` }, null, 1));
}
