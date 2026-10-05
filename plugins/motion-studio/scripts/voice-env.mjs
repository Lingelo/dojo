/**
 * motion-studio voice-env — where the voice engines installed by voice-setup.mjs live.
 *   <home>/voice-venv/        Python venv holding edge-tts and piper-tts (no sudo, no system pollution)
 *   <home>/voices/*.onnx      Piper voice models
 *   <home>/kokoro-venv/       separate venv for kokoro-onnx (needs Python 3.10–3.13, the default python may be newer)
 *   <home>/kokoro/            Kokoro model + voice pack
 */
import fs from 'node:fs';
import path from 'node:path';
import { home } from './deps.mjs';

export const venvDir = () => path.join(home(), 'voice-venv');
export const voicesDir = () => path.join(home(), 'voices');
export const kokoroVenvDir = () => path.join(home(), 'kokoro-venv');
export const kokoroDir = () => path.join(home(), 'kokoro');
export const KOKORO_FILES = { model: 'kokoro-v1.0.fp16.onnx', voices: 'voices-v1.0.bin' };

/** Executable `name` of a plugin venv (default: the edge/piper one), or null. */
export function venvBin(name, dir = venvDir()) {
  const f = process.platform === 'win32' ? path.join(dir, 'Scripts', `${name}.exe`) : path.join(dir, 'bin', name);
  return fs.existsSync(f) ? f : null;
}

/** Kokoro install: { python, model, voices } when the venv and both files are there, else null. */
export function kokoroInstall() {
  const python = venvBin('python', kokoroVenvDir());
  const model = path.join(kokoroDir(), KOKORO_FILES.model), voices = path.join(kokoroDir(), KOKORO_FILES.voices);
  return python && fs.existsSync(model) && fs.existsSync(voices) ? { python, model, voices } : null;
}

/** Piper model for `lang`: PIPER_MODEL, else an installed <home>/voices/<lang>_*.onnx. */
export function piperModel(lang = 'en') {
  if (process.env.PIPER_MODEL && fs.existsSync(process.env.PIPER_MODEL)) return process.env.PIPER_MODEL;
  try {
    const f = fs.readdirSync(voicesDir()).find((n) => n.endsWith('.onnx') && n.toLowerCase().startsWith(String(lang).toLowerCase().slice(0, 2) + '_'));
    return f ? path.join(voicesDir(), f) : null;
  } catch { return null; }
}
