#!/usr/bin/env node
// Lit musical de la vidéo Kaizen : sobre, avec beaucoup de silence (ma).
// Cordes pincées (Karplus-Strong) sur la gamme miyako-bushi en ré (ré, mi♭, sol, la, si♭),
// bourdon grave et tambour sourd sur les temps forts. Déterministe, sans dépendance.
//
//   node bed-ma.mjs --duration 61 --bpm 84 --start 9.1 -o <work>/bed.wav > <work>/bed.json
//
// Le JSON de sortie a le même format que `sfx.mjs bed` (beats exacts pour --beats).
import path from 'node:path';
import { SR, synth, writeWav } from '../../../../motion-studio/scripts/sfx.mjs';

const opts = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('-')) opts[argv[i].replace(/^--?/, '')] = argv[++i];
const duration = +(opts.duration ?? 61), bpm = +(opts.bpm ?? 84), start = +(opts.start ?? 9.1), out = opts.o ?? 'bed.wav';

const beat = 60 / bpm, bar = beat * 4, TAU = Math.PI * 2;
const L = new Float32Array(Math.round(duration * SR)), R = new Float32Array(L.length);
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

function add(mono, at, gain = 1, pan = 0) {
  const off = Math.round(at * SR), gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < mono.length && off + i < L.length; i++) if (off + i >= 0) { L[off + i] += mono[i] * gl; R[off + i] += mono[i] * gr; }
}

// corde pincée : bruit filtré dans une ligne à retard, attaque légèrement brillante
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

// bourdon : ré et la graves, battements lents, souffle filtré
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

// tambour sourd (attaque douce, longue résonance grave)
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

// phrases : [temps dans la mesure, degré] ; beaucoup de mesures restent presque vides
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

for (let b = 0, t0 = start; t0 < duration - 3; b++, t0 = start + b * bar) {
  // ma : pendant la constitution, le titre et la fin, on laisse respirer
  const dense = t0 > 17.5 && t0 < 47;
  const phrase = PHRASES[b % PHRASES.length];
  phrase.forEach(([pos, deg], k) => {
    if (!dense && k > 1) return;
    const at = t0 + pos * beat;
    add(pluck(SCALE[deg], 3.4, 0.4 + 0.3 * rnd()), at, 0.32 - k * 0.04, (rnd() - 0.5) * 0.6);
  });
  if (dense && b % 2 === 0) add(drum(), t0, 0.32, 0);
}

// cadence finale : ré grave et ré aigu, laissés résonner
add(pluck(50, 5, 0.6), 56.85, 0.4, -0.1);
add(pluck(62, 5, 0.5), 57.0, 0.3, 0.15);
add(drum(), 56.85, 0.35, 0);
add(synth('chime', { note: 74, dur: 4 }), 57.0, 0.12, 0.2);

const fo = Math.round(1.2 * SR);
for (let i = 0; i < fo; i++) { const g = i / fo; L[L.length - 1 - i] *= g; R[R.length - 1 - i] *= g; }
let peak = 0;
for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const norm = peak > 0.8 ? 0.8 / peak : 1;
for (let i = 0; i < L.length; i++) { L[i] *= norm; R[i] *= norm; }
writeWav(out, L, R);
console.log(JSON.stringify({ file: path.resolve(out), bpm, beats }));
