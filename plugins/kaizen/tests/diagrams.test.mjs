// The documentation diagrams: generated from docs/media/source/diagrams.mjs, true to hooks.json, used by a
// page, and naming no removed command.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { PLUGIN } from './helpers.mjs';

const ROOT = join(PLUGIN, '..', '..');
const DIR = join(PLUGIN, 'docs', 'media', 'diagrams');
const GENERATOR = join(PLUGIN, 'docs', 'media', 'source', 'diagrams.mjs');
const svgs = readdirSync(DIR).filter((f) => f.endsWith('.svg'));
const lf = (s) => s.replace(/\r\n/g, '\n');
const svg = (f) => lf(readFileSync(join(DIR, f), 'utf8'));
const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const hookRegistrations = Object.values(JSON.parse(readFileSync(join(PLUGIN, 'hooks', 'hooks.json'), 'utf8')).hooks).flatMap((groups) =>
  groups.flatMap((g) => g.hooks.map((h) => h.command.match(/scripts\/([\w-]+\.mjs)"?(.*)$/).slice(1).join('').trim())),
);
const NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'fixtures'].includes(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.md')) out.push(full);
  }
  return out;
}

test('the SVGs are exactly what the generator writes (edit diagrams.mjs, then run it)', () => {
  const out = mkdtempSync(join(tmpdir(), 'kaizen diagrams '));
  const r = spawnSync(process.execPath, [GENERATOR], { env: { ...process.env, KAIZEN_DIAGRAMS_OUT: out }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const generated = readdirSync(out).filter((f) => f.endsWith('.svg'));
  assert.deepEqual([...svgs].sort(), [...generated].sort(), 'committed SVGs and generated SVGs differ in names');
  for (const f of generated) assert.equal(svg(f), lf(readFileSync(join(out, f), 'utf8')), `${f}: stale — run node ${relative(ROOT, GENERATOR)}`);
});

test('hooks diagram: every registration of hooks.json drawn, and the count it announces', () => {
  const text = unescape(svg('hooks.svg'));
  for (const h of hookRegistrations) assert.ok(text.includes(h), `hooks.svg does not draw ${h}`);
  for (const event of Object.keys(JSON.parse(readFileSync(join(PLUGIN, 'hooks', 'hooks.json'), 'utf8')).hooks)) assert.ok(text.includes(event), `hooks.svg: ${event} missing`);
  const [, n] = text.match(/<desc[^>]*>(\w+) hook registrations/) || [];
  assert.equal(NUMBERS[String(n).toLowerCase()] ?? Number(n), hookRegistrations.length, `hooks.svg announces "${n}", hooks.json has ${hookRegistrations.length}`);
});

test('the loop diagram draws agent-skills\' commands and each of Kaizen\'s skills', () => {
  const text = unescape(svg('kaizen-loop.svg'));
  for (const c of ['spec', 'plan', 'build', 'test', 'review', 'ship']) assert.ok(text.includes(`>/kaizen:${c}<`), `kaizen-loop.svg: /kaizen:${c}`);
  for (const s of readdirSync(join(PLUGIN, 'skills'))) assert.ok(text.includes(`/kaizen:${s}`), `kaizen-loop.svg: /kaizen:${s}`);
});

test('no diagram names a removed command', () => {
  for (const f of svgs) assert.doesNotMatch(unescape(svg(f)), /kaizen-ops|\/kaizen:(deploy|monitor|postmortem|work|brainstorm|ideate|constitution|doc-review|decide|debug|polish|autopilot|release|help|prune-learnings|address-feedback|watch-pr)\b/, f);
});

test('every diagram is used by a page, every page links an existing diagram', () => {
  const used = new Set();
  for (const p of [join(ROOT, 'README.md'), ...walk(PLUGIN)]) {
    for (const [, name] of readFileSync(p, 'utf8').matchAll(/media\/diagrams\/([\w-]+\.svg)/g)) {
      assert.ok(svgs.includes(name), `${relative(ROOT, p)}: links a missing diagram ${name}`);
      used.add(name);
    }
  }
  assert.deepEqual(svgs.filter((s) => !used.has(s)), [], 'diagrams no page shows');
});
