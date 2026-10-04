#!/usr/bin/env node
/**
 * motion-studio sfx — procedural sound design, zero dependencies, deterministic.
 *
 *   node sfx.mjs list
 *   node sfx.mjs <name> [--param value ...] -o out.wav
 *   node sfx.mjs bed --bpm 120 --duration 8 --start 2 -o bed.wav
 *
 * Every sound is synthesized from code (oscillators, seeded noise, filters,
 * envelopes) so a video never depends on licensed sample packs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SR = 48000;

// ---------------------------------------------------------------- DSP helpers
const TAU = Math.PI * 2;
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1; };
}
const buf = (sec) => new Float32Array(Math.max(1, Math.round(sec * SR)));
const expEnv = (t, attack, decay) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));
const lerp = (a, b, x) => a + (b - a) * x;
const expLerp = (a, b, x) => a * Math.pow(b / a, x);
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

/** Chamberlin state-variable filter; returns {lp, bp, hp} per sample. */
function svf() {
  let lp = 0, bp = 0;
  return (x, freq, q = 0.7) => {
    const f = 2 * Math.sin(Math.PI * Math.min(freq, SR / 6) / SR);
    const hp = x - lp - bp / q;
    bp += f * hp; lp += f * bp;
    return { lp, bp, hp };
  };
}
function onePoleLP(freq) { let y = 0; const a = 1 - Math.exp(-TAU * freq / SR); return (x) => (y += a * (x - y)); }

// ---------------------------------------------------------------- sound library
// Each generator: (params) => Float32Array (mono). Params are numbers (strings coerced).
export const SOUNDS = {
  pop: { desc: 'Bubble / appearance (UI, icon, logo)', params: { pitch: 1, dur: 0.18 }, gen: ({ pitch, dur }) => {
    const o = buf(dur); let ph = 0;
    for (let i = 0; i < o.length; i++) { const t = i / SR; ph += TAU * expLerp(900 * pitch, 260 * pitch, Math.min(1, t / 0.07)) / SR; o[i] = Math.sin(ph) * expEnv(t, 0.002, 0.045); }
    return o; } },

  tick: { desc: 'Dry tick (letters, counters, stagger)', params: { pitch: 1, dur: 0.05 }, gen: ({ pitch, dur }) => {
    const o = buf(dur), n = rng(7), f = svf(); let ph = 0;
    for (let i = 0; i < o.length; i++) { const t = i / SR; ph += TAU * 2400 * pitch / SR; o[i] = (0.5 * Math.sin(ph) + 0.6 * f(n(), 5000 * pitch, 2).bp) * expEnv(t, 0.0005, 0.008); }
    return o; } },

  click: { desc: 'Interface click (button, cursor)', params: { pitch: 1, dur: 0.04 }, gen: ({ pitch, dur }) => {
    const o = buf(dur), n = rng(3), f = svf();
    for (let i = 0; i < o.length; i++) { const t = i / SR; o[i] = f(n(), 3200 * pitch, 4).bp * 1.6 * expEnv(t, 0.0003, 0.004) + Math.sin(TAU * 1100 * pitch * t) * 0.3 * expEnv(t, 0.0003, 0.01); }
    return o; } },

  whoosh: { desc: 'Passing whoosh (transition, element crossing)', params: { dur: 0.6, from: 300, to: 3500, seed: 11 }, gen: ({ dur, from, to, seed }) => {
    const o = buf(dur), n = rng(seed), f = svf();
    for (let i = 0; i < o.length; i++) { const x = i / o.length; const env = Math.pow(Math.sin(Math.PI * Math.pow(x, 0.7)), 2); o[i] = f(n(), expLerp(from, to, x), 1.8).bp * env * 2.2; }
    return o; } },

  swoosh: { desc: 'Falling whoosh (exit, closing)', params: { dur: 0.5, seed: 12 }, gen: ({ dur, seed }) => SOUNDS.whoosh.gen({ dur, from: 4000, to: 250, seed }) },

  riser: { desc: 'Tension rise (ends on the cue with align=end)', params: { dur: 2, from: 150, to: 2400, seed: 5 }, gen: ({ dur, from, to, seed }) => {
    const o = buf(dur), n = rng(seed), f = svf(); let ph1 = 0, ph2 = 0;
    for (let i = 0; i < o.length; i++) {
      const x = i / o.length, fr = expLerp(from, to, x * x);
      ph1 += TAU * fr / SR; ph2 += TAU * fr * 1.007 / SR;
      const saw = ((ph1 / TAU) % 1) * 2 - 1 + (((ph2 / TAU) % 1) * 2 - 1);
      const env = Math.pow(x, 2.2) * (1 - Math.pow(Math.max(0, (x - 0.985) / 0.015), 2));
      o[i] = (f(saw * 0.25 + n() * 0.6, fr * 2.5, 1.2).lp) * env * 1.4;
    }
    return o; } },

  impact: { desc: 'Deep cinematic impact (reveal, logo, drop)', params: { dur: 1.6, seed: 9 }, gen: ({ dur, seed }) => {
    const o = buf(dur), n = rng(seed), lp = onePoleLP(900); let ph = 0;
    for (let i = 0; i < o.length; i++) {
      const t = i / SR; ph += TAU * expLerp(110, 38, Math.min(1, t / 0.4)) / SR;
      o[i] = Math.tanh(1.8 * Math.sin(ph) * expEnv(t, 0.002, 0.45)) * 0.9 + lp(n()) * 2.2 * expEnv(t, 0.001, 0.12);
    }
    return o; } },

  chime: { desc: 'Crystal chime (success, tagline, CTA)', params: { note: 81, dur: 1.8 }, gen: ({ note, dur }) => {
    const o = buf(dur), f0 = midi(note), partials = [[1, 1, 0.9], [2.76, 0.45, 0.5], [5.4, 0.25, 0.28], [8.93, 0.12, 0.16]];
    for (let i = 0; i < o.length; i++) { const t = i / SR; let s = 0; for (const [r, a, d] of partials) s += Math.sin(TAU * f0 * r * t) * a * expEnv(t, 0.002, d); o[i] = s * 0.55; }
    return o; } },

  glitch: { desc: 'Short digital glitch', params: { dur: 0.25, seed: 21 }, gen: ({ dur, seed }) => {
    const o = buf(dur), n = rng(seed); let hold = 0, v = 0;
    for (let i = 0; i < o.length; i++) { if (hold-- <= 0) { hold = 40 + ((n() + 1) * 400) | 0; v = n() > 0.2 ? Math.sign(n()) * 0.5 : 0; } o[i] = v * (1 - i / o.length); }
    return o; } },

  kick: { desc: 'Kick drum', params: { dur: 0.45 }, gen: ({ dur }) => {
    const o = buf(dur); let ph = 0;
    for (let i = 0; i < o.length; i++) { const t = i / SR; ph += TAU * expLerp(160, 48, Math.min(1, t / 0.06)) / SR; o[i] = Math.tanh(2 * Math.sin(ph) * expEnv(t, 0.001, 0.16)) * 0.9; }
    return o; } },

  hat: { desc: 'Closed hi-hat', params: { dur: 0.06, seed: 4 }, gen: ({ dur, seed }) => {
    const o = buf(dur), n = rng(seed), f = svf();
    for (let i = 0; i < o.length; i++) { const t = i / SR; o[i] = f(n(), 9000, 0.9).hp * 0.35 * expEnv(t, 0.0005, 0.015); }
    return o; } },

  pad: { desc: 'Pad (sustained chord) — note = MIDI root', params: { note: 50, dur: 4, minor: 1 }, gen: ({ note, dur, minor }) => {
    const o = buf(dur), notes = [0, minor ? 3 : 4, 7, 12].map((x) => midi(note + x)), f = svf();
    const ph = notes.flatMap(() => [0, 0]);
    for (let i = 0; i < o.length; i++) {
      const t = i / SR; let s = 0;
      notes.forEach((fr, k) => { for (const d of [0, 1]) { const j = k * 2 + d; ph[j] += fr * (d ? 1.004 : 0.996) / SR; s += ((ph[j] % 1) * 2 - 1); } });
      const env = Math.min(1, t / 0.8) * Math.min(1, (dur - t) / 0.8);
      o[i] = f(s * 0.08, 700 + 400 * Math.sin(TAU * 0.15 * t), 0.9).lp * env;
    }
    return o; } },
};

/** Parse "pop?pitch=1.2&dur=.3" → { name, params }. */
export function parseSpec(spec) {
  const [name, query = ''] = String(spec).split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  return { name, params };
}

/** Synthesize a named sound with params (strings accepted) → mono Float32Array. */
export function synth(name, params = {}) {
  const def = SOUNDS[name];
  if (!def) throw new Error(`Unknown sound "${name}". Available: ${Object.keys(SOUNDS).join(', ')}`);
  const p = { ...def.params };
  for (const [k, v] of Object.entries(params)) if (k in p) p[k] = Number(v);
  const out = def.gen(p);
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0.9) for (let i = 0; i < out.length; i++) out[i] *= 0.9 / peak; // headroom, never louder
  return out;
}

/**
 * Music bed on a strict tempo grid: pad from 0, drums + bass from `start`.
 * Returns { left, right, beats } where beats are the exact beat times (s).
 */
export function bed({ bpm = 120, duration = 8, start = 0, root = 45, fadeOut = 0.8 } = {}) {
  const L = buf(duration), R = buf(duration), beat = 60 / bpm, bar = beat * 4;
  const add = (mono, at, gain = 1, pan = 0) => {
    const off = Math.round(at * SR), gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
    for (let i = 0; i < mono.length && off + i < L.length; i++) if (off + i >= 0) { L[off + i] += mono[i] * gl; R[off + i] += mono[i] * gr; }
  };
  const prog = [0, -4, 3, -2]; // i – VI – III – VII
  for (let b = 0, t = 0; t < duration; b++, t = b * bar) add(synth('pad', { note: root + 12 + prog[b % 4], dur: bar + 0.8, minor: prog[b % 4] === 0 ? 1 : 0 }), t, 0.55, 0);
  const beats = [];
  for (let t = start; t < duration - 0.05; t += beat) {
    beats.push(+t.toFixed(4));
    add(synth('kick'), t, 0.9);
    add(synth('hat', { seed: beats.length }), t + beat / 2, 0.5, 0.3);
    const b = Math.floor((t - start) / bar);
    const bass = buf(beat * 0.9); const f = midi(root - 12 + prog[b % 4]);
    for (let i = 0; i < bass.length; i++) { const x = i / SR; bass[i] = Math.tanh(2.5 * Math.sin(TAU * f * x)) * 0.35 * Math.min(1, x / 0.005) * Math.exp(-x / 0.25); }
    add(bass, t + beat * 0.02, 1);
  }
  const fo = Math.round(fadeOut * SR);
  for (let i = 0; i < fo; i++) { const g = i / fo; L[L.length - 1 - i] *= g; R[R.length - 1 - i] *= g; }
  return { left: L, right: R, beats, bpm };
}

// ---------------------------------------------------------------- WAV I/O
export function writeWav(file, left, right = left) {
  const n = left.length, data = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), i * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([h, data]));
}

// ---------------------------------------------------------------- CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [cmd, ...rest] = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('-')) opts[rest[i].replace(/^--?/, '')] = rest[i + 1]?.startsWith('-') ? true : rest[++i];
  const out = opts.o || opts.out || `${cmd}.wav`;
  if (!cmd || cmd === 'list' || cmd === 'help') {
    console.log('Available sounds (node sfx.mjs <name> [--param v] -o out.wav):\n');
    for (const [k, v] of Object.entries(SOUNDS)) console.log(`  ${k.padEnd(8)} ${v.desc}\n  ${' '.repeat(8)} params: ${Object.entries(v.params).map(([a, b]) => `${a}=${b}`).join(' ')}`);
    console.log('\n  bed      Music on a tempo grid: --bpm 120 --duration 8 --start 0 --root 45 (beats JSON on stdout)');
  } else if (cmd === 'bed') {
    const b = bed({ bpm: +(opts.bpm ?? 120), duration: +(opts.duration ?? 8), start: +(opts.start ?? 0), root: +(opts.root ?? 45) });
    writeWav(out, b.left, b.right);
    console.log(JSON.stringify({ file: path.resolve(out), bpm: b.bpm, beats: b.beats }));
  } else {
    const { o, out: _o, ...params } = opts;
    const mono = synth(cmd, params);
    writeWav(out, mono);
    console.log(path.resolve(out));
  }
}
