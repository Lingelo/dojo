#!/usr/bin/env node
/**
 * motion-studio inspect — check a rendered video without a system ffmpeg.
 *
 *   node inspect.mjs video.mp4                       streams, duration, fps, loudness
 *   node inspect.mjs video.mp4 --frames 1.5,3.2 -o dir   extract PNG frames (then Read them)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ensureDeps } from './deps.mjs';

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith('-') && argv[argv.indexOf(a) - 1] !== '--home' && argv[argv.indexOf(a) - 1] !== '--frames' && argv[argv.indexOf(a) - 1] !== '-o');
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
if (!file || !fs.existsSync(file)) { console.error('usage: node inspect.mjs <video> [--frames t1,t2 -o dir]'); process.exit(1); }

const { ffmpeg } = await ensureDeps({ needBrowser: false });

if (opt('--frames')) {
  const dir = path.resolve(opt('-o') || path.join(path.dirname(file), 'frames'));
  fs.mkdirSync(dir, { recursive: true });
  for (const t of opt('--frames').split(',').map(Number)) {
    const f = path.join(dir, `${path.basename(file).replace(/\.[^.]+$/, '')}-${t.toFixed(2)}s.png`);
    spawnSync(ffmpeg, ['-v', 'error', '-y', '-ss', String(t), '-i', file, '-frames:v', '1', f]);
    console.log(f);
  }
} else {
  const info = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' }).stderr;
  for (const l of info.split('\n')) if (/Duration|Stream/.test(l)) console.log(l.trim());
  if (/Audio:/.test(info)) {
    const r = spawnSync(ffmpeg, ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
    const s = r.slice(r.lastIndexOf('Summary:'));
    const I = s.match(/I:\s+(-?[\d.]+) LUFS/), P = s.match(/Peak:\s+(-?[\d.]+) dBFS/);
    console.log(`Loudness: ${I ? I[1] + ' LUFS' : '?'}  true peak: ${P ? P[1] + ' dBFS' : '?'}`);
  }
}
