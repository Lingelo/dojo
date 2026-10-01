#!/usr/bin/env node
/**
 * motion-studio voice — narration (text-to-speech) + subtitles, timed.
 *
 *   node voice.mjs engines
 *   node voice.mjs <script.json|script.txt> -o <dir> [--engine auto|say|sapi|piper|espeak|file]
 *                  [--lang fr] [--voice name] [--rate 1] [--gap 0.35] [--start 0.4] [--max-chars 42]
 *
 * script.json : { "lang": "fr", "voice": "Thomas", "rate": 1, "gap": 0.35, "start": 0.4,
 *                 "lines": [ "Une phrase.", { "text": "Autre", "at": 4.2, "pause": 0.6, "file": "ma-voix.wav" } ] }
 * script.txt  : one line of narration per non-empty line.
 *
 * Writes into <dir>: line-NN-<hash>.wav (cached), narration.wav (whole track, placed on the
 * timeline), voice.json (timeline + subtitle cues), subs.srt, subs.vtt. The line timings are the
 * REAL durations of the audio → build the storyboard on them, then render with `--voice voice.json`.
 *
 * Engines are local (no API, no key): macOS `say`, Windows SAPI, Piper (PIPER_MODEL), eSpeak NG.
 * A line with "file" uses your own recording (any voice / service) instead of synthesizing.
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SR, writeWav } from './sfx.mjs';
import { decode } from './audio.mjs';
import { cuesFromLine, toSrt, toVtt } from './captions.mjs';
import { ensureDeps } from './deps.mjs';

const probe = (cmd, args) => { const r = spawnSync(cmd, args, { stdio: 'ignore' }); return !r.error; };

const SAY_VOICES = { fr: 'Thomas', en: 'Samantha', es: 'Monica', de: 'Anna', it: 'Alice', pt: 'Joana', nl: 'Xander' };
const POWERSHELL = String.raw`Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
if ($env:MS_VOICE) { $s.SelectVoice($env:MS_VOICE) }
elseif ($env:MS_LANG) { $v = $s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.TwoLetterISOLanguageName -eq $env:MS_LANG } | Select-Object -First 1; if ($v) { $s.SelectVoice($v.VoiceInfo.Name) } }
$s.Rate = [int]$env:MS_RATE
$s.SetOutputToWaveFile($env:MS_OUT)
$s.Speak([IO.File]::ReadAllText($env:MS_TEXT, [Text.Encoding]::UTF8))
$s.Dispose()`;

/** Each engine: available() and speak({ text, lang, voice, rate, out, tmp }) → writes an audio file at `out`. */
const ENGINES = {
  say: {
    label: 'macOS say',
    available: () => process.platform === 'darwin' && probe('say', ['-v', '?']),
    speak({ text, lang, voice, rate, out, tmp }) {
      const f = path.join(tmp, 'text.txt'); fs.writeFileSync(f, text);
      const args = (v) => [...(v ? ['-v', v] : []), '-r', String(Math.round(175 * rate)), '-o', out, '-f', f];
      let r = spawnSync('say', args(voice || SAY_VOICES[lang]), { encoding: 'utf8' });
      if (r.status !== 0 && !voice) r = spawnSync('say', args(null), { encoding: 'utf8' }); // voice not installed → system default
      return r.status === 0 ? null : r.stderr || 'say failed';
    },
    ext: 'aiff',
  },
  sapi: {
    label: 'Windows SAPI',
    available: () => process.platform === 'win32' && probe('powershell', ['-NoProfile', '-Command', 'exit 0']),
    speak({ text, lang, voice, rate, out, tmp }) {
      const f = path.join(tmp, 'text.txt'); fs.writeFileSync(f, text);
      const env = { ...process.env, MS_TEXT: f, MS_OUT: out, MS_LANG: lang, MS_VOICE: voice || '', MS_RATE: String(Math.max(-10, Math.min(10, Math.round((rate - 1) * 10)))) };
      const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', POWERSHELL], { env, encoding: 'utf8' });
      return r.status === 0 ? null : r.stderr || 'SAPI failed';
    },
    ext: 'wav',
  },
  piper: {
    label: 'Piper (neural, PIPER_MODEL)',
    available: () => !!process.env.PIPER_MODEL && fs.existsSync(process.env.PIPER_MODEL) && probe(process.env.PIPER_BIN || 'piper', ['--help']),
    speak({ text, rate, out }) {
      const r = spawnSync(process.env.PIPER_BIN || 'piper', ['--model', process.env.PIPER_MODEL, '--length_scale', String(1 / rate), '--output_file', out], { input: text, encoding: 'utf8' });
      return r.status === 0 ? null : r.stderr || 'piper failed';
    },
    ext: 'wav',
  },
  espeak: {
    label: 'eSpeak NG (robotique, solution de repli)',
    bin: () => ['espeak-ng', 'espeak'].find((b) => probe(b, ['--version'])),
    available() { return !!this.bin(); },
    speak({ text, lang, voice, rate, out, tmp }) {
      const f = path.join(tmp, 'text.txt'); fs.writeFileSync(f, text);
      const r = spawnSync(this.bin(), ['-v', voice || lang, '-s', String(Math.round(165 * rate)), '-g', '3', '-w', out, '-f', f], { encoding: 'utf8' });
      return r.status === 0 ? null : r.stderr || 'espeak failed';
    },
    ext: 'wav',
  },
};

export const detectEngines = () => Object.entries(ENGINES).filter(([, e]) => e.available()).map(([k]) => k);

const INSTALL_HINT = `Aucun moteur de synthèse vocale local détecté.
  • Linux   : sudo apt install espeak-ng      (qualité robotique)   ou  Piper + PIPER_MODEL=/chemin/voix.onnx  (voix neuronale, recommandé)
  • macOS   : « say » est préinstallé
  • Windows : SAPI est préinstallé (PowerShell)
  • Sinon   : enregistrer la voix soi-même ou avec n'importe quel service, puis la référencer avec "file" dans le script.`;

/** Trim near-silence at both ends (TTS engines pad their output) so line timings are tight. */
function trim(x, { lead = 0.03, tail = 0.08, thr = 0.01 } = {}) {
  let a = 0, b = x.length - 1;
  while (a < b && Math.abs(x[a]) < thr) a++;
  while (b > a && Math.abs(x[b]) < thr) b--;
  return x.subarray(Math.max(0, a - Math.round(lead * SR)), Math.min(x.length, b + 1 + Math.round(tail * SR)));
}

/**
 * Build narration from a script. Returns { voice (the voice.json object), narrationPath, ... }.
 * `ffmpeg` decodes whatever the engine produced (aiff, wav, user recordings).
 */
export function buildVoice({ script, outDir, ffmpeg, baseDir = process.cwd(), engine = 'auto', log = () => {} }) {
  const lang = script.lang || 'fr';
  const rate = Number(script.rate ?? 1);
  const gap = Number(script.gap ?? 0.35);
  const maxChars = Number(script.maxChars ?? 42);
  const lines = script.lines.map((l) => (typeof l === 'string' ? { text: l } : l));
  if (!lines.length) throw new Error('script: "lines" is empty');

  const needSynth = lines.some((l) => !l.file);
  let eng = null;
  if (needSynth) {
    const found = detectEngines();
    const name = engine === 'auto' ? found[0] : engine;
    if (!name || !ENGINES[name]) throw new Error(INSTALL_HINT);
    if (!ENGINES[name].available()) throw new Error(`Moteur « ${name} » indisponible sur cette machine.\n${INSTALL_HINT}`);
    eng = name;
    log(`🎙 moteur : ${ENGINES[name].label}${found.length > 1 ? `  (autres : ${found.filter((f) => f !== name).join(', ')})` : ''}`);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-voice-'));
  const placed = [];
  let cursor = Number(script.start ?? 0.4);
  try {
    lines.forEach((l, i) => {
      const text = String(l.text ?? '').trim();
      if (!text && !l.file) throw new Error(`script line ${i + 1}: no "text"`);
      const lineRate = Number(l.rate ?? rate), voice = l.voice ?? script.voice;
      let mono;
      let file;
      if (l.file) {
        mono = trim(decode(ffmpeg, path.resolve(baseDir, l.file), { channels: 1 })[0]);
      } else {
        const hash = crypto.createHash('sha1').update(JSON.stringify([eng, lang, voice, lineRate, text])).digest('hex').slice(0, 8);
        file = path.join(outDir, `line-${String(i + 1).padStart(2, '0')}-${hash}.wav`);
        if (!fs.existsSync(file)) {
          const raw = path.join(tmp, `raw-${i}.${ENGINES[eng].ext}`);
          const err = ENGINES[eng].speak({ text, lang, voice, rate: lineRate, out: raw, tmp });
          if (err || !fs.existsSync(raw)) throw new Error(`TTS failed on line ${i + 1} (« ${text.slice(0, 40)}… ») : ${err}`);
          writeWav(file, trim(decode(ffmpeg, raw, { channels: 1 })[0]));
        }
        mono = decode(ffmpeg, file, { channels: 1 })[0];
      }
      const dur = mono.length / SR;
      const start = l.at !== undefined ? Number(l.at) : cursor;
      const prev = placed.at(-1);
      if (l.at !== undefined && prev && start < prev.end - 1e-6) log(`⚠ ligne ${i + 1} : "at" ${start}s chevauche la ligne précédente (finit à ${prev.end}s)`);
      placed.push({ id: l.id || `l${i + 1}`, text: text || l.caption || '', caption: l.caption, start: +start.toFixed(3), end: +(start + dur).toFixed(3), mono, file: file && path.basename(file) });
      cursor = start + dur + Number(l.pause ?? gap);
    });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }

  // whole narration, placed on the timeline (one WAV → the renderer mixes and ducks it)
  const total = Math.max(...placed.map((p) => p.end)) + 0.3;
  const track = new Float32Array(Math.ceil(total * SR));
  for (const p of placed) track.set(p.mono, Math.round(p.start * SR));
  writeWav(path.join(outDir, 'narration.wav'), track);

  const cues = placed.flatMap((p) => (p.text ? cuesFromLine({ text: p.caption ?? p.text, start: p.start, end: p.end }, { maxChars }) : []));
  const voice = {
    lang, engine: eng || 'file', duration: +total.toFixed(3), narration: 'narration.wav',
    lines: placed.map(({ mono, ...p }) => p), cues,
  };
  fs.writeFileSync(path.join(outDir, 'voice.json'), JSON.stringify(voice, null, 1));
  fs.writeFileSync(path.join(outDir, 'subs.srt'), toSrt(cues));
  fs.writeFileSync(path.join(outDir, 'subs.vtt'), toVtt(cues));
  return voice;
}

// ---------------------------------------------------------------- CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  const opt = {}, pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--home') { i++; continue; }
    if (argv[i].startsWith('-')) opt[argv[i].replace(/^--?/, '')] = argv[++i]; else pos.push(argv[i]);
  }
  if (pos[0] === 'engines') {
    const found = detectEngines();
    for (const [k, e] of Object.entries(ENGINES)) console.log(`${found.includes(k) ? '✔' : '✖'} ${k.padEnd(7)} ${e.label}`);
    if (!found.length) console.log('\n' + INSTALL_HINT);
    process.exit(found.length ? 0 : 1);
  }
  if (!pos[0] || !fs.existsSync(pos[0])) {
    console.error('usage: node voice.mjs <script.json|script.txt> -o <dir> [--engine auto|say|sapi|piper|espeak] [--lang fr] [--voice v] [--rate 1] [--gap .35] [--start .4] [--max-chars 42]\n       node voice.mjs engines');
    process.exit(1);
  }
  const raw = fs.readFileSync(pos[0], 'utf8');
  const script = /\.json$/i.test(pos[0]) ? JSON.parse(raw) : { lines: raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) };
  for (const [k, v] of Object.entries({ lang: opt.lang, voice: opt.voice, rate: opt.rate, gap: opt.gap, start: opt.start, maxChars: opt['max-chars'] })) if (v !== undefined) script[k] = v;
  try {
    const { ffmpeg } = await ensureDeps({ needBrowser: false });
    const outDir = path.resolve(opt.o || opt.out || path.join(path.dirname(pos[0]), 'voice'));
    const v = buildVoice({ script, outDir, ffmpeg, baseDir: path.dirname(path.resolve(pos[0])), engine: opt.engine || 'auto', log: (m) => console.error(m) });
    for (const l of v.lines) console.error(`  ${l.start.toFixed(2).padStart(6)} → ${l.end.toFixed(2).padStart(6)}  ${l.text}`);
    console.error(`✔ ${v.lines.length} ligne(s), ${v.cues.length} sous-titre(s), durée ${v.duration}s`);
    console.log(path.join(outDir, 'voice.json'));
  } catch (e) { console.error(`✖ ${e.message}`); process.exit(1); }
}
