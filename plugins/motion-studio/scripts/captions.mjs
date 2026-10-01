/**
 * motion-studio captions — subtitle cues: build, parse, export.
 *
 * A cue = { start, end, text, words: [{ w, start, end }] } (seconds, composition time).
 * Word timings are ESTIMATED from character counts inside the cue's time window —
 * accurate enough for karaoke highlighting of short sentences, not a forced alignment.
 *
 * Library use (voice.mjs, render.mjs): estimateWords, cuesFromLine, parseSubs, toSrt, toVtt.
 */
import fs from 'node:fs';

const END_PAUSE = /[.!?…]["»”)]*$/, SOFT_PAUSE = /[,;:–—]["»”)]*$/;

/** Relative duration of a word, plus the pause that follows punctuation (in "characters"). */
const weight = (w, last) => w.length + 2 + (last ? 0 : END_PAUSE.test(w) ? 6 : SOFT_PAUSE.test(w) ? 3 : 0);

/** Spread the words of `text` over [start, end] proportionally to their length. */
export function estimateWords(text, start, end) {
  const words = text.split(/\s+/).filter(Boolean);
  const ws = words.map((w, i) => weight(w, i === words.length - 1));
  const total = ws.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return words.map((w, i) => {
    const s = start + ((end - start) * acc) / total;
    acc += ws[i];
    return { w, start: +s.toFixed(3), end: +(start + ((end - start) * acc) / total).toFixed(3) };
  });
}

/**
 * Cut a spoken line into subtitle cues of at most `maxChars` characters, breaking
 * preferably after punctuation. Cues are contiguous (no flicker between two of them).
 */
export function cuesFromLine({ text, start, end }, { maxChars = 42, linger = 0.25 } = {}) {
  const words = estimateWords(text, start, end);
  // 1. sentences  2. each cut into balanced chunks (no orphan "page web."), preferably after a comma
  const sentences = [];
  let sent = [];
  for (const w of words) { sent.push(w); if (END_PAUSE.test(w.w)) { sentences.push(sent); sent = []; } }
  if (sent.length) sentences.push(sent);
  const groups = [];
  const span = (ws) => ws.reduce((n, w) => n + w.w.length + 1, -1);
  for (const sw of sentences) {
    let cur = [], len = 0, i = 0, target = 0;
    const retarget = () => { const rest = span(sw.slice(i)); target = rest / Math.ceil(rest / maxChars); };
    const flush = () => { if (cur.length) groups.push(cur); cur = []; len = 0; retarget(); };
    retarget();
    for (const w of sw) {
      const add = (cur.length ? 1 : 0) + w.w.length;
      if (cur.length && (len + add > maxChars || len + add > target * 1.2)) flush();
      cur.push(w); len += add; i++;
      if (SOFT_PAUSE.test(w.w) && len >= target * 0.6) flush();
    }
    flush();
  }
  return groups.map((g, i) => {
    const nextStart = groups[i + 1]?.[0].start;
    const e = nextStart !== undefined ? Math.min(nextStart, g.at(-1).end + 0.15) : g.at(-1).end + linger;
    return { start: g[0].start, end: +e.toFixed(3), text: g.map((x) => x.w).join(' '), words: g };
  });
}

/** Words of a cue (estimated when the cue has none, e.g. imported from an .srt). */
export const wordsOf = (c) => c.words?.length ? c.words : estimateWords(c.text.replace(/\s*\n\s*/g, ' '), c.start, c.end);

// ---------------------------------------------------------------- formats
const pad = (n, l = 2) => String(n).padStart(l, '0');
function stamp(t, sep) {
  const ms = Math.round(Math.max(0, t) * 1000);
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}${sep}${pad(ms % 1000, 3)}`;
}
/** Break a long cue over two balanced lines. */
function wrap(text, limit = 32) {
  if (text.includes('\n') || text.length <= limit) return text;
  const mid = text.length / 2;
  let best = -1;
  for (let i = 0; i < text.length; i++) if (text[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return best < 0 ? text : text.slice(0, best) + '\n' + text.slice(best + 1);
}
export const toSrt = (cues) => cues.map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${wrap(c.text)}\n`).join('\n');
export const toVtt = (cues) => 'WEBVTT\n\n' + cues.map((c) => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${wrap(c.text)}\n`).join('\n');

function parseTime(s) {
  const m = s.trim().match(/^(?:(\d+):)?(\d+):(\d+)(?:[.,](\d{1,3}))?$/);
  if (!m) return NaN;
  return (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3] + (m[4] ? +m[4].padEnd(3, '0') / 1000 : 0);
}

/** Read cues from .srt, .vtt, or .json (a cue array, or a voice.json with `cues`). */
export function parseSubs(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  if (/\.json$/i.test(file)) {
    const j = JSON.parse(raw);
    const arr = Array.isArray(j) ? j : j.cues;
    if (!Array.isArray(arr)) throw new Error(`${file}: expected a cue array or an object with "cues"`);
    return arr.map((c) => ({ ...c, start: c.start ?? c.at, end: c.end ?? (c.at + (c.dur ?? 2)), text: String(c.text) }));
  }
  const cues = [];
  for (const block of raw.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const [a, b] = lines[i].split('-->');
    const start = parseTime(a), end = parseTime(b.trim().split(/\s+/)[0]);
    const text = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').trim();
    if (Number.isFinite(start) && Number.isFinite(end) && text) cues.push({ start, end, text });
  }
  if (!cues.length) throw new Error(`${file}: no cue found`);
  return cues;
}
