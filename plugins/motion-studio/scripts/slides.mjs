#!/usr/bin/env node
/**
 * motion-studio slides — HTML decks built from the template in skills/slides/assets/deck.html.
 *
 *   node slides.mjs layouts                                   list the layouts
 *   node slides.mjs new deck/deck.html --layouts title,bullets,closing [--theme paper] [--title "…"] [--lang fr]
 *   node slides.mjs themes [--out dir]                        one preview image per theme (to choose)
 *   node slides.mjs check deck/deck.html [--json]             overflow, safe area, density, contrast, images, fonts
 *   node slides.mjs export deck/deck.html [--pdf f.pdf] [--png dir] [--sheet f.jpg] [--slides 1,3-5] [--scale 2]
 *
 * `new` and `layouts` need nothing; `check` and `export` drive the same headless Chromium as render.mjs
 * (auto-installed by setup.mjs, no ffmpeg needed). The deck is opened with ?export: every slide is stacked
 * at its real size, steps revealed, no animation.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATE = path.join(HERE, '..', 'skills', 'slides', 'assets', 'deck.html');
export const THEMES = ['ink', 'paper', 'kaizen'];

/** Every layout of the template: name → when to use it. The template holds one sample slide for each. */
export const LAYOUTS = {
  title: 'Cover: kicker, title, subtitle, author/date',
  agenda: 'Numbered chapters (2 columns past 5), li.is-current marks where we are',
  section: 'Chapter divider: big number + title (try data-bg="accent")',
  statement: 'One sentence that carries the slide, nothing else',
  bullets: 'Title + 3 to 6 bullets (class="step" to reveal one by one)',
  split: 'Text left, media right (.media.bleed goes edge to edge)',
  'split-reverse': 'Media left, text right',
  cards: '2 to 4 boxed blocks (tag, title, text), one .is-highlight',
  columns: '2 to 4 open columns with an accent rule',
  'big-number': 'One huge figure + what it means + source',
  kpis: 'Row of 2 to 4 metrics with deltas',
  chart: 'CSS bar chart (or inline SVG) + takeaway',
  timeline: '3 to 6 milestones (is-done, is-current)',
  comparison: 'Before / after, option A vs B',
  code: 'Code listing (≤ 14 lines) + explanation',
  quote: 'Testimonial or citation, attributed',
  image: 'Full-bleed picture with a caption',
  closing: 'Thanks, call to action, contacts',
  blank: 'Free canvas',
};

// ---------------------------------------------------------------- template → deck (no browser)
const SAMPLE = /<!-- slide:([\w-]+) -->\n([\s\S]*?)<!-- \/slide -->\n?/g;

/** Split the template into head, one sample per layout, tail. */
export function parseTemplate(html) {
  const samples = {};
  let first = -1, last = -1;
  for (const m of html.matchAll(SAMPLE)) {
    samples[m[1]] = m[2];
    if (first < 0) first = m.index;
    last = m.index + m[0].length;
  }
  if (first < 0) throw new Error('template has no <!-- slide:… --> samples');
  return { head: html.slice(0, first), samples, tail: html.slice(last) };
}

const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Build a deck: the template head (styles), the sample slide of each requested layout in order, the runtime. */
export function buildDeck(html, { layouts, theme, title, lang } = {}) {
  const { head, samples, tail } = parseTemplate(html);
  const list = layouts?.length ? layouts : Object.keys(samples);
  const unknown = list.filter((l) => !samples[l]);
  if (unknown.length) throw new Error(`unknown layout(s): ${unknown.join(', ')} — available: ${Object.keys(samples).join(', ')}`);
  if (theme && !THEMES.includes(theme)) throw new Error(`unknown theme "${theme}" — available: ${THEMES.join(', ')} (or keep one and override the BRAND block)`);
  let h = head;
  if (theme) h = h.replace(/(<html[^>]*\sdata-theme=")[^"]*"/, `$1${theme}"`);
  if (lang) h = h.replace(/(<html[^>]*\slang=")[^"]*"/, `$1${escAttr(lang)}"`);
  if (title) h = h.replace(/<title>[^<]*<\/title>/, `<title>${escText(title)}</title>`);
  return h + list.map((l) => `<!-- slide:${l} -->\n${samples[l]}<!-- /slide -->\n`).join('\n') + tail;
}

/** "1,3-5" → [1,3,4,5] */
export function parseRange(spec, max) {
  const out = new Set();
  for (const part of String(spec).split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`bad slide range "${part}" (expected e.g. 1,3-5)`);
    const a = Number(m[1]), b = Number(m[2] ?? m[1]);
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= max) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}

// ---------------------------------------------------------------- in-page audit (runs in the browser)
/* eslint-disable no-undef */
function audit({ known }) {
  const W = document.documentElement;
  const rgb = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/) || s.match(/color\(srgb ([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    const scale = s.startsWith('color(') ? 255 : 1;
    return { r: p[0] * scale, g: p[1] * scale, b: p[2] * scale, a: p[3] ?? 1 };
  };
  const lum = ({ r, g, b }) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0);
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  /** solid background behind el, or null when an image / gradient / media is involved */
  // the theme texture (paper grain) is a background image too, but a faint one: it does not change contrast
  const TEX = (() => { const s = document.querySelector('.deck > .slide'); return s ? getComputedStyle(s).backgroundImage : 'none'; })();
  const backdrop = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if ((cs.backgroundImage !== 'none' && cs.backgroundImage !== TEX) || e.matches('.media, [data-layout="image"]')) return null;
      const c = rgb(cs.backgroundColor);
      if (c && c.a > 0.98) return c;
      if (c && c.a > 0.02) return null;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const label = (el) => {
    const cls = [...el.classList].filter((c) => !c.startsWith('is-'))[0];
    const txt = (el.textContent || '').trim().replace(/\s+/g, ' ');
    return `<${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}> "${txt.length > 42 ? txt.slice(0, 40) + '…' : txt}"`;
  };

  const slides = [...document.querySelectorAll('.deck > .slide')];
  const deckIssues = [];
  const report = slides.map((s, i) => {
    const issues = [];
    const add = (level, msg) => { if (!issues.some((x) => x.msg === msg)) issues.push({ level, msg }); };
    const layout = s.dataset.layout || '';
    if (!layout) add('error', 'no data-layout');
    else if (!known.includes(layout)) add('error', `unknown layout "${layout}"`);
    const sr = s.getBoundingClientRect();
    const cs = getComputedStyle(s);
    const safe = { l: sr.left + parseFloat(cs.paddingLeft), r: sr.right - parseFloat(cs.paddingRight), t: sr.top + parseFloat(cs.paddingTop), b: sr.bottom - parseFloat(cs.paddingBottom) };
    const tol = 6;
    const skip = (el) => el.closest('.notes, .chrome, script, style, [data-check="off"], [aria-hidden="true"]');

    // text: outside the slide (clipped) / outside the safe area / too small / contrast
    const walker = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    const boxes = [];
    for (let n; (n = walker.nextNode());) {
      const el = n.parentElement;
      if (!n.textContent.trim() || !el || skip(el) || seen.has(el)) continue;
      const ecs = getComputedStyle(el);
      if (ecs.visibility === 'hidden' || ecs.display === 'none' || Number(ecs.opacity) === 0) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      // a text rect spans the font's content area, far taller than the line for some fonts (Mincho):
      // keep the band of one em (or the line, if taller) centered on it — what the eye reads as the text
      const band = Math.max(parseFloat(ecs.fontSize), parseFloat(ecs.lineHeight) || 0);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0).map((r) => {
        const h = Math.min(r.height, band), top = r.top + (r.height - h) / 2;
        return { left: r.left, right: r.right, width: r.width, top, bottom: top + h, height: h };
      });
      if (!rects.length) continue;
      seen.add(el);
      const box = { l: Math.min(...rects.map((r) => r.left)), r: Math.max(...rects.map((r) => r.right)), t: Math.min(...rects.map((r) => r.top)), b: Math.max(...rects.map((r) => r.bottom)) };
      boxes.push({ el, rects });
      const outBy = Math.max(sr.left - box.l, box.r - sr.right, sr.top - box.t, box.b - sr.bottom);
      // text wider than its own block (nowrap figures, long words): it spills into the neighbour column
      // (checked against every block ancestor: a grid item sized to its nowrap text still overflows its track)
      let blk = null, spill = 0;
      for (let a = el; a && a !== s; a = a.parentElement) {
        if (getComputedStyle(a).display.startsWith('inline')) continue;
        const br = a.getBoundingClientRect();
        const d = Math.max(br.left - box.l, box.r - br.right);
        if (d > spill) { spill = d; blk = a; }
      }
      if (outBy > 1) add('error', `text overflows the slide by ${Math.round(outBy)}px: ${label(el)}`);
      else if (blk && spill > 2) add('error', `text spills ${Math.round(spill)}px out of its box (too long for the column): ${label(blk)}`);
      else {
        const outSafe = Math.max(safe.l - box.l, box.r - safe.r, safe.t - box.t, box.b - safe.b);
        if (outSafe > tol) add('warn', `text outside the safe area by ${Math.round(outSafe)}px: ${label(el)}`);
      }
      const size = parseFloat(ecs.fontSize) * (1920 / sr.width);
      if (size < 20) add('warn', `text smaller than 20px (${Math.round(size)}px) won't read from the back of the room: ${label(el)}`);
      const fg = rgb(ecs.color), bg = backdrop(el);
      if (fg && bg) {
        const L1 = lum(over(fg, bg)), L2 = lum(bg);
        const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        const large = size >= 36 || (size >= 28 && Number(ecs.fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5)) add('warn', `low contrast ${ratio.toFixed(1)}:1 (needs ${large ? 3 : 4.5}:1): ${label(el)}`);
      }
    }

    // text running into other text (one line of a block over a line of another)
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
      const A = boxes[a], B = boxes[b];
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      const hit = A.rects.some((p) => B.rects.some((q) => Math.min(p.right, q.right) - Math.max(p.left, q.left) > 4 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 0.3 * Math.min(p.height, q.height)));
      if (hit) add('error', `text collides: ${label(A.el)} runs into ${label(B.el)}`);
    }

    // boxes that clip their own content (pre, cards with overflow hidden…)
    for (const el of s.querySelectorAll('*')) {
      if (skip(el) || el.matches('.media, .media *, svg *')) continue;
      const ecs = getComputedStyle(el);
      if (ecs.overflow === 'visible' || !el.textContent.trim()) continue;
      if (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2)
        add('error', `content clipped inside ${label(el)} (${el.scrollWidth}×${el.scrollHeight} in ${el.clientWidth}×${el.clientHeight})`);
    }

    // images
    for (const img of s.querySelectorAll('img')) {
      if (!img.complete || img.naturalWidth === 0) add('error', `image not loaded: ${img.getAttribute('src')}`);
      else if (!img.hasAttribute('alt')) add('warn', `image without alt: ${img.getAttribute('src')}`);
    }
    for (const p of s.querySelectorAll('.placeholder')) add('warn', `placeholder left: "${p.textContent.trim()}"`);
    if (/lorem ipsum/i.test(s.textContent)) add('warn', 'lorem ipsum left');

    // density
    const clone = s.cloneNode(true);
    clone.querySelectorAll('.notes, .chrome, pre, script, style').forEach((e) => e.remove());
    const words = (clone.textContent.match(/[\p{L}\p{N}][\p{L}\p{N}'’.,%-]*/gu) || []).length;
    if (words > 75) add('warn', `dense: ${words} words on screen (aim ≤ 50) — split the slide or move detail to the notes`);
    for (const list of s.querySelectorAll('ul, ol')) {
      if (list.closest('.notes')) continue;
      const items = list.querySelectorAll(':scope > li').length;
      const lim = list.matches('.agenda, .timeline, .bars') ? 8 : 6;
      if (items > lim) add('warn', `${items} items in one list (aim ≤ ${lim})`);
    }
    for (const pre of s.querySelectorAll('pre')) {
      const lines = pre.textContent.replace(/\n$/, '').split('\n').length;
      if (lines > 16) add('warn', `${lines} lines of code (aim ≤ 14): show the part that matters`);
    }
    const hasContent = words > 0 || s.querySelector('img, svg, canvas, video, .media');
    if (!hasContent) add('warn', 'empty slide');

    const notes = (s.querySelector('.notes')?.textContent || '').trim();
    return {
      index: i + 1, layout, words, steps: s.querySelectorAll('.step').length, notes: notes.length > 0,
      title: (s.querySelector('h1, h2, .statement, blockquote')?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 70),
      issues,
    };
  });

  // deck-level: rhythm, fonts, size
  for (let i = 2; i < report.length; i++) {
    const [a, b, c] = [report[i - 2], report[i - 1], report[i]];
    if (a.layout && a.layout === b.layout && b.layout === c.layout && a.layout !== 'blank')
      deckIssues.push({ level: 'warn', msg: `slides ${a.index}–${c.index}: three "${a.layout}" in a row — vary the rhythm (statement, big-number, image…)` });
  }
  const families = new Set();
  for (const el of document.querySelectorAll('.slide h1, .slide h2, .slide p, .slide pre')) {
    const fam = getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
    if (fam) families.add(fam);
  }
  for (const fam of families) {
    // a family served in unicode-range slices (CJK fonts) only loads the slices the page uses
    const faces = [...document.fonts].filter((f) => f.family.replace(/^["']|["']$/g, '') === fam);
    if (faces.length && !faces.some((f) => f.status === 'loaded'))
      deckIssues.push({ level: 'warn', msg: `font "${fam}" did not load (offline?) — slides fall back to the next font of the stack` });
  }
  if (document.title.trim() === 'Deck title' || !document.title.trim())
    deckIssues.push({ level: 'warn', msg: 'the deck has no title (<title>, shown in the footer): set it, or new --title' });
  const cs = getComputedStyle(W);
  return {
    width: parseFloat(cs.getPropertyValue('--slide-w')) || 1920, height: parseFloat(cs.getPropertyValue('--slide-h')) || 1080,
    theme: W.dataset.theme || '', title: document.title, slides: report, issues: deckIssues,
  };
}
/* eslint-enable no-undef */

// ---------------------------------------------------------------- browser
async function openDeck(file, { scale = 1 } = {}) {
  const { LAUNCH_ARGS, ensureDeps, routeCdnToLocal, serveLocal } = await import('./deps.mjs');
  const { chromium, browser: b } = await ensureDeps({ needFfmpeg: false });
  const browser = await chromium.launch({ ...b.opts, args: LAUNCH_ARGS });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale, reducedMotion: 'reduce' });
  await routeCdnToLocal(context);
  const url = await serveLocal(context, path.dirname(path.resolve(file)), file);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.goto(`${url}?export`, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(async () => { if (document.fonts) await document.fonts.ready; });
  const size = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { width: parseFloat(cs.getPropertyValue('--slide-w')) || 1920, height: parseFloat(cs.getPropertyValue('--slide-h')) || 1080 };
  });
  await page.setViewportSize(size);
  return { browser, page, size, errors, url };
}

// ---------------------------------------------------------------- CLI
const HELP = `
motion-studio slides — HTML decks: scaffold, check, export

  node slides.mjs layouts
  node slides.mjs new <deck.html> [--layouts a,b,c] [--theme ${THEMES.join('|')}] [--title "…"] [--lang en] [--force]
      Copy the template with the sample slide of each layout, in order (repeat a layout to get it twice).
      No --layouts = the full gallery (one slide per layout).
  node slides.mjs themes [--out dir] [--slides 1,8,10]
      One preview per theme (<dir>/theme-<name>.jpg: the same sample slides in each theme), to choose one.
  node slides.mjs check <deck.html> [--json]
      Lint every slide at its real size: text overflowing the slide or the safe area, clipped boxes, text < 20px,
      contrast, broken images, placeholders left, density (words, bullets, code lines), layout rhythm, fonts.
      Exit 1 when there are errors.
  node slides.mjs export <deck.html> [--pdf out.pdf] [--png dir] [--sheet sheet.jpg [--cols 3]] [--slides 1,3-5] [--scale 2]
      PDF (one page per slide, vector text), PNG per slide, contact sheet of the whole deck.
      No target = <deck>.pdf next to the deck.
  Every command accepts --home <dir> (dependency folder, as render.mjs).
`;

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) { a._.push(t); continue; }
    const [k, v] = t.slice(2).split(/=(.*)/s);
    if (v !== undefined) a[k] = v;
    else if (['json', 'force', 'help'].includes(k) || argv[i + 1] === undefined || argv[i + 1].startsWith('--')) a[k] = true;
    else a[k] = argv[++i];
  }
  return a;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const [cmd, file] = args._;
  const die = (m) => { process.stderr.write(`✖ ${m}\n`); process.exit(1); };
  if (args.help || !cmd) { console.log(HELP); process.exit(args.help ? 0 : 1); }

  if (cmd === 'layouts') {
    const w = Math.max(...Object.keys(LAYOUTS).map((k) => k.length));
    for (const [k, v] of Object.entries(LAYOUTS)) console.log(`${k.padEnd(w)}  ${v}`);
    console.log(`\nthemes: ${THEMES.join(', ')} (override colors and fonts in the BRAND block)`);
  } else if (cmd === 'new') {
    if (!file) die('usage: slides.mjs new <deck.html> [--layouts a,b,c] [--theme …] [--title "…"]');
    if (fs.existsSync(file) && !args.force) die(`${file} exists (use --force to overwrite)`);
    let html;
    try {
      html = buildDeck(fs.readFileSync(TEMPLATE, 'utf8'), {
        layouts: typeof args.layouts === 'string' ? args.layouts.split(',').map((s) => s.trim()).filter(Boolean) : null,
        theme: typeof args.theme === 'string' ? args.theme : undefined,
        title: typeof args.title === 'string' ? args.title : undefined,
        lang: typeof args.lang === 'string' ? args.lang : undefined,
      });
    } catch (e) { die(e.message); }
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.writeFileSync(file, html);
    const made = [...html.matchAll(/<!-- slide:([\w-]+) -->/g)].map((m) => m[1]);
    console.log(`✔ ${file} — ${made.length} slides: ${made.map((l, i) => `${i + 1}.${l}`).join('  ')}`);
    console.log('  Replace every sample text, then: node slides.mjs check ' + file);
  } else if (cmd === 'themes') {
    // the gallery in each theme, exported as a small sheet: same slides side by side → an informed choice
    const out = path.resolve(typeof args.out === 'string' ? args.out : 'slides-themes');
    const pick = typeof args.slides === 'string' ? args.slides : '1,8,10';
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slides-themes-'));
    fs.mkdirSync(out, { recursive: true });
    const home = typeof args.home === 'string' ? ['--home', args.home] : [];
    try {
      for (const theme of THEMES) {
        const deck = path.join(tmpDir, `${theme}.html`);
        fs.writeFileSync(deck, buildDeck(fs.readFileSync(TEMPLATE, 'utf8'), { theme, title: `Theme ${theme}` }));
        const f = path.join(out, `theme-${theme}.jpg`);
        const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'export', deck, '--sheet', f, '--slides', pick, ...home], { stdio: ['ignore', 'ignore', 'inherit'] });
        if (r.status !== 0) die(`preview of theme ${theme} failed`);
        console.log(`✔ ${f}`);
      }
    } finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }
  } else if (cmd === 'check') {
    if (!file || !fs.existsSync(file)) die('usage: slides.mjs check <deck.html> [--json]');
    let deck, r;
    try {
      deck = await openDeck(file);
      r = await deck.page.evaluate(audit, { known: Object.keys(LAYOUTS) });
    } catch (e) { die(e.message); } finally { await deck?.browser.close(); }
    for (const e of deck.errors) r.issues.push({ level: 'error', msg: `script error in the page: ${e}` });
    const all = [...r.issues, ...r.slides.flatMap((s) => s.issues)];
    const nErr = all.filter((x) => x.level === 'error').length, nWarn = all.length - nErr;
    if (args.json) console.log(JSON.stringify({ ...r, errors: nErr, warnings: nWarn }, null, 2));
    else {
      console.log(`${file} — ${r.slides.length} slides, ${r.width}×${r.height}, theme ${r.theme || '?'}`);
      for (const s of r.slides) {
        const mark = s.issues.some((x) => x.level === 'error') ? '✖' : s.issues.length ? '⚠' : '✔';
        console.log(`${mark} ${String(s.index).padStart(2)} ${`[${s.layout || '?'}]`.padEnd(16)} ${s.title || '(no title)'}  · ${s.words} words${s.steps ? ` · ${s.steps} steps` : ''}${s.notes ? '' : ' · no notes'}`);
        for (const x of s.issues) console.log(`      ${x.level === 'error' ? '✖' : '⚠'} ${x.msg}`);
      }
      for (const x of r.issues) console.log(`${x.level === 'error' ? '✖' : '⚠'} ${x.msg}`);
      console.log(`\n${nErr ? '✖' : '✔'} ${nErr} error(s), ${nWarn} warning(s)`);
    }
    process.exit(nErr ? 1 : 0);
  } else if (cmd === 'export') {
    if (!file || !fs.existsSync(file)) die('usage: slides.mjs export <deck.html> [--pdf out.pdf] [--png dir] [--sheet sheet.jpg]');
    const stem = file.replace(/\.html?$/i, '');
    const targets = { pdf: args.pdf === true ? `${stem}.pdf` : args.pdf, png: args.png === true ? `${stem}-png` : args.png, sheet: args.sheet === true ? `${stem}-sheet.jpg` : args.sheet };
    if (!targets.pdf && !targets.png && !targets.sheet) targets.pdf = `${stem}.pdf`;
    const scale = Number(args.scale || 1);
    if (!(scale > 0 && scale <= 4)) die('--scale expects a number in ]0, 4]');
    let deck;
    try {
      deck = await openDeck(file, { scale });
      const { page, size } = deck;
      const count = await page.locator('.deck > .slide').count();
      if (!count) die('no <section class="slide"> in .deck');
      const pick = args.slides ? parseRange(args.slides, count) : Array.from({ length: count }, (_, i) => i + 1);
      if (targets.pdf) {
        if (args.slides) await page.evaluate((keep) => document.querySelectorAll('.deck > .slide').forEach((s, i) => { if (!keep.includes(i + 1)) s.remove(); }), pick);
        await page.emulateMedia({ media: 'print' });
        fs.mkdirSync(path.dirname(path.resolve(targets.pdf)), { recursive: true });
        await page.pdf({ path: targets.pdf, width: `${size.width}px`, height: `${size.height}px`, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
        console.log(`✔ ${targets.pdf} (${pick.length} pages)`);
        await page.emulateMedia({ media: 'screen' });
        if (args.slides) await page.reload({ waitUntil: 'load' });
      }
      if (targets.png) {
        fs.mkdirSync(targets.png, { recursive: true });
        const slides = page.locator('.deck > .slide');
        for (const n of pick) {
          const f = path.join(targets.png, `slide-${String(n).padStart(2, '0')}.png`);
          await slides.nth(n - 1).screenshot({ path: f, animations: 'disabled' });
          console.log(`✔ ${f}`);
        }
      }
      if (targets.sheet) {
        const cols = Math.max(1, Number(args.cols || 3));
        const gap = 28, padding = 36;
        const width = 1920;
        const zoom = (width - 2 * padding - (cols - 1) * gap) / cols / size.width;
        await page.setViewportSize({ width, height: 200 }); // full-page capture = the grid, no empty tail
        await page.evaluate((z) => { document.documentElement.classList.add('is-overview'); document.documentElement.style.setProperty('--ov-zoom', z); }, zoom.toFixed(4));
        if (args.slides) await page.evaluate((keep) => document.querySelectorAll('.deck > .slide').forEach((s, i) => { if (!keep.includes(i + 1)) s.style.display = 'none'; }), pick);
        fs.mkdirSync(path.dirname(path.resolve(targets.sheet)), { recursive: true });
        await page.screenshot({ path: targets.sheet, fullPage: true, animations: 'disabled', ...(/\.jpe?g$/i.test(targets.sheet) ? { type: 'jpeg', quality: 88 } : {}) });
        console.log(`✔ ${targets.sheet} (${pick.length} slides, ${cols} columns)`);
      }
      for (const e of deck.errors) process.stderr.write(`⚠ script error in the page: ${e}\n`);
    } catch (e) { die(e.message); } finally { await deck?.browser.close(); }
  } else die(`unknown command "${cmd}"\n${HELP}`);
}
