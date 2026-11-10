// Kaizen — what a repository still needs after a Kaizen update, in one list (`kaizen upgrade`).
//
// Each migration says whether it applies from the repository's own state — files, settings, hooks,
// folders — never from a remembered version: a fresh clone, a jump across several versions and a
// repository already fixed by hand all get the right answer. `apply` exists only where the change is
// safe to automate; it edits only what the migration owns and keeps everything else (formatting, lines
// the team added). The others carry their manual steps.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib.mjs';
import { PLUGIN_ID, declarePlugin } from './doctor.mjs';

export const KAIZEN_VERSION = JSON.parse(readFileSync(fileURLToPath(new URL('../.claude-plugin/plugin.json', import.meta.url)), 'utf8')).version;

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};

function readFileSafe(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

// declarePlugin refuses when everything is already declared: for a migration that is "nothing to do".
function declare(root) {
  try {
    declarePlugin(root);
    return ['.claude/settings.json'];
  } catch (e) {
    if (/already declared/.test(e.message)) return [];
    throw e;
  }
}

const CONFIG_FILES = ['.kaizen/config.json', '.kaizen/config.local.json'];

// What Kaizen's production commands (removed in 6.0) left in a repository: `deploy` / `monitor` in the
// Kaizen config files, kaizen-ops enabled in the project settings.
const OPS_ID = 'kaizen-ops@dojo';
function productionLeftovers(root) {
  const found = [];
  for (const f of CONFIG_FILES) {
    const c = readJson(join(root, f));
    for (const key of ['deploy', 'monitor']) if (c && key in c) found.push(`${f} (${key})`);
  }
  for (const f of ['.claude/settings.json', '.claude/settings.local.json']) {
    if (OPS_ID in (readJson(join(root, f))?.enabledPlugins || {})) found.push(`${f} (${OPS_ID})`);
  }
  return found;
}
// What Kaizen 6.0 no longer reads, because agent-skills covers it: config keys of removed features,
// the constitution (→ agent-skills' CONSTRAINTS.md), Kaizen Packs.
const REMOVED_KEYS = ['profile', 'models', 'risk', 'perf', 'packs', 'tracker'];
function surfaceLeftovers(root) {
  const found = [];
  for (const f of CONFIG_FILES) {
    const c = readJson(join(root, f));
    const keys = c ? REMOVED_KEYS.filter((k) => k in c) : [];
    if (keys.length) found.push({ file: f, step: `remove ${keys.map((k) => `"${k}"`).join(', ')} from ${f} (no longer read)` });
  }
  if (existsSync(join(root, 'CONSTITUTION.md')) && !existsSync(join(root, 'CONSTRAINTS.md'))) {
    found.push({ file: 'CONSTITUTION.md', step: 'turn CONSTITUTION.md into agent-skills\' CONSTRAINTS.md with /kaizen:constraints (its articles become the floor and the enforced rows), then delete it' });
  }
  if (existsSync(join(root, 'kaizen-packs'))) found.push({ file: 'kaizen-packs/', step: 'move the rules of kaizen-packs/ you still want into CONSTRAINTS.md or AGENTS.md, then delete the folder' });
  return found;
}
const AS_ID = 'agent-skills@dojo';

// Releases with a Breaking or Deprecated section that ask nothing of a repository, with the reason
// (tests/upgrade.test.mjs requires one or the other from 4.3.0 on).
export const NO_MIGRATION = {
  '5.0.0': 'new defaults ("ask") apply as-is; a team keeping typed codes sets require_before_push: true and approvals: "code"',
};

export const MIGRATIONS = [
  {
    id: 'production-removed',
    since: '6.0.0',
    title: 'Kaizen no longer deploys nor monitors: kaizen-ops and the deploy/monitor configuration are gone',
    applies(root) {
      const found = productionLeftovers(root);
      return found.length ? `${found.join(', ')}: unused since Kaizen 6.0 — deploy and monitor with the team's own tools` : null;
    },
    files: (root) => [...new Set(productionLeftovers(root).map((f) => f.split(' ')[0]))],
    // Removing configuration the team wrote is their call (they may move the commands to their own CD).
    manual: (root) => productionLeftovers(root).map((f) => {
      const [file, what] = [f.split(' ')[0], f.slice(f.indexOf('(') + 1, -1)];
      return what === OPS_ID ? `remove "${OPS_ID}" from enabledPlugins in ${file}` : `remove the "${what}" key from ${file} (keep its commands in your own deploy tooling if you use them)`;
    }),
  },
  {
    id: 'agent-skills-base',
    since: '6.0.0',
    title: 'agent-skills is the base of the workflow; Kaizen keeps the engine, learnings, PR follow-up and metrics',
    applies(root) {
      const plugins = readJson(join(root, '.claude', 'settings.json'))?.enabledPlugins || {};
      const missing = plugins[PLUGIN_ID] === true && plugins[AS_ID] !== true;
      const left = surfaceLeftovers(root);
      if (!missing && !left.length) return null;
      return [missing && `.claude/settings.json enables ${PLUGIN_ID} but not ${AS_ID}`, ...left.map((l) => `${l.file}: no longer read`)].filter(Boolean).join('; ');
    },
    files: (root) => ['.claude/settings.json', ...surfaceLeftovers(root).map((l) => l.file)],
    apply(root) {
      const plugins = readJson(join(root, '.claude', 'settings.json'))?.enabledPlugins || {};
      return plugins[PLUGIN_ID] === true && plugins[AS_ID] !== true ? declare(root) : [];
    },
    manual: (root) => surfaceLeftovers(root).map((l) => l.step),
  },
];

const initialized = (root) => existsSync(join(root, '.kaizen', 'config.json'));

// → [{ id, since, title, reason, files, auto, manual }] for the migrations this repository needs.
export function pending(root, config = loadConfig(root), migrations = MIGRATIONS) {
  if (!initialized(root)) return [];
  const out = [];
  for (const m of migrations) {
    const reason = m.applies(root, config);
    if (!reason) continue;
    out.push({ id: m.id, since: m.since, title: m.title, reason, files: m.files(root, config), auto: Boolean(m.apply), manual: m.manual ? m.manual(root, config) : [] });
  }
  return out;
}

// Applies the automatable migrations that still apply, in order (each one re-checked: an earlier one may
// have done its work). → { applied: [{ id, written }], manual: [{ id, steps }], written: [paths] }
export function applyAll(root, migrations = MIGRATIONS) {
  const applied = [];
  const manual = [];
  for (const m of migrations) {
    if (!initialized(root)) break;
    const config = loadConfig(root);
    if (!m.applies(root, config)) continue;
    if (m.apply) {
      const written = m.apply(root, config);
      if (written.length) applied.push({ id: m.id, written });
    }
    // What is left to the team, read after the automatic part.
    const steps = m.manual ? m.manual(root, loadConfig(root)) : [];
    if (steps.length) manual.push({ id: m.id, steps });
  }
  return { applied, manual, written: [...new Set(applied.flatMap((a) => a.written))] };
}

// Text for `kaizen upgrade` (list) and `kaizen upgrade --apply` (result).
export function formatUpgrade(list, result = null) {
  if (result) {
    const lines = [];
    if (!result.applied.length && !result.manual.length) return `Kaizen ${KAIZEN_VERSION} — nothing to migrate in this repo.`;
    for (const a of result.applied) lines.push(`✔ ${a.id} — ${a.written.join(', ')}`);
    for (const m of result.manual) for (const s of m.steps) lines.push(`✋ ${m.id} — by hand: ${s}`);
    if (result.written.length) lines.push(`\nCommit: ${result.written.join(' ')}`);
    return lines.join('\n');
  }
  if (!list.length) return `Kaizen ${KAIZEN_VERSION} — nothing to migrate in this repo.`;
  const lines = [`Kaizen ${KAIZEN_VERSION} — ${list.length} migration(s) pending in this repo`];
  for (const m of list) {
    lines.push(`\n${m.auto ? '✎' : '✋'} ${m.id} (since ${m.since}) — ${m.title}`);
    lines.push(`    why: ${m.reason}`);
    if (m.files.length) lines.push(`    files: ${m.files.join(', ')}`);
    for (const s of m.manual) lines.push(`    by hand: ${s}`);
  }
  if (list.some((m) => m.auto)) lines.push('\nApply the ✎ ones: node $K upgrade --apply (lists the files to commit)');
  return lines.join('\n');
}
