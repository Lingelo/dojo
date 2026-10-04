// Plugin contracts: everything the skills promise must exist, and nothing may drift.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { parseFrontmatter } from '../scripts/lib.mjs';
import { PLUGIN } from './helpers.mjs';

const ROOT = join(PLUGIN, '..', '..');
const skills = readdirSync(join(PLUGIN, 'skills')).filter((d) => statSync(join(PLUGIN, 'skills', d)).isDirectory());
const agents = readdirSync(join(PLUGIN, 'agents')).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'fixtures'].includes(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.md')) out.push(full);
  }
  return out;
}
const docs = walk(PLUGIN).map((f) => ({ file: relative(PLUGIN, f), text: readFileSync(f, 'utf8') }));

test('every skill: complete frontmatter, name = folder, useful description', () => {
  assert.ok(skills.length >= 20, `${skills.length} skills`);
  for (const s of skills) {
    const { data, error } = parseFrontmatter(readFileSync(join(PLUGIN, 'skills', s, 'SKILL.md'), 'utf8'));
    assert.equal(error, null, `${s}: ${error}`);
    assert.equal(data.name, s, `${s}: name`);
    for (const k of ['description', 'allowed-tools']) assert.ok(data[k], `${s}: ${k} missing`);
    assert.ok(data.description.length >= 120 && data.description.length <= 1024, `${s}: description of ${data.description.length} characters (120 to 1024)`);
    assert.match(data.description, /Use (it )?(when|for)|Called by/i, `${s}: the description must say when to use it`);
  }
});

test('every agent: complete frontmatter and name = file', () => {
  for (const a of agents) {
    const { data, error } = parseFrontmatter(readFileSync(join(PLUGIN, 'agents', `${a}.md`), 'utf8'));
    assert.equal(error, null, `${a}: ${error}`);
    assert.equal(data.name, a);
    for (const k of ['description', 'tools', 'model']) assert.ok(data[k], `${a}: ${k} missing`);
    assert.doesNotMatch(String(data.tools), /\b(Write|Edit)\b/, `${a}: Kaizen agents are read-only`);
  }
});

test('every file cited through ${CLAUDE_PLUGIN_ROOT} exists', () => {
  const missing = [];
  for (const { file, text } of docs) {
    for (const m of text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+[\w/])/g)) {
      const target = m[1].replace(/\/$/, '');
      if (!existsSync(join(PLUGIN, target))) missing.push(`${file} → ${target}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('every kaizen:<name> reference names an existing skill or agent', () => {
  const known = new Set([...skills, ...agents]);
  // Plan section markers (kaizen:goal…) and artifact contracts: not skills.
  const markers = new Set(['goal', 'product', 'relationships', 'planning', 'constitution', 'threats', 'rollout', 'units', 'verification', 'done', 'id', 'section', 'name']);
  const bad = [];
  for (const { file, text } of docs) {
    for (const m of text.matchAll(/kaizen:([a-z][a-z-]*)/g)) {
      if (markers.has(m[1]) || known.has(m[1])) continue;
      bad.push(`${file} → kaizen:${m[1]}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('every cited plan section marker is documented in the contract', () => {
  const contract = readFileSync(join(PLUGIN, 'references/plan-contract.md'), 'utf8');
  for (const { file, text } of docs) {
    for (const m of text.matchAll(/<!-- kaizen:([a-z-]+) -->/g)) {
      assert.ok(contract.includes(`kaizen:${m[1]}`), `${file}: marker kaizen:${m[1]} missing from plan-contract.md`);
    }
  }
});

test('every CLI command cited in the docs exists', () => {
  const cli = readFileSync(join(PLUGIN, 'scripts/kaizen.mjs'), 'utf8');
  const cases = new Set([...cli.matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]));
  const bad = [];
  for (const { file, text } of docs) {
    for (const m of text.matchAll(/node "\$K" ([a-z-]+)/g)) if (!cases.has(m[1])) bad.push(`${file} → ${m[1]}`);
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

test('templates: constitution and example plan follow their contracts', () => {
  const tpl = readFileSync(join(PLUGIN, 'templates/constitution.md'), 'utf8');
  for (const s of ['## Articles', '## AI policy', '## Governance', '**Check:**', 'NON-NEGOTIABLE', 'artifact: kaizen-constitution/v1']) assert.ok(tpl.includes(s), s);
  const ex = parseFrontmatter(readFileSync(join(PLUGIN, 'templates/plan-example.md'), 'utf8')).data;
  assert.equal(ex.artifact, 'kaizen-plan/v1');
});

test('the plugin is registered in the marketplace and documented', () => {
  const market = JSON.parse(readFileSync(join(ROOT, '.claude-plugin/marketplace.json'), 'utf8'));
  const entry = market.plugins.find((p) => p.name === 'kaizen');
  assert.ok(entry, 'missing from marketplace.json');
  assert.equal(entry.source, './plugins/kaizen');
  const manifest = JSON.parse(readFileSync(join(PLUGIN, '.claude-plugin/plugin.json'), 'utf8'));
  for (const k of ['name', 'version', 'description', 'author']) assert.ok(manifest[k], k);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  const readme = readFileSync(join(PLUGIN, 'README.md'), 'utf8');
  for (const s of skills) assert.ok(readme.includes(`/kaizen:${s}`), `README: /kaizen:${s} not documented`);
  for (const a of agents) assert.ok(readme.includes(a.replace(/-reviewer$|-researcher$/, '')), `README: agent ${a} not mentioned`);
  assert.ok(readme.includes(`Agents (${agents.length})`), `README: the agent count must be ${agents.length}`);
});

test('the README reference lists every CLI command and every hook', () => {
  const source = readFileSync(join(PLUGIN, 'scripts/kaizen.mjs'), 'utf8');
  const main = source.slice(source.indexOf('const [cmd, sub] = positional;'));
  const commands = [...main.matchAll(/^ {4}case '([a-z-]+)':/gm)].map((m) => m[1]);
  assert.ok(commands.length >= 25, `${commands.length} commands`);
  const readme = readFileSync(join(PLUGIN, 'README.md'), 'utf8');
  assert.deepEqual(commands.filter((c) => !new RegExp(`node \\$K ${c}(\\s|$)`, 'm').test(readme)), [], 'CLI commands missing from the README');
  const hooks = JSON.parse(readFileSync(join(PLUGIN, 'hooks/hooks.json'), 'utf8')).hooks;
  for (const event of Object.keys(hooks)) assert.ok(readme.includes(event), `README: ${event} hook not documented`);
});

test('documentation: one guide per skill, valid relative links', () => {
  const missing = skills.filter((s) => !existsSync(join(PLUGIN, 'docs', 'guides', `${s}.md`)));
  assert.deepEqual(missing, [], 'skills without a guide in docs/guides/');
  const extra = readdirSync(join(PLUGIN, 'docs', 'guides')).filter((f) => !skills.includes(f.replace(/\.md$/, '')));
  assert.deepEqual(extra, [], 'guides without a matching skill');
  const index = readFileSync(join(PLUGIN, 'docs', 'README.md'), 'utf8');
  for (const s of skills) assert.ok(index.includes(`(guides/${s}.md)`), `docs/README.md: guide ${s} not listed`);
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

test('no plugin deliverable contains an absolute path or an obvious secret', () => {
  for (const { file, text } of docs) {
    assert.doesNotMatch(text, /\/home\/user\/|\/Users\/[a-z]+\//, `${file}: absolute path`);
    assert.doesNotMatch(text, /(ghp_|sk-ant-|AKIA)[A-Za-z0-9]{12,}/, `${file}: secret`);
  }
});
