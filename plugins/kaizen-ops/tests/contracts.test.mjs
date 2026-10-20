// kaizen-ops contracts: what its skills promise must exist, in this plugin or in Kaizen core.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '../../kaizen/scripts/lib.mjs';

const OPS = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORE = join(OPS, '..', 'kaizen');
const dirs = (d) => (existsSync(d) ? readdirSync(d).filter((x) => statSync(join(d, x)).isDirectory()) : []);
const skills = dirs(join(OPS, 'skills'));
const coreSkills = dirs(join(CORE, 'skills'));
const coreAgents = readdirSync(join(CORE, 'agents')).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'fixtures'].includes(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.md')) out.push(full);
  }
  return out;
}
const docs = walk(OPS).map((f) => ({ file: relative(OPS, f), path: f, text: readFileSync(f, 'utf8') }));

test('registered in the marketplace next to Kaizen, requiring the core version Kaizen ships', () => {
  const market = JSON.parse(readFileSync(join(OPS, '..', '..', '.claude-plugin', 'marketplace.json'), 'utf8'));
  const entry = market.plugins.find((p) => p.name === 'kaizen-ops');
  assert.ok(entry, 'kaizen-ops missing from marketplace.json');
  assert.equal(entry.source, './plugins/kaizen-ops');
  const req = JSON.parse(readFileSync(join(OPS, 'scripts', 'requires.json'), 'utf8')).kaizen;
  const core = JSON.parse(readFileSync(join(CORE, '.claude-plugin', 'plugin.json'), 'utf8')).version;
  const [a, b] = [req, core].map((v) => v.split('.').map(Number));
  assert.ok(b[0] > a[0] || (b[0] === a[0] && (b[1] > a[1] || (b[1] === a[1] && b[2] >= a[2]))), `Kaizen ${core} is older than the ${req} kaizen-ops requires`);
});

test('manifest and core requirement', () => {
  const m = JSON.parse(readFileSync(join(OPS, '.claude-plugin', 'plugin.json'), 'utf8'));
  for (const k of ['name', 'version', 'description', 'author']) assert.ok(m[k], k);
  assert.equal(m.name, 'kaizen-ops');
  assert.match(m.version, /^\d+\.\d+\.\d+$/);
  const req = JSON.parse(readFileSync(join(OPS, 'scripts', 'requires.json'), 'utf8'));
  assert.match(req.kaizen, /^\d+\.\d+\.\d+$/, 'requires.json: minimum Kaizen core version');
});

test('every skill: complete frontmatter, name = folder, useful description', () => {
  for (const s of skills) {
    const { data, error } = parseFrontmatter(readFileSync(join(OPS, 'skills', s, 'SKILL.md'), 'utf8'));
    assert.equal(error, null, `${s}: ${error}`);
    assert.equal(data.name, s);
    assert.ok(String(data.description || '').length > 80, `${s}: description too short`);
    assert.ok(data['allowed-tools'], `${s}: allowed-tools`);
  }
});

test('every cited path exists: ${CLAUDE_PLUGIN_ROOT} in this plugin, core-root in Kaizen core', () => {
  for (const { file, text } of docs) {
    for (const [, p] of text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+)/g)) assert.ok(existsSync(join(OPS, p.replace(/[.,;:)]+$/, ''))), `${file}: ${p} missing in kaizen-ops`);
    for (const [, p] of text.matchAll(/\$\(node "\$K" core-root\)\/([\w./-]+)/g)) assert.ok(existsSync(join(CORE, p.replace(/[.,;:)]+$/, ''))), `${file}: ${p} missing in Kaizen core`);
  }
});

test('every command reference names an existing skill, here or in core', () => {
  for (const { file, text } of docs) {
    for (const [, s] of text.matchAll(/\/kaizen-ops:([a-z-]+)/g)) assert.ok(skills.includes(s), `${file}: /kaizen-ops:${s} does not exist`);
    for (const line of text.split('\n')) {
      for (const [, s] of line.matchAll(/(?<![\w-])kaizen:([a-z][a-z-]*)/g)) {
        // A former /kaizen:<name>: history in a changelog, or an `old → new` note outside the skills.
        if (skills.includes(s) && (file.endsWith('CHANGELOG.md') || (!/^skills[\\/]/.test(file) && new RegExp(`/kaizen:${s}\`?\\s*→\\s*\`?/kaizen-ops:${s}\\b`).test(line)))) continue;
        assert.ok(coreSkills.includes(s) || coreAgents.includes(s), `${file}: kaizen:${s} is not a Kaizen core skill or agent`);
      }
    }
  }
});

test('documentation: README lists every skill, one guide per skill, relative links resolve', () => {
  const readme = readFileSync(join(OPS, 'README.md'), 'utf8');
  for (const s of skills) assert.ok(readme.includes(`/kaizen-ops:${s}`), `README: /kaizen-ops:${s} not documented`);
  const guides = join(OPS, 'docs', 'guides');
  const md = existsSync(guides) ? readdirSync(guides).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)) : [];
  assert.deepEqual(skills.filter((s) => !md.includes(s)), [], 'skills without a guide');
  assert.deepEqual(md.filter((g) => !skills.includes(g)), [], 'guides without a skill');
  for (const { file, path, text } of docs) {
    for (const [, link] of text.matchAll(/\]\(((?!https?:|#|mailto:)[^)\s]+)\)/g)) {
      assert.ok(existsSync(join(dirname(path), link.split('#')[0])), `${file}: broken link ${link}`);
    }
  }
});

test('no deliverable contains an absolute path or an obvious secret', () => {
  for (const { file, text } of docs) {
    assert.doesNotMatch(text, /\/home\/user\/|\/Users\/[a-z]+\//, `${file}: absolute path`);
    assert.doesNotMatch(text, /(ghp_|sk-ant-|AKIA)[A-Za-z0-9]{12,}/, `${file}: secret`);
  }
});
