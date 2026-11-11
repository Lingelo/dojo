---
name: setup
description: Sets Kaizen up in a repository next to agent-skills, and says where the repository stands — initializes .kaizen/config.json and docs/learnings/, validates the verification commands the quality gate will run, declares kaizen@dojo and agent-skills@dojo for every clone, runs kaizen doctor, then names the next command. Use when the user says "install/configure Kaizen", "set up Kaizen", "where are we", "what next", "is Kaizen working", "check Kaizen", /kaizen:setup. Not for writing a spec or a plan (/kaizen:spec, /kaizen:plan).
allowed-tools: Bash(node:*), Bash(git:*), Read, Write, Edit, Glob, AskUserQuestion
argument-hint: "[check]"
---

# Setup — Kaizen in this repository, and where it stands

## Overview

Kaizen guards agent-skills' workflow; this skill makes sure the guards are on in this repository, then
says what to run next. With `check`, it only reads and reports.

Read `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`. `K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

## When to Use

- First time in a repository, or a fresh clone where `kaizen doctor` shows ⚠.
- "Where are we? What do I run now?"

**Not for:** writing the spec, the plan or the code — that is agent-skills (`/kaizen:spec`…).

## Process

1. **Diagnose.** `node "$K" doctor --in-skill` and `node "$K" status`. With `check`: report every line
   (✔ ⚠ ·) with its fix and stop here — write nothing.
2. **Initialize** (no `.kaizen/config.json`): `node "$K" init`. Show what was created.
3. **Verification commands.** `node "$K" detect`: show the `test`, `lint`, `typecheck` commands found.
   Ask once whether they are right; fix them in `.kaizen/config.json` → `verify`. Then
   `node "$K" verify` must run (red is fine — say what is red; missing is not). These are what the
   quality gate runs after every turn that edits code: slow ones go to `gate.targeted` with `{files}`.
4. **Both plugins for every clone.** `node "$K" install settings` declares `kaizen@dojo` and
   `agent-skills@dojo` in the versioned `.claude/settings.json` (ask first: a versioned file).
5. **Learnings findable.** With approval, add to `CLAUDE.md` (or `AGENTS.md` if that is what the repo
   uses): `Read docs/learnings/ before planning; /kaizen:learn after a non-obvious fix.`
6. **Next. One line per item of `status`'s `next`, the first one recommended. A repository without a
   spec → `/kaizen:spec <what to build>`; without `CONSTRAINTS.md` → mention
   `/kaizen:constraints` once, as optional.

## Common Rationalizations

| Excuse | Reality |
|---|---|
| "The tests are slow, leave `verify` empty." | An empty `verify` turns the quality gate off silently. Put the slow suite in `gate.targeted` instead. |
| "No need to declare the plugins, it works on my machine." | A clone or a cloud session without `.claude/settings.json` runs with no gate at all. |
| "I'll fix the red tests later." | Then the next turn that edits code will be blocked on them. Say what is red now. |
| "The doctor warnings are noise." | Each ⚠ is a gate that is off. Relay all of them with their fix. |

## Red Flags

- Writing `.kaizen/config.json` or `.claude/settings.json` without saying so.
- Recommending a Kaizen command for spec, plan, build, review or ship (they are agent-skills').
- `check` that modifies a file.

## Verification

- [ ] `node "$K" doctor` shows no ⚠ the user did not choose to keep.
- [ ] `node "$K" verify` runs every configured command.
- [ ] The user knows the next command and why.
