// node --test plugins/motion-studio/tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYOUTS, TEMPLATE, THEMES, buildDeck, parseRange, parseTemplate } from '../scripts/slides.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'scripts', 'slides.mjs');
const html = fs.readFileSync(TEMPLATE, 'utf8');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'slides-'));

test('the template has one sample slide and one style per layout, and nothing else', () => {
  const { samples } = parseTemplate(html);
  assert.deepEqual(Object.keys(samples), Object.keys(LAYOUTS));
  for (const [name, body] of Object.entries(samples)) {
    assert.match(body, new RegExp(`<section class="slide" data-layout="${name}"`), `sample ${name} declares its layout`);
    assert.match(body, /<aside class="notes">/, `sample ${name} has speaker notes`);
    assert.ok(html.includes(`[data-layout="${name}"]`) || html.includes(`[data-layout^="${name}"]`) || name === 'split-reverse', `CSS for ${name}`);
  }
  for (const t of THEMES) assert.ok(html.includes(`html[data-theme="${t}"]`), `theme ${t}`);
});

test('the kaizen theme carries the Kaizen identity: palette, fonts, ensō + hanko', () => {
  for (const token of ['#efe8d9', '#1d1c1a', '#c4401f', '"Shippori Mincho"', '"Zen Kaku Gothic New"', 'family=Shippori+Mincho', 'family=Zen+Kaku+Gothic+New'])
    assert.ok(html.includes(token), token);
  assert.match(html, /function drawEnso/);
  assert.match(html, /theme === 'kaizen'/);
  assert.match(buildDeck(html, { layouts: ['title'], theme: 'kaizen' }), /<html lang="en" data-theme="kaizen">/);
});

test('buildDeck keeps the requested layouts in order, repeats included', () => {
  const out = buildDeck(html, { layouts: ['title', 'bullets', 'bullets', 'closing'] });
  assert.deepEqual([...out.matchAll(/<!-- slide:([\w-]+) -->/g)].map((m) => m[1]), ['title', 'bullets', 'bullets', 'closing']);
  assert.ok(out.includes('<script>') && out.includes('</html>'), 'runtime and tail kept');
  assert.ok(out.startsWith('<!doctype html>'));
});

test('buildDeck sets theme, title and lang, escaped', () => {
  const out = buildDeck(html, { layouts: ['title'], theme: 'paper', title: 'Q3 <review> & co', lang: 'fr' });
  assert.match(out, /<html lang="fr" data-theme="paper">/);
  assert.match(out, /<title>Q3 &lt;review> &amp; co<\/title>/);
});

test('buildDeck refuses unknown layouts and themes with the list', () => {
  assert.throws(() => buildDeck(html, { layouts: ['title', 'hero'] }), /unknown layout\(s\): hero — available: title/);
  assert.throws(() => buildDeck(html, { theme: 'pink' }), /unknown theme "pink"/);
});

test('no layout list = the whole gallery', () => {
  const out = buildDeck(html, {});
  assert.equal([...out.matchAll(/<!-- slide:/g)].length, Object.keys(LAYOUTS).length);
});

test('parseRange', () => {
  assert.deepEqual(parseRange('1,3-5', 10), [1, 3, 4, 5]);
  assert.deepEqual(parseRange('5-3,9,12', 10), [3, 4, 5, 9]);
  assert.throws(() => parseRange('a', 3), /bad slide range/);
});

test('CLI: layouts, new, overwrite guard', () => {
  const l = spawnSync(process.execPath, [CLI, 'layouts'], { encoding: 'utf8' });
  assert.equal(l.status, 0);
  for (const name of Object.keys(LAYOUTS)) assert.match(l.stdout, new RegExp(`^${name}\\s`, 'm'));
  const dir = tmp(), f = path.join(dir, 'd', 'deck.html');
  const n = spawnSync(process.execPath, [CLI, 'new', f, '--layouts', 'title,kpis', '--theme', 'paper', '--title', 'T'], { encoding: 'utf8' });
  assert.equal(n.status, 0, n.stderr);
  assert.match(n.stdout, /2 slides: 1\.title {2}2\.kpis/);
  assert.match(fs.readFileSync(f, 'utf8'), /data-theme="paper"/);
  const again = spawnSync(process.execPath, [CLI, 'new', f], { encoding: 'utf8' });
  assert.equal(again.status, 1);
  assert.match(again.stderr, /exists \(use --force/);
  const bad = spawnSync(process.execPath, [CLI, 'new', path.join(dir, 'x.html'), '--layouts', 'nope'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /unknown layout/);
});

// Needs a browser: runs only where setup.mjs already found one (never installs anything from the tests).
const home = process.env.MOTION_STUDIO_HOME || process.env.CLAUDE_PLUGIN_DATA;
const ready = home && fs.existsSync(path.join(home, 'env.json'));
test('check: gallery passes, overflow and collisions are errors', { skip: !ready && 'no MOTION_STUDIO_HOME with a ready env.json' }, () => {
  const env = { ...process.env, MOTION_STUDIO_NO_INSTALL: '1' };
  const run = (f) => spawnSync(process.execPath, [CLI, 'check', f, '--json', '--home', home], { encoding: 'utf8', env });
  const dir = tmp();
  const gallery = path.join(dir, 'gallery.html');
  fs.writeFileSync(gallery, buildDeck(html, { title: 'Gallery' }));
  const ok = run(gallery);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const r = JSON.parse(ok.stdout);
  assert.equal(r.errors, 0);
  assert.equal(r.slides.length, Object.keys(LAYOUTS).length);

  const broken = path.join(dir, 'broken.html');
  fs.writeFileSync(broken, buildDeck(html, { layouts: ['bullets', 'kpis'], title: 'Broken' })
    .replace('<h2>Large', '<h2 style="transform:translateY(330px)">Large')
    .replace('<p class="value">47<small> min</small></p>', '<p class="value" style="font-size:150px">47 minutes</p>')
    .replace('<li class="step">Reviewers', '<li class="step" style="margin-left:1900px">Reviewers'));
  const ko = run(broken);
  assert.equal(ko.status, 1);
  const msgs = JSON.parse(ko.stdout).slides.flatMap((s) => s.issues.map((i) => i.msg)).join('\n');
  assert.match(msgs, /text collides/);
  assert.match(msgs, /spills \d+px out of its box/);
  assert.match(msgs, /overflows the slide/);
});

test('themes: one preview per theme', { skip: !ready && 'no MOTION_STUDIO_HOME with a ready env.json' }, () => {
  const out = path.join(tmp(), 'themes');
  const r = spawnSync(process.execPath, [CLI, 'themes', '--out', out, '--home', home], { encoding: 'utf8', env: { ...process.env, MOTION_STUDIO_NO_INSTALL: '1' } });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fs.readdirSync(out).sort(), THEMES.map((t) => `theme-${t}.jpg`).sort());
});
