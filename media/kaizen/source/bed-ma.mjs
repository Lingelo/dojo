#!/usr/bin/env node
// Music bed of the Kaizen video: sober, with a lot of silence (ma).
// Plucked strings (Karplus-Strong) on the miyako-bushi scale in D (D, E♭, G, A, B♭),
// a low drone and a muffled drum on the strong beats. Deterministic, no dependency.
//
//   node bed-ma.mjs --bpm 84 -o <work>/bed.wav > <work>/bed.json
//
// Markers (--start, --dense-from/--dense-to, --end) are in story time, like the composition: they go
// through the same table (timeline.js) to land in real time, so the cadence follows the picture.
// The output JSON has the same format as `sfx.mjs bed` (exact beats for --beats).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { SR, synth, writeWav } from '../../../plugins/motion-studio/scripts/sfx.mjs';

const tl = {};
vm.runInNewContext(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'timeline.js'), 'utf8'), tl);
const { realAt, DUR } = tl.__timeline;

const opts = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('-')) opts[argv[i].replace(/^--?/, '')] = argv[++i];
const num = (k, d) => { const v = +(opts[k] ?? d); if (!Number.isFinite(v)) { console.error(`bed-ma: --${k} must be a number`); process.exit(1); } return v; };
// story-time markers: title (music enters), busy middle of the cycle, ensō of the end (final cadence)
const bpm = num('bpm', 84), start = realAt(num('start', 9.1)), out = opts.o ?? 'bed.wav';
const denseFrom = realAt(num('dense-from', 17.5)), denseTo = realAt(num('dense-to', 47)), end = realAt(num('end', 56.85));
const duration = +DUR.toFixed(2);

const beat = 60 / bpm, bar = beat * 4, TAU = Math.PI * 2;
const L = new Float32Array(Math.round(duration * SR)), R = new Float32Array(L.length);
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

function add(mono, at, gain = 1, pan = 0) {
  const off = Math.round(at * SR), gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < mono.length && off + i < L.length; i++) if (off + i >= 0) { L[off + i] += mono[i] * gl; R[off + i] += mono[i] * gr; }
}

// plucked string: noise filtered through a delay line, slightly bright attack
function pluck(note, dur = 3.2, bright = 0.5) {
  const n = Math.round(dur * SR), o = new Float32Array(n), period = SR / midi(note);
  const len = Math.floor(period), frac = period - len, line = new Float32Array(len + 2);
  for (let i = 0; i < line.length; i++) line[i] = (rnd() * 2 - 1) * (0.6 + 0.4 * bright);
  let idx = 0, prev = 0;
  const damp = 0.996 - 0.004 * (note - 60) / 24;
  for (let i = 0; i < n; i++) {
    const a = line[idx], b = line[(idx + 1) % len];
    const y = (a * (1 - frac) + b * frac);
    const v = damp * (0.5 * (y + prev));
    prev = y;
    line[idx] = v;
    idx = (idx + 1) % len;
    o[i] = y * Math.min(1, i / 40) * Math.min(1, (n - i) / 2000);
  }
  return o;
}

// drone: low D and A, slow beating, filtered breath
function drone(dur) {
  const n = Math.round(dur * SR), o = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const swell = 0.55 + 0.45 * Math.sin(TAU * t / 11 - 1.2);
    const s = Math.sin(TAU * midi(38) * t) * 0.5 + Math.sin(TAU * midi(38) * 1.003 * t) * 0.35 + Math.sin(TAU * midi(45) * t) * 0.28;
    lp += 0.002 * ((rnd() * 2 - 1) - lp);
    o[i] = (s * 0.16 + lp * 0.9) * swell * Math.min(1, t / 3) * Math.min(1, (dur - t) / 2.5);
  }
  return o;
}

// muffled drum (soft attack, long low resonance)
function drum() {
  const n = Math.round(1.6 * SR), o = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += TAU * (62 + 40 * Math.exp(-t / 0.05)) / SR;
    o[i] = Math.sin(ph) * Math.exp(-t / 0.42) * Math.min(1, t / 0.004) * 0.9;
  }
  return o;
}

add(drone(duration), 0, 0.9);

// phrases: [beat in the bar, degree]; many bars stay almost empty
const SCALE = [62, 63, 67, 69, 70, 74, 75, 79, 81];
const PHRASES = [
  [[0, 3], [1.5, 2], [3, 0]],
  [[0, 4], [2, 3]],
  [[0, 5], [1, 4], [1.5, 3], [3, 2]],
  [[0, 1], [2.5, 0]],
  [[0, 3], [1, 5], [2, 4]],
  [[0, 2]],
  [[0, 6], [1.5, 5], [2, 3], [3, 4]],
  [[0, 0], [3, 2]],
];
const beats = [];
for (let t = start; t < duration - 0.05; t += beat) beats.push(+t.toFixed(4));

// phrases stop a bar before the cadence so it rings alone
for (let b = 0, t0 = start; t0 < end - bar; b++, t0 = start + b * bar) {
  // ma: during the constitution, the title and the end, let it breathe
  const dense = t0 > denseFrom && t0 < denseTo;
  const phrase = PHRASES[b % PHRASES.length];
  phrase.forEach(([pos, deg], k) => {
    if (!dense && k > 1) return;
    const at = t0 + pos * beat;
    add(pluck(SCALE[deg], 3.4, 0.4 + 0.3 * rnd()), at, 0.32 - k * 0.04, (rnd() - 0.5) * 0.6);
  });
  if (dense && b % 2 === 0) add(drum(), t0, 0.32, 0);
}

// final cadence: low D and high D, left to ring
add(pluck(50, 5, 0.6), end, 0.4, -0.1);
add(pluck(62, 5, 0.5), end + 0.15, 0.3, 0.15);
add(drum(), end, 0.35, 0);
add(synth('chime', { note: 74, dur: 4 }), end + 0.15, 0.12, 0.2);

const fo = Math.round(1.2 * SR);
for (let i = 0; i < fo; i++) { const g = i / fo; L[L.length - 1 - i] *= g; R[R.length - 1 - i] *= g; }
let peak = 0;
for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const norm = peak > 0.8 ? 0.8 / peak : 1;
for (let i = 0; i < L.length; i++) { L[i] *= norm; R[i] *= norm; }
writeWav(out, L, R);
console.log(JSON.stringify({ file: path.resolve(out), bpm, beats }));
