#!/usr/bin/env node
/**
 * motion-studio voice-setup — detect and install the voice-over engines.
 *
 *   node voice-setup.mjs                         state of every engine + recommendation
 *   node voice-setup.mjs install piper [--lang fr]   neural, local, free  (pip venv + voice model ~60 Mo)
 *   node voice-setup.mjs install edge                neural, ONLINE, free, no key (pip venv)
 *   node voice-setup.mjs install espeak              Linux system package (needs root/sudo)
 *
 * Python packages go into a private venv (<home>/voice-venv): no sudo, nothing global touched.
 * Needs Python ≥ 3.8 for piper/edge (macOS/Windows/Linux usually have it).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { detectEngines } from './voice.mjs';
import { home } from './deps.mjs';
import { piperModel, venvBin, venvDir, voicesDir } from './voice-env.mjs';

const out = (m = '') => process.stderr.write(m + '\n');
const run = (cmd, args, o = {}) => spawnSync(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'], ...o });
const probe = (cmd, args) => { const r = spawnSync(cmd, args, { stdio: 'ignore' }); return !r.error && r.status === 0; };

const argv = process.argv.slice(2).filter((a, i, all) => a !== '--home' && all[i - 1] !== '--home');
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const [cmd, what] = argv.filter((a, i) => !a.startsWith('-') && !argv[i - 1]?.startsWith('--'));
const lang = String(opt('--lang', 'fr')).toLowerCase().slice(0, 2);

const MODELS = { fr: 'fr/fr_FR/siwis/medium/fr_FR-siwis-medium', en: 'en/en_US/lessac/medium/en_US-lessac-medium', es: 'es/es_ES/davefx/medium/es_ES-davefx-medium', de: 'de/de_DE/thorsten/medium/de_DE-thorsten-medium', it: 'it/it_IT/paola/medium/it_IT-paola-medium' };

const python = () => ['python3', 'python', ...(process.platform === 'win32' ? ['py'] : [])].find((p) => probe(p, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)']));

/** Private venv + one pip package. Returns true when `bin` is then available in it. */
function pipInstall(pkg, bin) {
  if (venvBin(bin)) { out(`  ✔ ${pkg} déjà installé`); return true; }
  const py = python();
  if (!py) {
    out('  ✖ Python ≥ 3.8 introuvable. Installer Python (https://www.python.org/downloads/, brew install python, sudo apt install python3 python3-venv) puis relancer.');
    return false;
  }
  if (!fs.existsSync(venvDir())) {
    out(`  … création du venv Python (${venvDir()})`);
    fs.mkdirSync(home(), { recursive: true });
    if (run(py, ['-m', 'venv', venvDir()]).status !== 0) {
      fs.rmSync(venvDir(), { recursive: true, force: true });
      out('  ✖ « python -m venv » a échoué.' + (process.platform === 'linux' ? ' Sur Debian/Ubuntu : sudo apt install python3-venv, puis relancer.' : ''));
      return false;
    }
  }
  const vpy = process.platform === 'win32' ? path.join(venvDir(), 'Scripts', 'python.exe') : path.join(venvDir(), 'bin', 'python');
  out(`  … pip install ${pkg}`);
  if (run(vpy, ['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', pkg]).status !== 0) { out(`  ✖ pip install ${pkg} a échoué (réseau ? voir message ci-dessus)`); return false; }
  return !!venvBin(bin);
}

async function download(url, file) {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  const total = Number(r.headers.get('content-length')) || 0;
  const chunks = []; let got = 0, lastLog = 0;
  for await (const c of r.body) {
    chunks.push(c); got += c.length;
    if (Date.now() - lastLog > 1500) { lastLog = Date.now(); out(`    ${(got / 1e6).toFixed(0)}${total ? ` / ${(total / 1e6).toFixed(0)}` : ''} Mo`); }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat(chunks));
}

async function installPiper() {
  out(`Piper — voix neuronale locale (${lang})`);
  if (!MODELS[lang]) { out(`  ✖ pas de voix prévue pour « ${lang} » (dispo : ${Object.keys(MODELS).join(', ')}). Télécharger un modèle sur https://huggingface.co/rhasspy/piper-voices puis : PIPER_MODEL=/chemin/voix.onnx`); return false; }
  if (!pipInstall('piper-tts', 'piper')) return false;
  if (!piperModel(lang)) {
    const base = `https://huggingface.co/rhasspy/piper-voices/resolve/main/${MODELS[lang]}`;
    const file = path.join(voicesDir(), path.basename(MODELS[lang]) + '.onnx');
    out(`  … téléchargement de la voix ${path.basename(MODELS[lang])} (~60 Mo)`);
    try { await download(`${base}.onnx`, file); await download(`${base}.onnx.json`, `${file}.json`); }
    catch (e) { fs.rmSync(file, { force: true }); out(`  ✖ téléchargement impossible : ${e.message}`); return false; }
  }
  out(`  ✔ Piper prêt (${piperModel(lang)})`);
  return true;
}

function installEdge() {
  out('Edge TTS — voix neuronale en ligne, gratuite, sans clé (le texte est envoyé à Microsoft)');
  if (!pipInstall('edge-tts', 'edge-tts')) return false;
  out('  ✔ edge-tts prêt — utiliser : node voice.mjs script.json --engine edge   (voix : fr-FR-DeniseNeural, fr-FR-HenriNeural…)');
  return true;
}

function installEspeak() {
  out('eSpeak NG — voix robotique (dépannage)');
  if (process.platform !== 'linux') { out('  ✔ inutile : cette plateforme a une voix système (say / SAPI).'); return true; }
  if (probe('espeak-ng', ['--version'])) { out('  ✔ déjà installé'); return true; }
  const root = process.getuid?.() === 0;
  if ((root || probe('sudo', ['-n', 'true'])) && probe('apt-get', ['--version'])) {
    const apt = ['apt-get', 'install', '-y', 'espeak-ng'];
    return (root ? run(apt[0], apt.slice(1)) : run('sudo', ['-n', ...apt])).status === 0;
  }
  out('  ✖ droits administrateur requis. Lancer toi-même : sudo apt install espeak-ng   (Fedora : sudo dnf install espeak-ng)');
  return false;
}

// ---------------------------------------------------------------- run
if (cmd === 'install') {
  const fn = { piper: installPiper, edge: installEdge, espeak: installEspeak }[what];
  if (!fn) { out('usage: node voice-setup.mjs install <piper|edge|espeak> [--lang fr]'); process.exit(1); }
  const ok = await fn();
  process.exit(ok ? 0 : 1);
}

const found = detectEngines(lang);
out(`motion-studio voix off — moteurs détectés (${lang})`);
const rows = { say: 'macOS say (préinstallé)', sapi: 'Windows SAPI (préinstallé)', piper: 'Piper — neuronal local   → install piper', edge: 'Edge TTS — neuronal EN LIGNE → install edge', espeak: 'eSpeak NG — robotique    → install espeak' };
for (const [k, label] of Object.entries(rows)) out(`  ${found.includes(k) ? '✔' : '✖'} ${k.padEnd(7)} ${label}`);
const best = ['piper', 'say', 'sapi', 'espeak'].find((k) => found.includes(k));
if (!best) out('\nAucune voix locale. Recommandé : node voice-setup.mjs install piper');
else if (best === 'espeak') out('\nSeul eSpeak est disponible (robotique). Pour mieux : node voice-setup.mjs install piper');
else out(`\nPrêt : le moteur utilisé par défaut sera « ${best} ».`);
process.exit(best ? 0 : 1);
