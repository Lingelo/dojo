// Diagram and count contracts: the SVGs in docs/media/diagrams/ and the numbers written in the docs
// must say what the code does. The READMEs are held by contracts.test.mjs; these drew no test until
// they drifted (six hooks drawn for nine, ten reviewers for eleven, production commands drawn as core).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { PLUGIN } from './helpers.mjs';

const ROOT = join(PLUGIN, '..', '..');
const DIAGRAMS = join(PLUGIN, 'docs', 'media', 'diagrams');
const GENERATOR = join(PLUGIN, 'docs', 'media', 'source', 'diagrams.mjs');
const svgs = readdirSync(DIAGRAMS).filter((f) => f.endsWith('.svg'));
// Line endings normalized: a Windows checkout (core.autocrlf) turns the committed SVGs into CRLF.
const lf = (s) => s.replace(/\r\n/g, '\n');
const svg = (name) => lf(readFileSync(join(DIAGRAMS, name), 'utf8'));
const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// Boxes as drawn by the generator: a <rect class="kind"> followed by its <text> lines.
function boxes(text) {
  const out = [];
  for (const m of text.matchAll(/<rect class="(\w+)"[^>]*\/>((?:\n<text [^>]*>[^<]*<\/text>)*)/g)) {
    if (/ width="18" height="12"/.test(m[0])) continue; // a legend swatch
    const lines = [...m[2].matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((t) => unescape(t[1]));
    if (lines.length) out.push({ kind: m[1], label: lines[0], lines });
  }
  return out;
}

const hookRegistrations = Object.values(JSON.parse(readFileSync(join(PLUGIN, 'hooks', 'hooks.json'), 'utf8')).hooks).flatMap((groups) =>
  groups.flatMap((g) => g.hooks.map((h) => h.command.match(/scripts\/([\w-]+\.mjs)"?(.*)$/).slice(1).join('').trim())),
);
const agents = readdirSync(join(PLUGIN, 'agents')).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));
const codeReviewers = agents.filter((a) => a.endsWith('-reviewer') && !a.startsWith('plan-'));
const planReviewers = agents.filter((a) => a.startsWith('plan-') && a.endsWith('-reviewer'));
const researchers = agents.filter((a) => !a.endsWith('-reviewer'));
const skills = readdirSync(join(PLUGIN, 'skills')).filter((d) => statSync(join(PLUGIN, 'skills', d)).isDirectory());
const MOVED = ['deploy', 'monitor', 'postmortem'];

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
  assert.equal(toNumber(n), hookRegistrations.length, `hooks.svg announces "${n}" registrations, hooks.json has ${hookRegistrations.length}`);
});

test('review diagram: exactly the code reviewers of agents/', () => {
  const drawn = boxes(svg('review-pipeline.svg')).filter((b) => b.kind === 'agent').map((b) => `${b.label}-reviewer`);
  assert.deepEqual([...drawn].sort(), [...codeReviewers].sort());
});

test('no diagram draws a kaizen-ops command as a Kaizen core skill', () => {
  for (const f of svgs) {
    const text = svg(f);
    assert.doesNotMatch(text, new RegExp(`/kaizen:(${MOVED.join('|')})\\b`), `${f}: names a command moved to kaizen-ops`);
    for (const b of boxes(text)) {
      if (b.kind !== 'skill') continue;
      const name = b.label.replace(/^\/kaizen(-ops)?:/, '').split(/[ ·]/)[0];
      assert.ok(!MOVED.includes(name), `${f}: "${b.label}" drawn as a core skill, it is kaizen-ops (kind 'ops')`);
    }
  }
});

test('every diagram is used by a page, every page links an existing diagram', () => {
  const pages = [join(ROOT, 'README.md'), ...walk(join(PLUGIN)), ...walk(join(ROOT, 'plugins', 'kaizen-ops'))];
  const used = new Set();
  for (const p of pages) {
    for (const [, name] of readFileSync(p, 'utf8').matchAll(/media\/diagrams\/([\w-]+\.svg)/g)) {
      assert.ok(svgs.includes(name), `${relative(ROOT, p)}: links a missing diagram ${name}`);
      used.add(name);
    }
  }
  assert.deepEqual(svgs.filter((s) => !used.has(s)), [], 'diagrams used by no page');
});

// Numbers written in words or digits next to what they count, in the docs, the diagrams and CLAUDE.md.
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
function toNumber(w) {
  if (!w) return NaN;
  return /^\d+$/.test(w) ? Number(w) : WORDS.indexOf(w.toLowerCase());
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'fixtures', 'evals', 'tests'].includes(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.md') && e.name !== 'CHANGELOG.md') out.push(full);
  }
  return out;
}

test('counted claims match the code: reviewers, researchers, hook registrations, skills, agents', () => {
  const counts = {
    'code reviewers': codeReviewers.length,
    'plan reviewers': planReviewers.length,
    researchers: researchers.length,
    'hook registrations': hookRegistrations.length,
  };
  const files = [...walk(PLUGIN), ...svgs.map((s) => join(DIAGRAMS, s)), join(ROOT, 'CLAUDE.md')];
  let seen = 0;
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const [what, n] of Object.entries(counts)) {
      for (const [, w] of text.matchAll(new RegExp(`\\b(\\w+) ${what}\\b`, 'gi'))) {
        if (Number.isNaN(toNumber(w)) || toNumber(w) < 0) continue;
        seen++;
        assert.equal(toNumber(w), n, `${relative(ROOT, f)}: "${w} ${what}", the code has ${n}`);
      }
    }
  }
  assert.ok(seen >= 5, `only ${seen} counted claims found: the patterns no longer match the docs`);
  // The marketplace row and the plugin README headline numbers.
  const row = readFileSync(join(ROOT, 'README.md'), 'utf8').split('\n').find((l) => l.startsWith('| [**kaizen**]'));
  assert.match(row, new RegExp(`\\| ${skills.length} skills, ${agents.length} agents,`), 'README.md: kaizen row counts');
  const readme = readFileSync(join(PLUGIN, 'README.md'), 'utf8');
  assert.match(readme, new RegExp(`## All the commands \\(${skills.length} skills\\)`));
  assert.match(readme, new RegExp(`## Agents \\(${agents.length}\\)`));
  assert.match(readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8'), new RegExp(`${skills.length} skills invoked .*${agents.length} read-only agents \\(${researchers.length} research, ${planReviewers.length} plan reviewers.*${codeReviewers.length} code reviewers`, 's'));
});
