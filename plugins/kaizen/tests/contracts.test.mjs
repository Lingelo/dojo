// Contrats du plugin : tout ce que les skills promettent doit exister, et rien ne doit dériver.
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

test('chaque skill : frontmatter complet, nom = dossier, description utile', () => {
  assert.ok(skills.length >= 20, `${skills.length} skills`);
  for (const s of skills) {
    const { data, error } = parseFrontmatter(readFileSync(join(PLUGIN, 'skills', s, 'SKILL.md'), 'utf8'));
    assert.equal(error, null, `${s} : ${error}`);
    assert.equal(data.name, s, `${s} : name`);
    for (const k of ['description', 'allowed-tools']) assert.ok(data[k], `${s} : ${k} manquant`);
    assert.ok(data.description.length >= 120 && data.description.length <= 1024, `${s} : description de ${data.description.length} caractères (120 à 1024)`);
    assert.match(data.description, /Utiliser|Appelée|appelé/i, `${s} : la description doit dire quand l'utiliser`);
  }
});

test('chaque agent : frontmatter complet et nom = fichier', () => {
  for (const a of agents) {
    const { data, error } = parseFrontmatter(readFileSync(join(PLUGIN, 'agents', `${a}.md`), 'utf8'));
    assert.equal(error, null, `${a} : ${error}`);
    assert.equal(data.name, a);
    for (const k of ['description', 'tools', 'model']) assert.ok(data[k], `${a} : ${k} manquant`);
    assert.doesNotMatch(String(data.tools), /\b(Write|Edit)\b/, `${a} : les agents Kaizen sont en lecture seule`);
  }
});

test('chaque fichier cité via ${CLAUDE_PLUGIN_ROOT} existe', () => {
  const missing = [];
  for (const { file, text } of docs) {
    for (const m of text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+[\w/])/g)) {
      const target = m[1].replace(/\/$/, '');
      if (!existsSync(join(PLUGIN, target))) missing.push(`${file} → ${target}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('chaque référence kaizen:<nom> désigne une skill ou un agent existant', () => {
  const known = new Set([...skills, ...agents]);
  // Marqueurs de section du plan (kaizen:goal…) et contrats d'artefacts : pas des skills.
  const markers = new Set(['goal', 'product', 'relationships', 'planning', 'constitution', 'threats', 'rollout', 'units', 'verification', 'done', 'id', 'section', 'nom']);
  const bad = [];
  for (const { file, text } of docs) {
    for (const m of text.matchAll(/kaizen:([a-z][a-z-]*)/g)) {
      if (markers.has(m[1]) || known.has(m[1])) continue;
      bad.push(`${file} → kaizen:${m[1]}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('chaque marqueur de section de plan cité est documenté dans le contrat', () => {
  const contract = readFileSync(join(PLUGIN, 'references/plan-contract.md'), 'utf8');
  for (const { file, text } of docs) {
    for (const m of text.matchAll(/<!-- kaizen:([a-z-]+) -->/g)) {
      assert.ok(contract.includes(`kaizen:${m[1]}`), `${file} : marqueur kaizen:${m[1]} absent de plan-contract.md`);
    }
  }
});

test('chaque commande du CLI citée dans la doc existe', () => {
  const cli = readFileSync(join(PLUGIN, 'scripts/kaizen.mjs'), 'utf8');
  const cases = new Set([...cli.matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]));
  const bad = [];
  for (const { file, text } of docs) {
    for (const m of text.matchAll(/node "\$K" ([a-z-]+)/g)) if (!cases.has(m[1])) bad.push(`${file} → ${m[1]}`);
  }
  assert.deepEqual(bad, []);
});

test('hooks.json pointe vers des scripts existants, chemins entre guillemets', () => {
  const hooks = JSON.parse(readFileSync(join(PLUGIN, 'hooks/hooks.json'), 'utf8'));
  for (const entries of Object.values(hooks.hooks)) {
    for (const e of entries) {
      for (const h of e.hooks) {
        const m = /"\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)"/.exec(h.command);
        assert.ok(m, `commande non citée : ${h.command}`);
        assert.ok(existsSync(join(PLUGIN, m[1])), m[1]);
      }
    }
  }
});

test('gabarits : constitution et plan d’exemple respectent leurs contrats', () => {
  const tpl = readFileSync(join(PLUGIN, 'templates/constitution.md'), 'utf8');
  for (const s of ['## Articles', '## Politique IA', '## Gouvernance', '**Contrôle :**', 'artifact: kaizen-constitution/v1']) assert.ok(tpl.includes(s), s);
  const ex = parseFrontmatter(readFileSync(join(PLUGIN, 'templates/plan-example.md'), 'utf8')).data;
  assert.equal(ex.artifact, 'kaizen-plan/v1');
});

test('le plugin est enregistré dans le marketplace et documenté', () => {
  const market = JSON.parse(readFileSync(join(ROOT, '.claude-plugin/marketplace.json'), 'utf8'));
  const entry = market.plugins.find((p) => p.name === 'kaizen');
  assert.ok(entry, 'absent de marketplace.json');
  assert.equal(entry.source, './plugins/kaizen');
  const manifest = JSON.parse(readFileSync(join(PLUGIN, '.claude-plugin/plugin.json'), 'utf8'));
  for (const k of ['name', 'version', 'description', 'author']) assert.ok(manifest[k], k);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  const readme = readFileSync(join(PLUGIN, 'README.md'), 'utf8');
  for (const s of skills) assert.ok(readme.includes(`/kaizen:${s}`), `README : /kaizen:${s} non documenté`);
  for (const a of agents) assert.ok(readme.includes(a.replace(/-reviewer$|-researcher$/, '')), `README : agent ${a} non mentionné`);
  assert.ok(readme.includes(`Agents (${agents.length})`), `README : le compte d'agents doit être ${agents.length}`);
});

test('aucun livrable du plugin ne contient de chemin absolu ni de secret évident', () => {
  for (const { file, text } of docs) {
    assert.doesNotMatch(text, /\/home\/user\/|\/Users\/[a-z]+\//, `${file} : chemin absolu`);
    assert.doesNotMatch(text, /(ghp_|sk-ant-|AKIA)[A-Za-z0-9]{12,}/, `${file} : secret`);
  }
});
