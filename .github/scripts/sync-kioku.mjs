#!/usr/bin/env node
/**
 * Copies the kioku plugin from its own repository into plugins/kioku/, so that it ships as an internal plugin of
 * this marketplace. Why: Claude Code's marketplace auto-update refreshes the marketplace and updates the plugins
 * that live in it, but it did not update kioku while it was an external source (observed 2026-11-03).
 *
 *   node .github/scripts/sync-kioku.mjs [--source <owner/repo>] [--ref <branch|sha>] [--from <local git dir>]
 *
 * - reads the commit SHA of the ref (default: main of Lingelo/kioku);
 * - if plugins/kioku/.kioku-source already names that SHA, does nothing (exit 0, "up to date");
 * - otherwise replaces plugins/kioku/ with the tracked files of kioku at that SHA (git archive), without .github/,
 *   and writes plugins/kioku/.kioku-source (repository and SHA, the provenance of the copy);
 * - points the marketplace entry to "./plugins/kioku" (idempotent; the other fields are kept).
 * It never edits kioku's files: plugins/kioku/ is a copy, changed in kioku's repository only.
 * Exit codes: 0 done or up to date; 1 error (nothing half-written: the copy is built aside, then swapped).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TARGET = path.join(ROOT, 'plugins', 'kioku');
const MARKER = '.kioku-source';
const CATALOG = path.join(ROOT, '.claude-plugin', 'marketplace.json');

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const source = opt('--source', 'Lingelo/kioku');
const ref = opt('--ref', 'main');
const from = opt('--from', null);

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
class SyncError extends Error {}
const fail = (message) => {
  throw new SyncError(message);
};

const work = mkdtempSync(path.join(tmpdir(), 'sync-kioku-'));
const sync = () => {
  if (!/^[\w.-]+\/[\w.-]+$/.test(source)) fail(`--source "${source}": owner/repo expected`);
  if (!/^[\w./-]+$/.test(ref)) fail(`--ref "${ref}": a branch name or a SHA expected`);
  // The kioku repository: a local clone (tests, --from) or a fresh shallow fetch of the public repository.
  let repo = from;
  if (!repo) {
    repo = path.join(work, 'kioku.git');
    git(['init', '-q', '--bare', repo]);
    git(['fetch', '-q', '--depth', '1', `https://github.com/${source}.git`, ref], repo);
  }
  const sha = git(['rev-parse', from ? ref : 'FETCH_HEAD'], repo);
  if (!/^[0-9a-f]{40}$/.test(sha)) fail(`unreadable SHA for ${source}@${ref}`);

  const markerFile = path.join(TARGET, MARKER);
  const current = existsSync(markerFile) ? readFileSync(markerFile, 'utf8').match(/^sha: ([0-9a-f]{40})$/m)?.[1] : null;
  const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
  const entry = catalog.plugins.find((p) => p.name === 'kioku');
  if (!entry) fail('no kioku entry in .claude-plugin/marketplace.json');
  const catalogUpToDate = entry.source === './plugins/kioku';

  if (current === sha && catalogUpToDate) {
    console.log(`sync-kioku: up to date (${source}@${sha.slice(0, 7)})`);
    return;
  }

  // Build the new copy next to the target (same filesystem, so the swap is a rename), then swap it in: an
  // interrupted run never leaves a half-copied plugin.
  const staged = path.join(ROOT, 'plugins', `.kioku-staging-${process.pid}`);
  const tarball = path.join(work, 'kioku.tar');
  git(['archive', '--format=tar', '-o', tarball, sha], repo);
  rmSync(staged, { recursive: true, force: true });
  mkdirSync(staged, { recursive: true });
  execFileSync('tar', ['-xf', tarball, '-C', staged]);
  rmSync(path.join(staged, '.github'), { recursive: true, force: true });
  // Symbolic links survive git archive: one pointing outside the copy would be committed into this marketplace.
  const escaping = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isSymbolicLink()) {
        const rel = path.relative(staged, path.resolve(path.dirname(p), readlinkSync(p)));
        if (rel.startsWith('..') || path.isAbsolute(rel)) escaping.push(path.relative(staged, p));
      } else if (e.isDirectory()) walk(p);
    }
  };
  walk(staged);
  if (escaping.length) fail(`symbolic link(s) pointing outside the plugin: ${escaping.join(', ')}`);
  if (!existsSync(path.join(staged, '.claude-plugin', 'plugin.json'))) fail(`${source}@${sha.slice(0, 7)} has no .claude-plugin/plugin.json`);
  if (JSON.parse(readFileSync(path.join(staged, '.claude-plugin', 'plugin.json'), 'utf8')).name !== 'kioku') fail('plugin.json name is not "kioku"');
  writeFileSync(
    path.join(staged, MARKER),
    `# Copied by .github/scripts/sync-kioku.mjs. Do not edit plugins/kioku/: change kioku in its own repository.\nrepository: https://github.com/${source}\nsha: ${sha}\n`,
  );
  rmSync(TARGET, { recursive: true, force: true });
  renameSync(staged, TARGET);

  if (!catalogUpToDate) {
    entry.source = './plugins/kioku';
    const indent = /\n {4}"/.test(readFileSync(CATALOG, 'utf8')) ? 4 : 2;
    writeFileSync(CATALOG, `${JSON.stringify(catalog, null, indent)}\n`);
  }
  console.log(`sync-kioku: plugins/kioku now at ${source}@${sha.slice(0, 7)}${current ? ` (was ${current.slice(0, 7)})` : ''}`);
};
let code = 0;
try {
  sync();
} catch (error) {
  process.stderr.write(`sync-kioku: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}\n`);
  code = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
  rmSync(path.join(ROOT, 'plugins', `.kioku-staging-${process.pid}`), { recursive: true, force: true });
}
process.exit(code);
