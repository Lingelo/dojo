#!/usr/bin/env node
/**
 * motion-studio setup — makes the plugin self-sufficient.
 *
 *   node setup.mjs            detect, install what is missing, write env.json
 *   node setup.mjs --check    report only (exit 1 if something is missing)
 *   node setup.mjs --force    ignore the cache, re-detect everything
 *
 * Only Node ≥ 18 + npm are assumed. Everything else is reused when present
 * (Playwright, a Chromium/Chrome/Edge, ffmpeg) or installed into the plugin's
 * data directory (${CLAUDE_PLUGIN_DATA}):
 *   - playwright-core   (~10 MB, browser automation)
 *   - ffmpeg-static     (~70 MB, static ffmpeg binary with libx264, macOS/Linux/Windows)
 *   - chromium-headless-shell (~100 MB, shared cache ~/.cache/ms-playwright, reused by the Playwright MCP)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PLUGIN_ROOT, findBrowser, findFfmpeg, findPlaywright, home, readEnv, writeEnv } from './deps.mjs';

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const FORCE = argv.includes('--force');
const out = (m) => process.stderr.write(m + '\n');
const ok = (m) => out(`  ✔ ${m}`), ko = (m) => out(`  ✖ ${m}`), info = (m) => out(`  … ${m}`);

const pkg = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'package.json'), 'utf8'));
const HOME = home();
const isWin = process.platform === 'win32';

function npmInstall(names) {
  fs.mkdirSync(HOME, { recursive: true });
  const target = path.join(HOME, 'package.json');
  const current = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : { name: 'motion-studio-runtime', private: true, dependencies: {} };
  for (const n of names) current.dependencies[n] = pkg.dependencies[n];
  fs.writeFileSync(target, JSON.stringify(current, null, 2));
  info(`npm install ${names.join(' ')} → ${HOME}`);
  const r = spawnSync(isWin ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund', '--omit=dev', '--loglevel=error'], { cwd: HOME, stdio: ['ignore', 'inherit', 'inherit'], shell: isWin });
  return r.status === 0;
}

function installBrowser(pw) {
  const cli = path.join(path.dirname(pw.path), 'cli.js');
  const env = { ...process.env };
  delete env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD;
  for (const target of [['chromium-headless-shell'], ['--only-shell', 'chromium'], ['chromium']]) {
    info(`playwright install ${target.join(' ')}`);
    const r = spawnSync(process.execPath, [cli, 'install', ...target], { stdio: ['ignore', 'inherit', 'inherit'], env });
    if (r.status === 0) return true;
  }
  return false;
}

// ---------------------------------------------------------------- run
out(`motion-studio setup  (home: ${HOME})`);
if (!FORCE && !CHECK && readEnv()?.ok) info('env.json cache found — revalidating');
let missing = 0;

// 1. Node
const major = Number(process.versions.node.split('.')[0]);
if (major >= 18) ok(`Node ${process.versions.node}`);
else { ko(`Node ${process.versions.node} : Node ≥ 18 required (https://nodejs.org)`); process.exit(1); }

// 2. Playwright (browser automation)
let pw = findPlaywright();
if (!pw && !CHECK) { npmInstall(['playwright-core']); pw = findPlaywright(); }
if (pw) ok(`${pw.name} ${createRequire(pw.path)(path.join(path.dirname(pw.path), 'package.json')).version}  (${path.dirname(pw.path)})`);
else { ko('Playwright not found'); missing++; }

// 3. ffmpeg (video + audio encoding)
let ffmpeg = findFfmpeg();
if (!ffmpeg && !CHECK) { npmInstall(['ffmpeg-static']); ffmpeg = findFfmpeg(); }
if (ffmpeg) ok(`ffmpeg with libx264  (${ffmpeg})`);
else {
  ko('ffmpeg not found. Install one of: brew install ffmpeg | sudo apt install ffmpeg | winget install ffmpeg | pip install imageio-ffmpeg');
  missing++;
}

// 4. Navigateur
let browser = null;
if (pw) {
  browser = await findBrowser(pw.mod.chromium);
  if (browser.error && !CHECK) { installBrowser(pw); browser = await findBrowser(pw.mod.chromium); }
  if (!browser.error) ok(`browser: ${browser.label}`);
  else {
    ko(`no usable browser.\n${browser.error.replace(/^/gm, '      ')}`);
    if (process.platform === 'linux' && /shared librar|dependencies/i.test(browser.error))
      out('      → missing system libraries: sudo npx playwright install-deps chromium');
    missing++;
  }
}

if (CHECK) { out(missing ? `\n${missing} missing dependenc(ies) — run: node setup.mjs` : '\nEverything is ready.'); process.exit(missing ? 1 : 0); }
if (missing) { out(`\n✖ ${missing} dependenc(ies) could not be installed automatically (see above).`); process.exit(1); }

writeEnv({ ok: true, playwright: pw.path, browser: { label: browser.label, opts: browser.opts }, ffmpeg });
out(`\n✔ motion-studio ready  (${path.join(HOME, 'env.json')})`);
