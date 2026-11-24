#!/usr/bin/env node
// Kaizen — hooks around the session's model (`models` in the configuration). Advice only: a hook cannot
// change the model, and these never stop a build that may run.
//
//   --record   (SessionStart, PostModelSwitch): the session's model, from SessionStart's `model` (optional:
//              Claude Code omits it in some sessions, `-p` included) or PostModelSwitch's `to_model` (every
//              `/model` switch, fallback and resume), kept in `.kaizen/state/session-model.json`.
//   --command  (UserPromptExpansion on /kaizen:build and /kaizen:build-fork, typed by the user):
//              - /kaizen:build with `models.enabled`, on another model family than `models.build`: a warning
//                to the user (`systemMessage`), the build goes on. The model is the one recorded, else the
//                last answer's in the transcript; unknown (a fresh session whose SessionStart had none) →
//                silent, never a guess.
//              - /kaizen:build-fork: refused (exit 2, the reason shown to the user) while `models.build_fork`
//                is off, and for `auto`/`all` — a forked build cannot stop for your approval.
// Inactive outside a Kaizen repo, except the refusal of /kaizen:build-fork (off by default). Any error lets
// the command through.

import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {}

const mode = process.argv.includes('--record') ? 'record' : 'command';
const KEEP = 20; // sessions remembered

// The model of the last answer in a transcript (its tail only: a long session's file is large).
function lastModel(file, bytes = 256 * 1024) {
  try {
    const size = statSync(file).size;
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    const fd = openSync(file, 'r');
    try {
      readSync(fd, buf, 0, buf.length, start);
    } finally {
      closeSync(fd);
    }
    const lines = buf.toString('utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      let e;
      try {
        e = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      if (e.isSidechain) continue;
      const m = e.message?.role === 'assistant' ? e.message.model : null;
      if (m && !m.startsWith('<')) return m; // `<synthetic>`: a message Claude Code wrote itself
    }
  } catch {}
  return null;
}

try {
  const { readState, repoRoot, writeState, loadConfig, modelFamily } = await import('./lib.mjs');
  const root = repoRoot(input.cwd || process.cwd());
  const initialized = Boolean(root && existsSync(join(root, '.kaizen', 'config.json')));
  const session = input.session_id || null;

  if (mode === 'record') {
    const model = input.hook_event_name === 'PostModelSwitch' ? input.to_model : input.model;
    if (initialized && session && model) {
      const all = readState(root, 'session-model.json', {});
      all[session] = { model, source: input.hook_event_name === 'PostModelSwitch' ? `switch:${input.source || '?'}` : `start:${input.source || '?'}`, at: new Date().toISOString() };
      const kept = Object.entries(all).sort((a, b) => String(b[1].at).localeCompare(String(a[1].at))).slice(0, KEEP);
      writeState(root, 'session-model.json', Object.fromEntries(kept));
    }
    process.exit(0);
  }

  const name = String(input.command_name || '').replace(/^\//, '');
  const config = loadConfig(initialized ? root : null);
  const models = config.models || {};

  if (name === 'kaizen:build-fork') {
    const arg = String(input.command_args || '').trim().split(/\s+/)[0].toLowerCase();
    let reason = null;
    if (models.build_fork !== true)
      reason =
        '/kaizen:build-fork is off: set "models": { "build_fork": true } in .kaizen/config.json (or config.local.json) to run one task forked on a Sonnet agent — or run /kaizen:build.';
    else if (arg === 'auto' || arg === 'all') reason = '/kaizen:build-fork runs one task: a forked build cannot stop for your approval. Run /kaizen:build auto in the session instead.';
    if (reason) {
      process.stderr.write(`[kaizen] ${reason}\n`);
      process.exit(2);
    }
    process.exit(0);
  }

  if (name === 'kaizen:build' && initialized && models.enabled === true && models.build) {
    const model = (session && readState(root, 'session-model.json', {})[session]?.model) || (input.transcript_path ? lastModel(input.transcript_path) : null);
    const want = modelFamily(models.build);
    if (model && want !== 'other' && modelFamily(model) !== want) {
      const { launchFor } = await import('./lib.mjs');
      const launch = launchFor('/kaizen:build', config);
      process.stdout.write(
        `${JSON.stringify({
          systemMessage:
            `[kaizen] /kaizen:build is running on ${model}, models.build is ${models.build}: switch with \`/model ${models.build}\` ` +
            `(the prompt cache is rebuilt once), or build in a fresh session: ${launch?.command || `claude --model ${models.build}`}.` +
            (models.build_fork === true ? ' Or /kaizen:build-fork: one task, forked on Sonnet.' : ''),
        })}\n`,
      );
    }
  }
} catch (err) {
  process.stderr.write(`[kaizen] model-hooks: ${err.message}\n`);
}
process.exit(0);
