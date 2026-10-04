/**
 * motion-studio voice-env — where the voice engines installed by voice-setup.mjs live.
 *   <home>/voice-venv/        Python venv holding edge-tts and piper-tts (no sudo, no system pollution)
 *   <home>/voices/*.onnx      Piper voice models
 */
import fs from 'node:fs';
import path from 'node:path';
import { home } from './deps.mjs';

export const venvDir = () => path.join(home(), 'voice-venv');
export const voicesDir = () => path.join(home(), 'voices');

/** Executable `name` of the plugin's venv, or null. */
export function venvBin(name) {
  const f = process.platform === 'win32' ? path.join(venvDir(), 'Scripts', `${name}.exe`) : path.join(venvDir(), 'bin', name);
  return fs.existsSync(f) ? f : null;
}

/** Piper model for `lang`: PIPER_MODEL, else an installed <home>/voices/<lang>_*.onnx. */
export function piperModel(lang = 'en') {
  if (process.env.PIPER_MODEL && fs.existsSync(process.env.PIPER_MODEL)) return process.env.PIPER_MODEL;
  try {
    const f = fs.readdirSync(voicesDir()).find((n) => n.endsWith('.onnx') && n.toLowerCase().startsWith(String(lang).toLowerCase().slice(0, 2) + '_'));
    return f ? path.join(voicesDir(), f) : null;
  } catch { return null; }
}
