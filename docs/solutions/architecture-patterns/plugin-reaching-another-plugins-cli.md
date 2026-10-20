---
title: "One plugin running another plugin's CLI: a resolver shim, not a dependency"
category: architecture-patterns
date: 2026-10-20
severity: medium
tags:
  - plugin-architecture
  - cross-plugin
  - cli-resolution
  - plugin-cache
  - cross-platform
  - deprecation
components:
  - kaizen-ops
  - kaizen
  - plugins/kaizen-ops/scripts/kaizen.mjs
  - plugins/kaizen/scripts/doctor.mjs
resolution_time: session
---

# One plugin running another plugin's CLI: a resolver shim, not a dependency

**Category:** architecture-patterns
**Applies to:** any plugin of this marketplace whose skills need the scripts, references or config
docs of another plugin (first case: kaizen-ops on Kaizen core, Kaizen 4.0 — PRs #36–#38, plan
`docs/plans/2026-10-20-1515-refactor-kaizen-core-ops-split-plan.md`).

## Problem

Moving skills out of a plugin breaks every path they use: `${CLAUDE_PLUGIN_ROOT}` is **per plugin**,
so in the new plugin `${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs`, `…/references/conventions.md` and
`…/docs/configuration.md` point at files that stayed behind. Claude Code gives no declared plugin
dependency to lean on, and installed plugins live in separate, versioned cache folders
(`~/.claude/plugins/cache/<marketplace>/<plugin>/<semver>/`), so a relative path between them is a guess.

## Root Cause

A skill only knows its own plugin root. Anything shared — a CLI, conventions, a config reference —
must be found at runtime, and the finding has to work in four places: a developer checkout
(`--plugin-dir`, this repo), the plugin cache, an explicit override, and CI on macOS, Linux and Windows.

## Working Solution

Ship a **resolver shim** at the path the moved skills already use (`kaizen-ops/scripts/kaizen.mjs`):
the skills keep `K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"` and every `node "$K" …` line unchanged,
and the shim finds the other plugin and forwards.

1. **Resolution order** (the git hooks' order, plus the checkout): `git config kaizen.cli` →
   `$KAIZEN_CLI` → sibling `<plugin>/../kaizen` → newest semver of `cache/dojo/kaizen/<x.y.z>`.
   Every candidate is accepted only if its `.claude-plugin/plugin.json` says `"name": "kaizen"`.
2. **An explicit pointer that is wrong is refused, never replaced** — silently picking another core
   would run a different version than the one the user pinned.
3. **Version gate from a file** (`scripts/requires.json`), not from `plugin.json`, which keeps only the
   fields the marketplace contract requires. A too-old core stops with both versions and the fix.
4. **Forward everything**: `spawnSync(process.execPath, [core, ...args], { stdio: 'inherit' })`, exit code
   returned — stdin, stdout, stderr and the exit status are the CLI's own.
5. **Answer `core-root` locally**, so skills read shared files as `$(node "$K" core-root)/references/…`
   instead of copying them: one source for conventions and config docs.
6. **Keep every gate in the plugin that owns the CLI and hooks.** The moved plugin carries skills and
   docs only; a core contract test fails if any core script or hook mentions the other plugin. A
   protection must never depend on a second plugin being enabled.
7. **Migration signal through the doctor, not the runtime**: a plugin cannot list enabled plugins, so
   `kaizen doctor` reads project, local and user `settings.json` and warns when a repo that needs the
   moved commands (declared deploy environments or signals) does not enable them.

## Pitfalls hit on the way

- **macOS symlinked tmp dirs** — `/var` → `/private/var`. Node resolves `import.meta.url` to the real
  path but leaves `process.argv[1]` as given, so `argv[1] === fileURLToPath(import.meta.url)` is false and
  the "run as a script" guard never fires; tests comparing paths fail the same way. Compare
  `realpathSync` on both sides. Reproduce on Linux with `TMPDIR` pointing through a symlink.
- **Contract tests that read only one plugin** — after a move, references to old command names must be
  checked in both plugins. Changelogs keep the names of their time; elsewhere allow an old name only on
  the line that names its replacement (`/kaizen:deploy → /kaizen-ops:deploy`), and fail on anything else.
- **Stubs and rename detection** — a deprecation stub written at the old path makes git see a rewrite
  plus a new file, not a move (1,549 "changed" lines). Commit the pure `git mv` first, the stubs after:
  the move then reads as renames (74–100 % similar) and the PR can be reviewed commit by commit.
- **Stub skills and `allowed-tools`** — a stub that says "run doctor" with `allowed-tools: Read` asks for
  a tool it cannot use (see `docs/solutions/logic-errors/allowed-tools-frontmatter-body-mismatch.md`):
  stubs only answer.
- **Evals across plugins** — `claude --plugin-dir` is repeatable; load both plugins.

## Detection

- `node plugins/kaizen-ops/scripts/kaizen.mjs --version` names the core it found, its version and the
  source (`sibling checkout`, `plugin cache`, `KAIZEN_CLI`, `git config kaizen.cli`).
- `kaizen doctor` → `ops_plugin` on a repo that deploys without the second plugin enabled.
- Contract tests of both plugins: missing `core-root` targets, broken cross-plugin links, leftover old
  command names, a core script referring to kaizen-ops.

## Prevention Strategies

- Split by **what users see** (skills, docs), keep **what enforces** (CLI, hooks, gates) in one place.
- Give the moved plugin its own contract tests from the first slice, before it carries any skill.
- Test the resolver in a fake world under a folder with a space, with an isolated `CLAUDE_CONFIG_DIR`
  and `GIT_CONFIG_GLOBAL`, and run CI on the three OSes before trusting path logic.
- Ship the new plugin unregistered first (skeleton + resolver), then register it in the same commit
  that removes the commands from the old one, so no state has the commands in neither plugin.
