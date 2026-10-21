// Kaizen — what a repository still needs after a Kaizen update, in one list (`kaizen upgrade`).
//
// Each migration says whether it applies from the repository's own state — files, settings, hooks,
// folders — never from a remembered version: a fresh clone, a jump across several versions and a
// repository already fixed by hand all get the right answer. `apply` exists only where the change is
// safe to automate; it edits only what the migration owns and keeps everything else (formatting, lines
// the team added). The others carry their manual steps.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { docsRoot, loadConfig, PROFILE_ALIASES } from './lib.mjs';
import { PLUGIN_ID, gitHooksState, opsDeclared, opsNeeded } from './doctor.mjs';
import { declarePlugin, refreshHookLookups } from './githooks.mjs';

export const KAIZEN_VERSION = JSON.parse(readFileSync(fileURLToPath(new URL('../.claude-plugin/plugin.json', import.meta.url)), 'utf8')).version;
// The docs folder as the team writes it in a command: relative, forward slashes.
const docs = (root, config) => relative(root, docsRoot(root, config)).split('\\').join('/');

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

const CONFIGS = ['.kaizen/config.json', '.kaizen/config.local.json'];
// `"profile": "lean"`, whatever the spacing: the value is rewritten in place, the file is never reformatted.
const OLD_PROFILE = new RegExp(`("profile"\\s*:\\s*")(${Object.keys(PROFILE_ALIASES).join('|')})(")`);

// `kaizen@<marketplace>` keys other than the dojo one, enabled in the versioned settings.
function oldMarketplaceIds(root) {
  const plugins = readJson(join(root, '.claude', 'settings.json'))?.enabledPlugins || {};
  return Object.keys(plugins).filter((id) => /^kaizen@/.test(id) && id !== PLUGIN_ID && plugins[id] === true);
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

// Releases with a Breaking or Deprecated section that ask nothing of a repository, with the reason
// (tests/upgrade.test.mjs requires one or the other from 4.3.0 on).
export const NO_MIGRATION = {};

export const MIGRATIONS = [
  {
    id: 'learnings-folder',
    since: '2.0.0',
    title: 'learnings live in <docs>/learnings/, not <docs>/solutions/',
    applies(root, config) {
      const d = docs(root, config);
      if (!existsSync(join(root, d, 'solutions')) || existsSync(join(root, d, 'learnings'))) return null;
      return `${d}/solutions/ exists and ${d}/learnings/ does not: no agent reads the old folder`;
    },
    files: (root, config) => [`${docs(root, config)}/solutions/`],
    // A folder rename moves the team's history: they run it, and review the diff.
    manual: (root, config) => [`git mv ${docs(root, config)}/solutions ${docs(root, config)}/learnings`],
  },
  {
    id: 'marketplace-dojo',
    since: '3.1.0',
    // Plain text: doctor imports this module, which must not read doctor's exports while it loads.
    title: 'the marketplace is "dojo": plugins are enabled as kaizen@dojo',
    applies(root) {
      const old = oldMarketplaceIds(root);
      const plugins = readJson(join(root, '.claude', 'settings.json'))?.enabledPlugins || {};
      if (!old.length || plugins[PLUGIN_ID] === true) return null;
      return `.claude/settings.json enables ${old.join(', ')} but not ${PLUGIN_ID}: clones load no Kaizen`;
    },
    files: () => ['.claude/settings.json'],
    apply: declare,
    manual: (root) => oldMarketplaceIds(root).map((id) => `remove "${id}" (and its marketplace) from .claude/settings.json once ${PLUGIN_ID} works`),
  },
  {
    id: 'profile-names',
    since: '3.4.0',
    title: 'profiles are named by stakes: lean → prototype, standard → product, full → critical',
    applies(root) {
      const hits = CONFIGS.map((f) => [f, readFileSafe(join(root, f)).match(OLD_PROFILE)?.[2]]).filter(([, p]) => p);
      if (!hits.length) return null;
      return hits.map(([f, p]) => `"profile": "${p}" in ${f} (read as "${PROFILE_ALIASES[p]}", reported deprecated)`).join('; ');
    },
    files: (root) => CONFIGS.filter((f) => OLD_PROFILE.test(readFileSafe(join(root, f)))),
    apply(root) {
      const written = [];
      for (const f of CONFIGS) {
        const text = readFileSafe(join(root, f));
        if (!OLD_PROFILE.test(text)) continue;
        writeFileSync(join(root, f), text.replace(OLD_PROFILE, (_, a, p, b) => `${a}${PROFILE_ALIASES[p]}${b}`));
        written.push(f);
      }
      return written;
    },
  },
  {
    id: 'kaizen-ops',
    since: '4.0.0',
    title: 'deploy, monitor and postmortem moved to the kaizen-ops plugin',
    applies(root, config) {
      const why = opsNeeded(root, config);
      if (!why || opsDeclared(root)) return null;
      return `this repo ${why}, and kaizen-ops is not enabled: /kaizen-ops:deploy, monitor and postmortem are missing`;
    },
    files: () => ['.claude/settings.json'],
    apply: declare,
  },
  {
    id: 'hook-lookup',
    since: '4.1.2',
    title: 'git hooks accept only Kaizen core behind git config kaizen.cli or $KAIZEN_CLI',
    applies(root) {
      const { outdated } = gitHooksState(root);
      return outdated.length ? `.githooks/${outdated.join(', ')}: CLI lookup of an older Kaizen (runs any file a pointer names)` : null;
    },
    files: (root) => gitHooksState(root).outdated.map((h) => `.githooks/${h}`),
    apply: refreshHookLookups,
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
    // What is left to the team, read after the automatic part (e.g. the old marketplace key to remove).
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
