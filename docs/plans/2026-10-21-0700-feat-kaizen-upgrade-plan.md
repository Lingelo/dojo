---
title: Kaizen upgrade - Plan
type: feat
date: 2026-10-21
topic: kaizen-upgrade
artifact: kaizen-plan/v1
source: plan
---

# Kaizen upgrade - Plan

<!-- kaizen:goal -->
## Goal capsule

**Goal:** a team that updates Kaizen learns, in one place, every change its repository needs for the
new version, and applies the safe ones with one command — instead of discovering them one by one in
`config`, `doctor` and the CHANGELOG.
**Means:** a registry of migrations in core, each detecting from the repository's own state whether it
applies; `kaizen upgrade` lists them and `--apply` runs the ones that are safe to automate; `doctor`
and `help` point to it; a contract keeps every future user-facing change in the registry.
**Product authority:** Angélo LIMA in session on 2026-10-21 ("Lance les evals d'abord, puis cadre
upgrade"), after the recommendation of a single upgrade path.
**Open blockers:** none.

<!-- kaizen:product -->
## Product contract

### Summary
Add `kaizen upgrade`: one command that tells a repository which Kaizen migrations it still needs, what
each changes, and applies the automatable ones without overwriting anything. Surface it through
`kaizen doctor` (run first by `help`, `work`, `setup`), and make every future breaking or deprecating
release declare its migration.

### Problem
Since 3.0, every release that asks something of the repository signals it somewhere else, or nowhere:

| Since | Change the repository needs | Signalled today by | Fix today |
|---|---|---|---|
| 2.0.0 | learnings folder `docs/solutions/` → `docs/learnings/` | nothing (no compatibility) | `git mv` by hand |
| 3.1.0 | marketplace renamed `dojo`: `enabledPlugins` `kaizen@<old>` → `kaizen@dojo` | `doctor` says kaizen@dojo is not declared, not why | edit `.claude/settings.json` |
| 3.4.0 | profile `lean`/`standard`/`full` → `prototype`/`product`/`critical` | `kaizen config` only | edit `.kaizen/config.json` |
| 4.0.0 | production commands moved to `kaizen-ops` | `doctor` → `ops_plugin` | `audit fix claude_settings` |
| 4.1.2 | git hooks whose CLI lookup runs any explicit pointer | `doctor` → `git_hooks` (since 4.2.0) | `audit fix git_hooks` |

A team jumping from 3.x to 4.2 has to find three or four signals in three places and run as many
commands; the first one (`kaizen config`) is never run by a skill. Nothing guarantees the next breaking
release adds its signal at all.

### Requirements

**Seeing what is pending**
- R1. `kaizen upgrade` lists, for the current repository, every migration that applies to it: the
  Kaizen version that introduced it, what it changes (files), whether it can be applied automatically,
  and the manual steps otherwise. A repository with nothing pending gets one line saying so.
- R2. A migration applies because of the repository's state (files, settings, hooks, folders), never
  because of a remembered version: a fresh clone, a repository updated across several versions and one
  already migrated by hand all get the right answer.

**Applying**
- R3. `kaizen upgrade --apply` runs the automatable migrations that apply, and only those; it never
  overwrites a file it does not own the change in, keeps formatting and lines the team added, and ends
  with the list of files to commit. Running it twice changes nothing the second time.
- R4. A migration that cannot be automated safely is listed with its exact manual steps and never
  touched by `--apply`.

**Being told**
- R5. `kaizen doctor` reports pending migrations as one check with their count and the fix
  (`node "$K" upgrade`); `/kaizen:help` and `/kaizen:setup` relay it, `setup` offers to apply.

**Staying complete**
- R6. Every CHANGELOG release of Kaizen that has a **Breaking** or **Deprecated** section, from 4.3.0
  on, is matched by a registered migration or by an explicit "nothing to migrate" entry with its reason;
  a contract test fails otherwise.

### Acceptance examples
- AE1. (covers R1, R2) Given a repository with `"profile": "lean"`, `deploy.environments.production`
  declared, `kaizen@dojo` but not `kaizen-ops@dojo` in `.claude/settings.json`, and `.githooks/pre-push`
  as Kaizen 4.1.1 wrote it, when the user runs `node $K upgrade`, then it lists `profile-names`,
  `kaizen-ops` and `hook-lookup` with their versions and files, all automatable.
- AE2. (covers R3) Given AE1's repository, when the user runs `node $K upgrade --apply`, then the
  profile reads `prototype`, `kaizen-ops@dojo` is enabled, the hook lookup is refreshed with the team's
  lines kept, and the output lists `.kaizen/config.json`, `.claude/settings.json` and
  `.githooks/pre-push` to commit; a second `--apply` writes nothing.
- AE3. (covers R4) Given a repository with `docs/solutions/` and no `docs/learnings/`, when the user runs
  `node $K upgrade --apply`, then the folder is untouched and the output gives
  `git mv docs/solutions docs/learnings` as a manual step.
- AE4. (covers R5) Given AE1's repository, when `kaizen doctor` runs, then it warns "3 Kaizen migrations
  pending (profile-names, kaizen-ops, hook-lookup)" with `node "$K" upgrade` as the fix.
- AE5. (covers R6) Given a new CHANGELOG release with a **Breaking** section and no matching migration or
  exemption, when the contract tests run, then they fail naming that version.

### Key decisions
- **Detect from state, not from a stored version** — the same check is right for a fresh clone, a
  multi-version jump and a repository fixed by hand; no new state file to keep in sync. Governs R2.
- **Reuse the existing fixes** — `profile-names` rewrites the one value, `kaizen-ops` calls
  `declarePlugin`, `hook-lookup` calls `installGitHooks`' refresh: one implementation per fix, and the
  existing `doctor` checks stay as they are. Governs R3.
- **List by default, apply on request** — `upgrade` alone writes nothing; skills run `--apply` only
  after showing the list. Governs R3, R5.
- **Contract from 4.3.0 on** — older releases are covered by the five migrations above; the contract
  starts with the first release that ships `upgrade`. Governs R6.

### Out of scope
- Migrating plugin installations (`/plugin update`) — Claude Code's job.
- Rewriting old CI workflows generated by `audit fix` (they still work through GitHub's redirect): listed
  as a manual step of `marketplace-dojo`, not automated.
- Migrations of kaizen-ops itself (skills and docs only, nothing in the repository yet).

### Options considered

| Option | What it is | Cost | Gain | Verdict |
|---|---|---|---|---|
| A. Status quo | signals in `config`, `doctor`, CHANGELOG | none | none | the problem |
| B. More `doctor` checks | one check per migration | low | still three fixes, no list, no guarantee for the next release | partial |
| C. Version file + per-version scripts | `.kaizen/state/version.json`, a script per release | medium | ordered, but wrong for fresh clones and hand-fixed repos | rejected (R2) |
| **D. State-detected registry + `upgrade`** | migrations with `applies(root)` and optional `apply(root)` | medium | one list, one command, contract for the future | **chosen** |

<!-- kaizen:planning -->
## Planning contract

### Key technical decisions
- KTD1. **`scripts/upgrade.mjs` exports `MIGRATIONS`**, each `{ id, since, title, files, applies(root,
  config) → reason | null, apply?(root) → { written: [] }, manual?: string[] }`, and `pending(root)` /
  `apply(root)`; `kaizen.mjs upgrade [--apply] [--json]` prints them. Covers R1, R3, R4.
- KTD2. **The five initial migrations** — `learnings-folder` (2.0.0, manual), `marketplace-dojo` (3.1.0:
  `kaizen@<other>` enabled without `kaizen@dojo`; apply adds `kaizen@dojo` via `declarePlugin`, the old
  key is left for the team to remove, generated workflows listed as manual), `profile-names` (3.4.0:
  rewrites the `"profile"` value in `.kaizen/config.json` by a targeted replacement, formatting kept;
  `config.local.json` too when it carries one), `kaizen-ops` (4.0.0: `opsNeeded` and not declared for
  clones → `declarePlugin`), `hook-lookup` (4.1.2: `gitHooksState().outdated` → refresh). Covers R1–R4.
- KTD3. **Doctor check `upgrade`** — `warn` with the ids when `pending` is non-empty, `ok` otherwise; the
  existing `ops_plugin` and `git_hooks` checks keep their own wording (they also cover cases outside a
  version change). Covers R5.
- KTD4. **CHANGELOG contract** — parse `## [x.y.z]` sections of `plugins/kaizen/CHANGELOG.md`; for every
  version ≥ 4.3.0 with `### Breaking` or `### Deprecated`, require a migration whose `since` equals it or
  an entry in `NO_MIGRATION` (`{ '4.3.0': 'reason' }`) exported by `upgrade.mjs`. Covers R6.

### Context and patterns to follow
- Scaffolds that never overwrite: `plugins/kaizen/scripts/audit.mjs` (`scaffold`), `githooks.mjs`
  (`installGitHooks`, `declarePlugin`).
- State-based detection: `doctor.mjs` (`opsNeeded`, `gitHooksState`, `pluginDeclared`).
- Deprecated profile: `lib.mjs` (`PROFILE_ALIASES`, `profile_warning`).
- CLI and README contract: every command listed in the README CLI reference (`contracts.test.mjs`).

### Learnings and rules applied
- `docs/solutions/architecture-patterns/plugin-reaching-another-plugins-cli.md` — the migration signal
  goes through the doctor, never the runtime; gates stay in core.
- 4.2.0 hook refresh — rewrite only the line a migration owns, keep CRLF and team lines.

### Risks
- **A migration that misdetects** — each `applies` gets a positive and a negative test, plus a "fixed by
  hand" case.
- **Formatting churn in config files** — targeted replacement only; JSON rewrite only for
  `.claude/settings.json`, which `declarePlugin` already rewrites today.

<!-- kaizen:threats -->
## Threats

| Asset | Scenario | Countermeasure |
|---|---|---|
| Repository configuration | `--apply` overwrites a team's edits | Targeted edits only, never a file outside the migration's `files`; tests keep team lines |
| Enabled plugins | `--apply` enables a plugin the team did not choose | Only `kaizen@dojo` and `kaizen-ops@dojo`, under the conditions `audit fix claude_settings` already uses; skills apply only after showing the list |

<!-- kaizen:rollout -->
## Rollout and rollback

- **Exposure:** S1 ships `kaizen upgrade` in Kaizen 4.3.0; S2 (4.4.0) makes `doctor` (run first by
  `help`, `work`, `setup`) show pending migrations.
- **Order:** S1 ships the registry and the command; S2 surfaces it and adds the contract.
- **Rollback:** revert the release; `--apply` only changed files the team commits, each also reachable by
  the existing fixes.
- **Signal:** reports of a wrong "migration pending" on an up-to-date repository; more than one in the
  first week → fix the detection of that migration.
- **Irreversible:** nothing.

<!-- kaizen:units -->
## Implementation units

### U1. Migration registry and `kaizen upgrade`
- **Goal:** list and apply the migrations a repository needs.
- **Covers:** R1, R2, R3, R4, AE1, AE2, AE3
- **Depends on:** —
- **Files:** `plugins/kaizen/scripts/upgrade.mjs` (new), `plugins/kaizen/scripts/kaizen.mjs`
  (`upgrade` command), `plugins/kaizen/tests/upgrade.test.mjs` (new), `plugins/kaizen/README.md`
  (CLI reference), `plugins/kaizen/docs/reference/cli.md`
- **Approach:** KTD1, KTD2; `apply` collects `written` from each applied migration and prints the files to
  commit; `--json` returns `{ pending }`, or `{ applied, manual, written }` with `--apply`. The hook
  refresh of 4.2.0 is extracted as `refreshHookLookups` so `upgrade` never installs or wires hooks.
- **Evidence:** test first
- **Test scenarios:** AE1 (all three listed), AE2 (applied, team lines kept, idempotent), AE3 (manual
  only); each migration: applies / does not apply / already fixed by hand; nothing pending → one line;
  `config.local.json` profile rewritten too.
- **Verification:** `node --test plugins/kaizen/tests/*.test.mjs` green
- **Slice:** S1

### U2. Surface pending migrations
- **Goal:** the team is told without running a new command.
- **Covers:** R5, AE4
- **Depends on:** U1
- **Files:** `plugins/kaizen/scripts/doctor.mjs`, `plugins/kaizen/skills/{help,setup}/SKILL.md`,
  `plugins/kaizen/tests/doctor.test.mjs`, `plugins/kaizen/docs/guides/{help,setup}.md`,
  `plugins/kaizen/docs/troubleshooting.md`
- **Approach:** KTD3; `setup` on an initialized repository runs `upgrade`, shows the list, asks before
  `--apply`; `help` names `node $K upgrade` when doctor reports it.
- **Evidence:** test first
- **Test scenarios:** AE4 wording and count; up-to-date repository → `ok`.
- **Verification:** `node --test plugins/kaizen/tests/*.test.mjs` green
- **Slice:** S2

### U3. CHANGELOG contract and release 4.3.0
- **Goal:** no future breaking release without its migration.
- **Covers:** R6, AE5
- **Depends on:** U1
- **Files:** `plugins/kaizen/tests/upgrade.test.mjs`, `plugins/kaizen/CHANGELOG.md`,
  `plugins/kaizen/.claude-plugin/plugin.json`, `CLAUDE.md`
- **Approach:** KTD4; a fixture CHANGELOG with a 9.9.9 Breaking section and no migration proves the
  failure.
- **Evidence:** test first
- **Test scenarios:** AE5 on the fixture; the real CHANGELOG passes.
- **Verification:** `node --test plugins/kaizen/tests/*.test.mjs` green; CI green on the 6-job matrix
- **Slice:** S2

<!-- kaizen:verification -->
## Verification contract

- **Every unit:** `node --test plugins/kaizen/tests/*.test.mjs plugins/kaizen-ops/tests/*.test.mjs`.
- **AE1–AE3:** U1's tests on fake repositories (4.1.1 hook fixtures reused).
- **AE4:** U2's doctor test. **AE5:** U3's fixture.
- **End to end:** `/kaizen:help` in a 3.x-shaped repository names `node $K upgrade` (manual session, or a
  new eval scenario if U2 changes the help routing).
- **CI:** 6-job matrix green on each slice.

<!-- kaizen:done -->
## Definition of done

- [x] S1 (Kaizen 4.3.0, #44) and S2 (4.4.0, #45) merged.
- [x] Every R covered by its tests above (`tests/upgrade.test.mjs`: AE1–AE5); CI green on the matrix for both slices.
- [x] The five migrations of the Problem table detected and, where automatable, applied.
- [x] `doctor` reports pending migrations; `help`, `work` and `setup` relay them through the
  conventions' guard rails, and `setup check` runs `upgrade`.
