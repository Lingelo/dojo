#!/usr/bin/env node
/**
 * motion-studio voice-setup — detect and install the voice-over engines.
 *
 *   node voice-setup.mjs                         state of every engine + recommendation
 *   node voice-setup.mjs install kokoro              neural, local, free, most natural (own venv + model ~190 MB)
 *   node voice-setup.mjs install piper [--lang en]   neural, local, free  (pip venv + voice model ~60 MB)
 *   node voice-setup.mjs install edge                neural, ONLINE, free, no key (pip venv)
 *   node voice-setup.mjs install espeak              Linux system package (needs root/sudo)
 *
 * Python packages go into a private venv (<home>/voice-venv): no sudo, nothing global touched.
 * Needs Python ≥ 3.8 for piper/edge (macOS/Windows/Linux usually have it), 3.10–3.13 for kokoro
 * (kokoro-onnx does not support 3.14 yet: a python3.13…3.10 is looked for when the default one is newer).
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { detectEngines } from './voice.mjs';
import { home } from './deps.mjs';
import { KOKORO_FILES, kokoroDir, kokoroInstall, kokoroVenvDir, piperModel, venvBin, venvDir, voicesDir } from './voice-env.mjs';

const out = (m = '') => process.stderr.write(m + '\n');
const run = (cmd, args, o = {}) => spawnSync(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'], ...o });
const probe = (cmd, args) => { const r = spawnSync(cmd, args, { stdio: 'ignore' }); return !r.error && r.status === 0; };

const argv = process.argv.slice(2).filter((a, i, all) => a !== '--home' && all[i - 1] !== '--home');
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const [cmd, what] = argv.filter((a, i) => !a.startsWith('-') && !argv[i - 1]?.startsWith('--'));
const lang = String(opt('--lang', 'en')).toLowerCase().slice(0, 2);

const MODELS = { fr: 'fr/fr_FR/siwis/medium/fr_FR-siwis-medium', en: 'en/en_US/lessac/medium/en_US-lessac-medium', es: 'es/es_ES/davefx/medium/es_ES-davefx-medium', de: 'de/de_DE/thorsten/medium/de_DE-thorsten-medium', it: 'it/it_IT/paola/medium/it_IT-paola-medium' };

/** First Python whose version is in [min, max) → [cmd, preArgs], or undefined. */
function python(min = [3, 8], max = [4, 0]) {
  const cands = [...['3.13', '3.12', '3.11', '3.10'].map((v) => [`python${v}`, []]), ['python3', []], ['python', []],
    ...(process.platform === 'win32' ? [...['3.13', '3.12', '3.11', '3.10'].map((v) => ['py', [`-${v}`]]), ['py', []]] : [])];
  const check = `import sys; sys.exit(0 if (${min}) <= sys.version_info[:2] < (${max}) else 1)`;
  return cands.find(([c, pre]) => probe(c, [...pre, '-c', check]));
}

/** Private venv (default: the edge/piper one) + one pip package. Returns true when `bin` is then available in it. */
function pipInstall(pkg, bin, { dir = venvDir(), min, max, need = 'Python ≥ 3.8' } = {}) {
  if (venvBin(bin, dir)) { out(`  ✔ ${pkg} already installed`); return true; }
  const py = python(min, max);
  if (!py) {
    out(`  ✖ ${need} not found. Install Python (https://www.python.org/downloads/, brew install python@3.12, sudo apt install python3 python3-venv), then run again.`);
    return false;
  }
  if (!fs.existsSync(dir)) {
    out(`  … creating the Python venv (${dir})`);
    fs.mkdirSync(home(), { recursive: true });
    if (run(py[0], [...py[1], '-m', 'venv', dir]).status !== 0) {
      fs.rmSync(dir, { recursive: true, force: true });
      out('  ✖ "python -m venv" failed.' + (process.platform === 'linux' ? ' On Debian/Ubuntu: sudo apt install python3-venv, then run again.' : ''));
      return false;
    }
  }
  const vpy = process.platform === 'win32' ? path.join(dir, 'Scripts', 'python.exe') : path.join(dir, 'bin', 'python');
  out(`  … pip install ${pkg}`);
  if (run(vpy, ['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', pkg]).status !== 0) { out(`  ✖ pip install ${pkg} failed (network? see the message above)`); return false; }
  return !!venvBin(bin, dir);
}

async function download(url, file) {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  const total = Number(r.headers.get('content-length')) || 0;
  const chunks = []; let got = 0, lastLog = 0;
  for await (const c of r.body) {
    chunks.push(c); got += c.length;
    if (Date.now() - lastLog > 1500) { lastLog = Date.now(); out(`    ${(got / 1e6).toFixed(0)}${total ? ` / ${(total / 1e6).toFixed(0)}` : ''} MB`); }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat(chunks));
}

async function installPiper() {
  out(`Piper — local neural voice (${lang})`);
  if (!MODELS[lang]) { out(`  ✖ no voice planned for "${lang}" (available: ${Object.keys(MODELS).join(', ')}). Download a model from https://huggingface.co/rhasspy/piper-voices, then: PIPER_MODEL=/path/voice.onnx`); return false; }
  if (!pipInstall('piper-tts', 'piper')) return false;
  if (!piperModel(lang)) {
    const base = `https://huggingface.co/rhasspy/piper-voices/resolve/main/${MODELS[lang]}`;
    const file = path.join(voicesDir(), path.basename(MODELS[lang]) + '.onnx');
    out(`  … downloading the voice ${path.basename(MODELS[lang])} (~60 MB)`);
    try { await download(`${base}.onnx`, file); await download(`${base}.onnx.json`, `${file}.json`); }
    catch (e) { fs.rmSync(file, { force: true }); out(`  ✖ download failed: ${e.message}`); return false; }
  }
  out(`  ✔ Piper ready (${piperModel(lang)})`);
  return true;
}

// kokoro-onnx release assets (MIT code, Apache-2.0 model): https://github.com/thewh1teagle/kokoro-onnx/releases
const KOKORO_RELEASE = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1';
const KOKORO_PKG = 'kokoro-onnx==0.6.1'; // pinned: the voice must not change silently between two renders
// size and sha256 of each model file, from the release's own asset digests (GitHub API, model-files-v1.1):
// a corrupt, truncated or swapped download never becomes the model. (The pip dependencies of kokoro-onnx —
// onnxruntime, numpy… — are not hash-pinned: only kokoro-onnx itself is, by version.)
const KOKORO_SUMS = {
  'kokoro-v1.0.fp16.onnx': [163527961, 'f3a290d384fbb27966d462905c71a46cef9e5fd00516b40df32a0b4afe77ac96'],
  'voices-v1.0.bin': [28214398, 'bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d'],
};
const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

async function installKokoro() {
  out('Kokoro — local neural voice, most natural (en, fr, es, it, pt)');
  // the import is the real check: the venv may exist with a failed install
  const venvPy = () => venvBin('python', kokoroVenvDir());
  const imported = () => venvPy() && probe(venvPy(), ['-c', 'import kokoro_onnx']);
  if (!imported()) {
    fs.rmSync(kokoroVenvDir(), { recursive: true, force: true });
    if (!pipInstall(KOKORO_PKG, 'python', { dir: kokoroVenvDir(), min: [3, 10], max: [3, 14], need: 'Python 3.10–3.13' })) return false;
    if (!imported()) { out('  ✖ kokoro-onnx installed but cannot be imported (see the message above)'); return false; }
  } else out(`  ✔ ${KOKORO_PKG} already installed`);
  for (const [what, name] of Object.entries(KOKORO_FILES)) {
    const file = path.join(kokoroDir(), name), [size, sum] = KOKORO_SUMS[name];
    // an existing file is kept only if it is the pinned one (size first: hashing 160 MB is only for a match)
    if (fs.existsSync(file) && fs.statSync(file).size === size && sha256(file) === sum) continue;
    if (fs.existsSync(file)) out(`  ⚠ ${name} does not match its pinned checksum: downloading it again`);
    out(`  … downloading the ${what} ${name}`);
    try {
      await download(`${KOKORO_RELEASE}/${name}`, `${file}.part`);
      const got = sha256(`${file}.part`); // checked BEFORE it replaces anything
      if (got !== sum) throw new Error(`sha256 ${got} ≠ ${sum}`);
      fs.renameSync(`${file}.part`, file);
    } catch (e) { fs.rmSync(`${file}.part`, { force: true }); out(`  ✖ download failed: ${e.message}`); return false; }
  }
  if (!kokoroInstall()) { out('  ✖ Kokoro incomplete after install'); return false; }
  out(`  ✔ Kokoro ready (${kokoroDir()}) — the default engine from now on`);
  return true;
}

function installEdge() {
  out('Edge TTS — online neural voice, free, no key (the text is sent to Microsoft)');
  if (!pipInstall('edge-tts', 'edge-tts')) return false;
  out('  ✔ edge-tts ready — use: node voice.mjs script.json --engine edge   (voices: en-US-AriaNeural, en-GB-RyanNeural, fr-FR-DeniseNeural…)');
  return true;
}

function installEspeak() {
  out('eSpeak NG — robotic voice (fallback)');
  if (process.platform !== 'linux') { out('  ✔ not needed: this platform has a system voice (say / SAPI).'); return true; }
  if (probe('espeak-ng', ['--version'])) { out('  ✔ already installed'); return true; }
  const root = process.getuid?.() === 0;
  if ((root || probe('sudo', ['-n', 'true'])) && probe('apt-get', ['--version'])) {
    const apt = ['apt-get', 'install', '-y', 'espeak-ng'];
    return (root ? run(apt[0], apt.slice(1)) : run('sudo', ['-n', ...apt])).status === 0;
  }
  out('  ✖ administrator rights required. Run it yourself: sudo apt install espeak-ng   (Fedora: sudo dnf install espeak-ng)');
  return false;
}

// ---------------------------------------------------------------- run
if (cmd === 'install') {
  const fn = { kokoro: installKokoro, piper: installPiper, edge: installEdge, espeak: installEspeak }[what];
  if (!fn) { out('usage: node voice-setup.mjs install <kokoro|piper|edge|espeak> [--lang fr]'); process.exit(1); }
  const ok = await fn();
  process.exit(ok ? 0 : 1);
}

const found = detectEngines(lang);
out(`motion-studio voice-over — detected engines (${lang})`);
const rows = { kokoro: 'Kokoro — local neural, most natural → install kokoro', say: 'macOS say (preinstalled)', sapi: 'Windows SAPI (preinstalled)', piper: 'Piper — local neural     → install piper', edge: 'Edge TTS — ONLINE neural  → install edge', espeak: 'eSpeak NG — robotic      → install espeak' };
for (const [k, label] of Object.entries(rows)) out(`  ${found.includes(k) ? '✔' : '✖'} ${k.padEnd(7)} ${label}`);
const best = ['kokoro', 'piper', 'say', 'sapi', 'espeak'].find((k) => found.includes(k));
if (!best) out('\nNo local voice. Recommended: node voice-setup.mjs install kokoro');
else if (best === 'espeak') out('\nOnly eSpeak is available (robotic). For better: node voice-setup.mjs install kokoro');
else out(`\nReady: the default engine will be "${best}".`);
process.exit(best ? 0 : 1);
