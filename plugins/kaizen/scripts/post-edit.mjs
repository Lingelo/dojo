#!/usr/bin/env node
// Kaizen — PostToolUse hook on file edits (Write, Edit, MultiEdit, NotebookEdit). Two jobs, no blocking:
//
// 1. Quality gate on: a code file was edited in this session, so the Stop hook (quality-gate.mjs) will
//    not let the turn end while the checks are red. No command to run, no skill to remember: editing
//    code is what turns it on (Markdown, `.kaizen/` and agent-skills' planning files do not).
// 2. Learnings read back: when agent-skills' spec or plan is written (`SPEC.md`, `docs/SPEC.md`,
//    `tasks/plan.md`, `tasks/todo.md`), the learnings matching it are added to Claude's context, once per
//    version of the file; when any other file is edited, the learnings whose `files` globs match it,
//    once per session.
// Always exit 0. Inactive outside a Kaizen repo (.kaizen/config.json).

import { readFileSync } from 'node:fs';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {}
const file = String(input.tool_input?.file_path || input.tool_input?.notebook_path || '');
if (!file) process.exit(0);

const PLANNING = /(^|[\\/])(SPEC\.md|docs[\\/]SPEC\.md|tasks[\\/](plan|todo)\.md)$/;
const NOT_CODE = /\.(md|mdx|txt|rst|adoc)$|(^|[\\/])\.kaizen[\\/]|(^|[\\/])(CHANGELOG|LICENSE)(\.\w+)?$/i;

try {
  const { createHash } = await import('node:crypto');
  const { existsSync } = await import('node:fs');
  const { isAbsolute, join } = await import('node:path');
  const { loadConfig, readState, repoRelative, repoRoot, writeState } = await import('./lib.mjs');
  const root = repoRoot(input.cwd || process.cwd());
  if (!root || !existsSync(join(root, '.kaizen', 'config.json'))) process.exit(0);
  const relFile = repoRelative(root, file, input.cwd || root);
  // Outside the repository (another folder, another Windows drive): not this repository's code.
  if (!relFile || relFile.startsWith('..') || isAbsolute(relFile)) process.exit(0);

  if (PLANNING.test(relFile)) {
    const text = existsSync(join(root, relFile)) ? readFileSync(join(root, relFile), 'utf8') : '';
    const hash = createHash('sha1').update(text).digest('hex').slice(0, 12);
    const seen = readState(root, 'learnings-seen.json', {});
    if (text && seen[relFile] !== hash) {
      seen[relFile] = hash;
      writeState(root, 'learnings-seen.json', seen);
      const { searchLearnings, termsOf } = await import('./learnings.mjs');
      // The headings and the first lines carry the topic; the whole file would match everything.
      const topic = text.split('\n').filter((l) => /^#{1,3} /.test(l) || /^\*\*(Description|Objective)/i.test(l)).join(' ');
      const found = searchLearnings(root, termsOf(topic || text.slice(0, 2000)), { limit: 5 });
      if (found.length) {
        const list = found.map((l) => `- ${l.path} — ${l.title}`).join('\n');
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PostToolUse',
            additionalContext:
              `[kaizen] Learnings of this repository that match ${relFile}:\n${list}\n` +
              `Read the ones that apply before going on, and cite them in ${relFile.startsWith('tasks/') ? relFile : 'tasks/plan.md'} (path) where they change a decision, a task or a test.`,
          },
        }));
      }
    }
    process.exit(0);
  }

  // A learning about this very file: once per session and learning.
  const { learningsForFile } = await import('./learnings.mjs');
  const session = input.session_id || null;
  const seen = readState(root, 'learnings-seen.json', {});
  const fresh = learningsForFile(root, relFile).filter((l) => seen[`${session}:${l.rel}`] === undefined);
  if (fresh.length) {
    for (const l of fresh) seen[`${session}:${l.rel}`] = 1;
    writeState(root, 'learnings-seen.json', seen);
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `[kaizen] Learnings about ${relFile}:\n${fresh.map((l) => `- ${l.rel} — ${l.data.title}`).join('\n')}\nRead them before changing this file further.`,
      },
    }));
  }

  if (NOT_CODE.test(relFile) || loadConfig(root).gate.enabled === false) process.exit(0);
  const gate = readState(root, 'gate.json', null);
  if (!gate?.active || gate.session !== session) {
    writeState(root, 'gate.json', { active: true, session, since: new Date().toISOString(), blocks: 0, files: [relFile] });
  } else if (!gate.files?.includes(relFile)) {
    writeState(root, 'gate.json', { ...gate, files: [...(gate.files || []), relFile].slice(-200) });
  }
} catch (err) {
  process.stderr.write(`[kaizen] post-edit: ${err.message}\n`);
}
process.exit(0);
