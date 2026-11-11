// Plugin contracts: everything the skills and the docs promise must exist, and nothing may drift.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { parseFrontmatter } from '../scripts/lib.mjs';
import { PLUGIN } from './helpers.mjs';

const ROOT = join(PLUGIN, '..', '..');
const AGENT_SKILLS = join(ROOT, 'plugins', 'agent-skills');
const skills = readdirSync(join(PLUGIN, 'skills')).filter((d) => statSync(join(PLUGIN, 'skills', d)).isDirectory());

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'fixtures'].includes(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.md')) out.push(full);
  }
  return out;
}
const docs = walk(PLUGIN).map((f) => ({ file: relative(PLUGIN, f).split('\\').join('/'), text: readFileSync(f, 'utf8') }));

const commands = readdirSync(join(PLUGIN, 'commands')).map((f) => f.replace(/\.md$/, ''));

test('four skills, nothing agent-skills already does', () => {
  assert.deepEqual([...skills].sort(), ['learn', 'metrics', 'setup', 'watch']);
  assert.ok(!existsSync(join(PLUGIN, 'agents')), 'agent-skills\' personas review; Kaizen ships no agent');
});

test('agent-skills\' commands under Kaizen\'s prefix: exact copies, one per command, never shadowing a skill', async () => {
  const { expected } = await import('../scripts/aliases.mjs');
  const want = expected();
  assert.deepEqual([...commands].sort(), Object.keys(want).map((f) => f.replace(/\.md$/, '')).sort(), 'run node plugins/kaizen/scripts/aliases.mjs');
  for (const [f, text] of Object.entries(want)) assert.equal(readFileSync(join(PLUGIN, 'commands', f), 'utf8'), text, `commands/${f} differs from agent-skills' — run node plugins/kaizen/scripts/aliases.mjs`);
  for (const c of ['spec', 'plan', 'build', 'test', 'review', 'ship']) assert.ok(commands.includes(c), `/kaizen:${c}`);
  assert.deepEqual(commands.filter((c) => skills.includes(c)), []);
});

test('every skill: complete frontmatter, and agent-skills\' anatomy (when, process, rationalizations, red flags, verification)', () => {
  for (const s of skills) {
    // A Windows checkout may turn line endings into CRLF.
    const text = readFileSync(join(PLUGIN, 'skills', s, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
    const { data, error } = parseFrontmatter(text);
    assert.equal(error, null, `${s}: ${error}`);
    assert.equal(data.name, s, `${s}: name`);
    for (const k of ['description', 'allowed-tools']) assert.ok(data[k], `${s}: ${k} missing`);
    assert.ok(data.description.length >= 120 && data.description.length <= 1024, `${s}: description of ${data.description.length} characters (120 to 1024)`);
    assert.match(data.description, /\bUse (it |only )?(when|for|after)\b/i, `${s}: the description must say when to use it`);
    for (const h of ['## Overview', '## When to Use', '## Process', '## Common Rationalizations', '## Red Flags', '## Verification']) assert.ok(text.includes(h), `${s}: section "${h}" missing`);
    assert.match(text, /\| Excuse \| Reality \|\n\|---\|---\|\n(\|[^\n]+\|\n){3,}/, `${s}: at least three rationalizations`);
    assert.match(text.split('## Verification')[1], /- \[ \] /, `${s}: verification as a checklist`);
  }
});

test('every file cited through ${CLAUDE_PLUGIN_ROOT} exists', () => {
  const missing = [];
  for (const { file, text } of docs) {
    for (const m of text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+[\w/])/g)) if (!existsSync(join(PLUGIN, m[1].replace(/\/$/, '')))) missing.push(`${file} → ${m[1]}`);
  }
  assert.deepEqual(missing, []);
});

test('every /kaizen:<name> names a Kaizen skill or command, every agent-skills:<name> one of its commands or skills', () => {
  const asCommands = readdirSync(join(AGENT_SKILLS, '.claude', 'commands')).map((f) => f.replace(/\.md$/, ''));
  const asSkills = readdirSync(join(AGENT_SKILLS, 'skills'));
  const bad = [];
  const sources = [...docs, { file: 'README(root)', text: readFileSync(join(ROOT, 'README.md'), 'utf8') }];
  for (const f of readdirSync(join(PLUGIN, 'scripts'))) sources.push({ file: `scripts/${f}`, text: readFileSync(join(PLUGIN, 'scripts', f), 'utf8') });
  for (const { file, text } of sources) {
    for (const m of text.matchAll(/(?<![\w-])\/kaizen:([a-z][a-z-]*)/g)) if (!skills.includes(m[1]) && !commands.includes(m[1])) bad.push(`${file} → /kaizen:${m[1]}`);
    for (const m of text.matchAll(/(?<![\w./-])agent-skills:([a-z][a-z-]*)/g)) if (!asCommands.includes(m[1]) && !asSkills.includes(m[1])) bad.push(`${file} → agent-skills:${m[1]}`);
  }
  assert.deepEqual(bad, []);
});

test('every CLI command cited in the docs and skills exists', () => {
  const cli = readFileSync(join(PLUGIN, 'scripts/kaizen.mjs'), 'utf8');
  const cases = new Set([...cli.matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]));
  const bad = [];
  for (const { file, text } of docs) {
    for (const m of text.matchAll(/node "?\$K"? ([a-z-]+)/g)) if (!cases.has(m[1])) bad.push(`${file} → ${m[1]}`);
  }
  assert.deepEqual(bad, []);
});

test('hooks.json points to existing scripts, with quoted paths', () => {
  const hooks = JSON.parse(readFileSync(join(PLUGIN, 'hooks/hooks.json'), 'utf8'));
  for (const entries of Object.values(hooks.hooks)) {
    for (const e of entries) {
      for (const h of e.hooks) {
        const m = /"\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)"/.exec(h.command);
        assert.ok(m, `unquoted command: ${h.command}`);
        assert.ok(existsSync(join(PLUGIN, m[1])), m[1]);
      }
    }
  }
});

test('the plugin is registered in the marketplace, next to agent-skills, and documented', () => {
  const market = JSON.parse(readFileSync(join(ROOT, '.claude-plugin/marketplace.json'), 'utf8'));
  assert.equal(market.plugins.find((p) => p.name === 'kaizen')?.source, './plugins/kaizen');
  assert.equal(market.plugins.find((p) => p.name === 'agent-skills')?.source, './plugins/agent-skills');
  const manifest = JSON.parse(readFileSync(join(PLUGIN, '.claude-plugin/plugin.json'), 'utf8'));
  for (const k of ['name', 'version', 'description', 'author']) assert.ok(manifest[k], k);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  const readme = readFileSync(join(PLUGIN, 'README.md'), 'utf8');
  for (const s of [...skills, ...commands]) assert.ok(readme.includes(`/kaizen:${s}`), `README: /kaizen:${s} not documented`);
});

test('the README reference lists every CLI command and every hook', () => {
  const source = readFileSync(join(PLUGIN, 'scripts/kaizen.mjs'), 'utf8');
  const main = source.slice(source.indexOf('const [cmd, sub] = positional;'));
  const commands = [...main.matchAll(/^ {4}case '([a-z-]+)':/gm)].map((m) => m[1]);
  const readme = readFileSync(join(PLUGIN, 'README.md'), 'utf8');
  assert.deepEqual(commands.filter((c) => !new RegExp(`node \\$K ${c}(\\s|$)`, 'm').test(readme)), [], 'CLI commands missing from the README');
  const hooks = JSON.parse(readFileSync(join(PLUGIN, 'hooks/hooks.json'), 'utf8')).hooks;
  for (const [event, entries] of Object.entries(hooks)) {
    assert.ok(readme.includes(event), `README: ${event} hook not documented`);
    for (const e of entries) for (const h of e.hooks) assert.ok(readme.includes(h.command.match(/scripts\/([\w-]+\.mjs)/)[1]), `README: ${h.command} not documented`);
  }
});

test('documentation: one guide per skill, every page indexed, valid relative links', () => {
  const guides = readdirSync(join(PLUGIN, 'docs', 'guides')).map((f) => f.replace(/\.md$/, ''));
  assert.deepEqual([...guides].sort(), [...skills].sort(), 'docs/guides/ holds exactly one guide per skill');
  const index = readFileSync(join(PLUGIN, 'docs', 'README.md'), 'utf8');
  for (const f of walk(join(PLUGIN, 'docs'))) {
    const r = relative(join(PLUGIN, 'docs'), f).split('\\').join('/');
    if (r !== 'README.md') assert.ok(index.includes(`(${r})`), `docs/README.md: ${r} not listed`);
  }
  const broken = [];
  for (const f of [...walk(join(PLUGIN, 'docs')), join(PLUGIN, 'README.md'), join(PLUGIN, 'CHANGELOG.md')]) {
    const text = readFileSync(f, 'utf8').replace(/```[\s\S]*?```/g, '');
    for (const m of text.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)) {
      if (/^(https?:|mailto:)/.test(m[1])) continue;
      if (!existsSync(join(f, '..', m[1]))) broken.push(`${relative(PLUGIN, f)} → ${m[1]}`);
    }
  }
  assert.deepEqual(broken, []);
});

test('documentation: every #anchor link points to an existing heading', () => {
  // GitHub heading slugs: lower case, backticks and asterisks dropped, punctuation removed, spaces → dashes.
  const slug = (h) => h.trim().toLowerCase().replace(/[`*]/g, '').replace(/[^\p{L}\p{N}_\- ]/gu, '').replace(/ /g, '-');
  const anchorsOf = (file) => {
    const seen = {};
    const out = new Set();
    for (const m of readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '').matchAll(/^#{1,6}\s+(.*)$/gm)) {
      const s = slug(m[1]);
      out.add(seen[s] ? `${s}-${seen[s]}` : s);
      seen[s] = (seen[s] || 0) + 1;
    }
    return out;
  };
  const broken = [];
  for (const f of [...walk(join(PLUGIN, 'docs')), join(PLUGIN, 'README.md')]) {
    const text = readFileSync(f, 'utf8').replace(/```[\s\S]*?```/g, '');
    for (const m of text.matchAll(/\]\(([^)#\s]*)#([^)\s]+)\)/g)) {
      const target = m[1] ? join(f, '..', m[1]) : f;
      if (!target.endsWith('.md') || !existsSync(target)) continue;
      if (!anchorsOf(target).has(m[2])) broken.push(`${relative(PLUGIN, f)} → ${m[1]}#${m[2]}`);
    }
  }
  assert.deepEqual(broken, []);
});

test('every configuration key the code reads is documented', () => {
  const lib = readFileSync(join(PLUGIN, 'scripts', 'lib.mjs'), 'utf8');
  const start = lib.indexOf('export const DEFAULT_CONFIG');
  const keys = [...lib.slice(start, lib.indexOf('\n};', start)).matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]);
  assert.ok(keys.length >= 7, keys.join(', '));
  const conf = readFileSync(join(PLUGIN, 'docs', 'reference', 'configuration.md'), 'utf8');
  for (const k of keys) assert.ok(conf.includes(`\`${k}\``), `configuration.md: ${k} not documented`);
});

test('no plugin deliverable contains an absolute path or an obvious secret', () => {
  for (const { file, text } of docs) {
    assert.doesNotMatch(text, /\/home\/user\/|\/Users\/[a-z]+\//, `${file}: absolute path`);
    assert.doesNotMatch(text, /(ghp_|sk-ant-|AKIA)[A-Za-z0-9]{12,}/, `${file}: secret`);
  }
});
