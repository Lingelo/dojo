---
title: Kaizen guard rails, visual evidence and resilient reviews - Plan
type: feat
date: 2026-10-19
topic: kaizen-guardrails-evidence
artifact: kaizen-plan/v1
source: plan
reviewed: "2026-10-19 11ed21078ae5"
---

# Kaizen guard rails, visual evidence and resilient reviews - Plan

<!-- kaizen:goal -->
## Goal capsule

**Goal:** a team using Kaizen knows when its guard rails are off, catches visual defects that tests
cannot see, can amend a plan mid-cycle, gets complete reviews on large changes, holds performance to a
budget, and captures every lesson of a cycle — so the failures seen on a real project (flying-car) do
not repeat silently.
**Product authority:** Angélo LIMA in session on 2026-10-19 ("les 6 points, après le merge"), from a
retrospective of the flying-car cycle.
**Open blockers:** none.

<!-- kaizen:product -->
## Product contract

### Summary
Six improvements drawn from a real cycle where the plugin was not loaded (17 commits pushed with no
recorded review), visual defects passed 200+ green tests, a plan was edited by hand, reviewers were
overwhelmed by a 6000-line diff and died on a rate limit, performance was required but never measured,
and only one learning could be written per run.

### Requirements

**Guard rails**
- R1. `kaizen doctor` reports whether the repository declares the Kaizen plugin for Claude Code
  (versioned `.claude/settings.json`), whether Kaizen's hooks have fired, whether the git hooks are
  wired, whether the branch carries commits with no recorded review (pushed or not), and the command
  that fixes each finding.
- R2. The entry skills `help`, `work` and `setup` run the doctor first and relay its warnings. This
  covers a plugin that is loaded but whose hooks are not firing; a plugin that is not loaded at all is
  caught by R1's settings check and by R3.
- R3. `/kaizen:setup` can declare the plugin in `.claude/settings.json` and install git hooks that
  refuse a push without a recorded review and a commit that adds a secret, effective even when Claude
  Code runs without the plugin.

**Plans**
- R4. `plan amend` adds a requirement (next free ID, never renumbering) or replaces one's text,
  attaches it to the units that cover it, and records the date, who decided and why.
- R5. A plan records when and on what content it was reviewed; `plan check` warns about an
  implementation-ready plan never reviewed or changed since its last review.

**Visual evidence**
- R6. A unit that changes something rendered can declare visual evidence (`visual: <views>`, captured
  before and after the change); `plan check` warns when a rendering unit has none.
- R7. A rendering reviewer examines shader, graphics and UI rendering changes in `/kaizen:review`,
  looking at the before/after captures when there are any.

**Reviews**
- R8. A review of a diff above 1500 changed lines is split by slice (else by unit commit range),
  slices reviewed one after the other with the reviewers relevant to each, and the findings merged.
- R9. A reviewer that fails (error, rate limit, no JSON) is resumed or relaunched, and `review record`
  refuses a run where a launched reviewer left no valid output unless the user confirms the gap.

**Performance and learnings**
- R10. A performance budget declared in the configuration (a command and thresholds) is checked like
  the verification commands and reported pass, fail or blind.
- R11. `/kaizen:learn harvest` lists the candidate learnings of a cycle, then writes the chosen ones one
  at a time.

### Key decisions
- **All six points, after the flying-car merge** — governs R1–R11. (decided in session)
- **Git hooks are opt-in through setup** — changing a user's git configuration needs consent.
  Governs R3. (repository CLAUDE.md: ask before changing user configuration)
- **Doc-review decisions** (Claude, in session, user's mandate "ok vas-y"): git hooks fail closed
  with a pinned CLI; stable append-only requirement IDs instead of renumbering; a missing reviewer is
  acknowledged by the user through the existing waiver code; the rendering reviewer looks at the
  captures. Governs R3, R4, R6, R7, R9.

### Acceptance examples
- AE1. (covers R1) Given a repository with Kaizen configured where no hook has ever fired and a branch
  with commits but no recorded review, when I run `kaizen doctor`, then it reports the hooks as not
  verified, the unreviewed commits, and the command to run for each.
- AE2. (covers R3) Given the git hooks installed and a feature branch with unreviewed changes, when I
  run `git push`, then the push is refused with the same message as the Claude Code gate.
- AE3. (covers R4) Given a plan with R1–R6, when I run `plan amend --add-req "…" --covered-by U2
  --by X --reason Y`, then the new requirement is R7 at the end of the requirements, U2 covers it,
  R1–R6 keep their IDs, the amendment is recorded in the frontmatter, and `plan check` passes.
- AE4. (covers R5) Given an implementation-ready plan with no review mark, when I run `plan check`,
  then it passes with the warning "plan never reviewed"; after a hand edit of a reviewed plan, the
  warning says the plan changed since its review.
- AE5. (covers R6) Given a unit whose files include a shader or a stylesheet and whose evidence is
  "test first", when I run `plan check`, then it warns that the unit renders and has no visual evidence.
- AE6. (covers R9) Given a review run where one of four launched reviewers left no output, when I run
  `review record`, then it refuses and names the missing reviewer; `--allow-missing <name>` only issues
  a code, and once the user has typed `kaizen waive <code>` the record succeeds with the gap noted.
- AE7. (covers R10) Given `perf.command` printing `fps=41` and a threshold `fps >= 55`, when I run
  `kaizen perf`, then it exits 1 and reports the failed metric; a command that crashes is reported
  "blind", never as a pass.
- AE8. (covers R2) Given a Kaizen repository where no Claude Code hook has fired, when a skill runs
  `kaizen doctor --in-skill`, then the doctor reports the hooks as off (not merely "not verified") and
  exits 0.
- AE9. (covers R8) Given a review run that launched `correctness` for slices S1 and S2, when only
  `correctness-S1.json` exists, then `review record` refuses and names `correctness-S2`.

### Out of scope
- Later: automatic image comparison against stored references (perceptual diff); a CI-side Kaizen
  check; `plan amend --add-unit`; a `plan check` warning when requirements mention performance and no
  `perf` is configured.

<!-- kaizen:planning -->
## Planning contract

### Key technical decisions
- KTD1. **Heartbeat for hook detection**: a new `SessionStart` hook writes `.kaizen/state/hooks-seen.json`
  (time, session), added to `PROTECTED_STATE`; `doctor` reads it. No heartbeat → "not verified" from a
  terminal, "off" with `--in-skill` (a skill runs inside a session whose SessionStart has fired).
  Rejected: the `UserPromptSubmit` hook (its cheap early exit must stay); reading `CLAUDE_PLUGIN_ROOT`
  from the CLI (not inherited by Bash tool calls). Covers R1, R2.
- KTD2. **Doctor as a CLI command** in `scripts/doctor.mjs`, imported by `kaizen.mjs` like `audit.mjs`,
  text plus `--json`, exit 1 only with `--strict`. Static checks need no session: `.claude/settings.json`
  declares the `dojo` marketplace and enables `kaizen@dojo`; `.githooks/` present but
  `core.hooksPath` unset (a fresh clone) → the wiring command; branch pushed (upstream exists) with
  no recorded review. Covers R1.
- KTD3. **Git hooks run a pinned CLI and fail closed**: the CLI is `git config kaizen.cli` (written by
  setup), else `$KAIZEN_CLI`, else the highest semver directory under
  `~/.claude/plugins/cache/dojo/kaizen/` whose `.claude-plugin/plugin.json` names `kaizen` — never a
  glob over other marketplaces. Version selection runs in `node -e`, not in shell. Not found → refuse
  with the fix (enable the plugin or set `kaizen.cli`): an opted-in guard rail that silently disappears
  is the failure this plan fixes. Installed by a `git_hooks` scaffold into `.githooks/` (mode 0755) and
  `core.hooksPath`; when `core.hooksPath` is already set (husky…) or `.git/hooks/pre-push` exists,
  setup writes nothing and prints the line to chain instead. Rejected: an absolute path written at
  install (breaks on every plugin update); fail open (defeats R3). Covers R3.
- KTD4. **`review check --branch <name> --sha <sha>`**: the pre-push hook (`kaizen.mjs githook
  pre-push`, `githook pre-commit` for secrets) reads git's stdin
  (`<local ref> <local sha> <remote ref> <remote sha>`), skips deletions (zero sha) and tags, and checks
  each pushed `refs/heads/*` by name and sha passed as arguments, never interpolated into a shell
  command; `checkPush(root, config, { branch, sha })` defaults to `HEAD`. Covers R3.
- KTD5. **Amendments and review marks in the frontmatter**, like `deepened:`: `amended:` one quoted
  string per amendment, `"<date> | <by> | <R id> | <reason>"`; `reviewed: "<date> <hash>"` where the hash
  is a SHA-256 prefix of the plan body (everything after the frontmatter). Plan state stays in the
  versioned file. The "no `status` field" rule (`references/plan-contract.md`) is untouched: these
  fields record decisions, not progress; the "no trace of the process" rule
  (`skills/plan/SKILL.md`, `references/conventions.md`) is narrowed to the body. Rejected: a sidecar
  state file (lost with `.kaizen/state/`, which is git-ignored). Covers R4, R5.
- KTD6. **Stable append-only IDs**: a new requirement takes the next free number and goes at the end
  of the requirements list, so no reference anywhere (plan, commits, ADRs, PRs) ever changes;
  `--covered-by U<n>` appends it to that unit's **Covers:**. Replace keeps the ID. Rejected:
  renumbering (breaks every external citation and needs a fragile reference rewrite). Covers R4.
- KTD7. **Evidence kind `visual: <views>`** in the contract (views: URLs or app states to capture);
  `plan check` flags a unit as rendering when its files match shader/style/scene patterns (`.glsl`,
  `.wgsl`, `.frag`, `.vert`, `.css`, `.scss`, `materials/`, `shaders/`, `render/`) — a warning, never
  an error, silenced by an `exception` evidence with its replacement check. `work` captures each view
  before and after into the run folder and rejects a blank capture (uniform image). Covers R6.
- KTD8. **`rendering-reviewer` agent**, read-only like the others, review role in `models.mjs`,
  selected when the diff touches the same file patterns or contains rendering code (`ShaderMaterial`,
  `onBeforeCompile`, `gl_FragColor`, `getContext('webgl`, `<canvas`); its prompt gets the capture paths
  and it must open them. Covers R7.
- KTD9. **Review split and resume in the skill** (prompt work), backed by one CLI rule. Launches are
  logged by a new PreToolUse hook on Agent (`review-hooks.mjs --launch`: reviewer, slice from a
  `Slice: S<n>` line in the prompt, run), completions by the existing PostToolUse evidence. `review
  record --run <dir>` requires, for each launch since the previous record, `<dir>/<name>[-<slice>].json`
  parsing as the reviewer contract (a `findings` array). Missing → refused, named; `--allow-missing
  <name>` issues a waiver code (`requestWaiver`, kind `gap`) that only the user can confirm. Slices run
  one after the other, at most 4 reviewers in parallel. Covers R8, R9.
- KTD10. **`perf` reuses the monitor pattern**: `perf: { command, thresholds: { name: ">= 55" } }`,
  `name=value` lines parsed from stdout, run through `run-bounded.mjs`; exit 0 pass, 1 fail, 2 blind
  (crash, timeout or a threshold metric missing from the output). Added to `DEFAULT_CONFIG` and merged
  explicitly in `loadConfig`; `perf.command` is trusted like the `verify` commands (same file, same
  author). Not wired into the quality gate. Rejected: a `verify.bench` command (no thresholds, no blind
  state). Covers R10.
- KTD11. **Harvest is a skill mode**, no CLI: it lists candidates (durability test applied, duplicates
  found with `learnings search`), asks which to write, then runs the existing steps once per chosen
  learning. Covers R11.

### Context and patterns to follow
- `plugins/kaizen/scripts/kaizen.mjs` — command dispatch, `cmdVerify`, `audit` case (icons, `--json`).
- `plugins/kaizen/scripts/audit.mjs` — `scaffold()` never overwrites; `gitignore_env` append pattern.
- `plugins/kaizen/scripts/review-state.mjs` — `checkPush`, `recordReview`, evidence.
- `plugins/kaizen/scripts/plancheck.mjs` — section slicing, id parsing, errors vs warnings.
- `plugins/kaizen/scripts/monitor.mjs` — command, number, threshold, blind semantics.
- `plugins/kaizen/scripts/lib.mjs` — `DEFAULT_CONFIG`, `loadConfig` explicit merges.
- Tests: `plugins/kaizen/tests/helpers.mjs` (`tempRepo`, `cli`), `review.test.mjs` (`prePush`),
  `audit.test.mjs` (never overwrites), `cli.test.mjs` (plan check on mutated plans),
  `contracts.test.mjs` (README lists every command and hook, every skill has a guide).

### Learnings and rules applied
- flying-car retrospective (this session): hooks silently absent when the plugin is not loaded → R1–R3;
  visual defects through green tests → R6, R7; reviewers lost to a rate limit → R9.

### Risks
- Git hooks on Windows: `#!/bin/sh` scripts calling `node`; Git for Windows ships `sh`. Covered by the
  CI matrix (ubuntu, macos, windows).
- Renumbering can corrupt a plan → amend validates the result with `checkPlan` and writes nothing on
  error.

<!-- kaizen:threats -->
## Threats

- Tampering · git hooks executing a CLI planted by another marketplace in the plugin cache ·
  pinned lookup `cache/dojo/kaizen/<semver>/` with `plugin.json` check, `kaizen.cli` first (U3, test
  with a decoy plugin).
- Elevation · an agent bypassing the push gate when the plugin is not loaded · hooks fail closed (U3);
  doctor reports pushed unreviewed branches (U1). `git push --no-verify` stays possible for a human:
  accepted risk (Angélo LIMA), visible in `doctor`.
- Tampering · forging `hooks-seen.json` or launch evidence by a direct write · added to
  `PROTECTED_STATE`, writes refused by the review gate (U1, U8).
- Repudiation · a forged `reviewed:` mark · the mark carries a body hash; a hand-written mark still
  passes — accepted risk: `reviewed:` is a warning aid, not a gate.
- Elevation · `--allow-missing` as a silent bypass · user-typed waiver code (U8).
- Tampering · ref names injected into the pre-push hook · passed as arguments, never through a shell
  string (U3).

<!-- kaizen:rollout -->
## Rollout and rollback

- **Exposure**: released in a minor plugin version (CHANGELOG, `plugin.json`); git hooks only on
  explicit `/kaizen:setup` consent.
- **Rollback**: revert the release; installed git hooks are removed by deleting `.githooks/` and
  `git config --unset core.hooksPath`, documented in troubleshooting.
- **Signal**: `node --test plugins/kaizen/tests/*.test.mjs` on the CI matrix; > 0 failure → revert.

<!-- kaizen:units -->
## Implementation units

### U1. Hook heartbeat and `kaizen doctor`
- **Goal:** report whether the guard rails are active and what is unreviewed.
- **Covers:** R1, AE1, AE8
- **Depends on:** —
- **Files:** `plugins/kaizen/scripts/doctor.mjs` (new), `plugins/kaizen/scripts/review-hooks.mjs`,
  `plugins/kaizen/scripts/review-state.mjs`, `plugins/kaizen/hooks/hooks.json`,
  `plugins/kaizen/scripts/kaizen.mjs`, `plugins/kaizen/tests/doctor.test.mjs` (new),
  `plugins/kaizen/README.md`, `plugins/kaizen/docs/reference/cli.md`
- **Approach:** KTD1, KTD2; checks: config present, plugin declared in `.claude/settings.json`,
  heartbeat age, git hooks wired, branch review state (`checkPush`) including a pushed branch.
- **Evidence:** test first.
- **Test scenarios:** no heartbeat → "not verified" (AE1), "off" with `--in-skill` (AE8); fresh
  heartbeat → active; settings without `kaizen@dojo` → finding with the fix; `.githooks/` without
  `core.hooksPath` → wiring command; unreviewed commits listed with the fix command; `--json` shape;
  `--strict` exit code; direct write to `hooks-seen.json` refused by the review gate.
- **Verification:** `node --test plugins/kaizen/tests/doctor.test.mjs plugins/kaizen/tests/review.test.mjs plugins/kaizen/tests/contracts.test.mjs`
- **Slice:** S1

### U2. Entry skills run the doctor
- **Goal:** warn at the start of a cycle when the guard rails are off.
- **Covers:** R2
- **Depends on:** U1
- **Files:** `plugins/kaizen/skills/help/SKILL.md`, `plugins/kaizen/skills/work/SKILL.md`,
  `plugins/kaizen/skills/setup/SKILL.md`, `plugins/kaizen/references/conventions.md`
- **Approach:** one shared step in `conventions.md` ("run `node "$K" doctor --in-skill`, relay any
  warning"), cited by each entry skill.
- **Evidence:** exception (prompt text) — replacement check: contracts test resolves the cited command.
- **Verification:** `node --test plugins/kaizen/tests/contracts.test.mjs`
- **Slice:** S1

### U3. Git hooks fallback and plugin declaration
- **Goal:** enforce review and secrets at the git level, without the plugin.
- **Covers:** R3, AE2
- **Depends on:** U1
- **Files:** `plugins/kaizen/scripts/audit.mjs`, `plugins/kaizen/scripts/review-state.mjs`,
  `plugins/kaizen/scripts/kaizen.mjs`, `plugins/kaizen/templates/githooks/pre-push` (new),
  `plugins/kaizen/templates/githooks/pre-commit` (new), `plugins/kaizen/tests/githooks.test.mjs`
  (new), `plugins/kaizen/skills/setup/SKILL.md`, `plugins/kaizen/docs/troubleshooting.md`
- **Approach:** KTD3, KTD4; scaffolds `git_hooks` and `claude_settings` (merges the marketplace and
  `kaizen@dojo` into `.claude/settings.json` without removing keys) with audit checks; hooks call
  `githook pre-push` (the `checkPush({ branch, sha })` rule) and `githook pre-commit` (staged secrets).
- **Evidence:** test first.
- **Test scenarios:** push of an unreviewed branch to a bare repo refused (AE2); reviewed branch
  allowed; branch deletion and tag push allowed; CLI not found → refused with the fix; a decoy
  `cache/other/kaizen/9.9.9` never executed; existing hook or `core.hooksPath` never overwritten;
  staged secret refused; settings merge keeps existing keys.
- **Verification:** `node --test plugins/kaizen/tests/githooks.test.mjs plugins/kaizen/tests/review.test.mjs plugins/kaizen/tests/audit.test.mjs`
- **Slice:** S2

### U4. `plan amend`
- **Goal:** amend a plan without hand edits.
- **Covers:** R4, AE3
- **Depends on:** —
- **Files:** `plugins/kaizen/scripts/planamend.mjs` (new), `plugins/kaizen/scripts/kaizen.mjs`,
  `plugins/kaizen/references/plan-contract.md`, `plugins/kaizen/references/conventions.md`,
  `plugins/kaizen/skills/plan/SKILL.md`, `plugins/kaizen/tests/planamend.test.mjs` (new),
  `plugins/kaizen/docs/reference/cli.md`
- **Approach:** KTD5, KTD6; `--add-req <text> [--covered-by U<n>]…`, `--replace-req R<n> <text>`,
  `--by`, `--reason` (both required); validates with `checkPlan` before writing.
- **Evidence:** test first.
- **Test scenarios:** add → next ID at the end, unit covers it, others untouched, plan check passes
  (AE3); replace keeps the ID; amendment recorded and quoted (a reason containing `|` or `:`); an
  amendment that breaks the plan (unknown unit) writes nothing.
- **Verification:** `node --test plugins/kaizen/tests/planamend.test.mjs plugins/kaizen/tests/cli.test.mjs`
- **Slice:** S3

### U5. Plan review mark
- **Goal:** know whether a plan was reviewed, and warn when it was not.
- **Covers:** R5, AE4
- **Depends on:** U4
- **Files:** `plugins/kaizen/scripts/plancheck.mjs`, `plugins/kaizen/scripts/kaizen.mjs`,
  `plugins/kaizen/skills/doc-review/SKILL.md`, `plugins/kaizen/skills/work/SKILL.md`,
  `plugins/kaizen/references/plan-contract.md`, `plugins/kaizen/tests/cli.test.mjs`
- **Approach:** KTD5; `plan reviewed <path>` sets `reviewed:`; check warns when absent, when the body
  hash differs, or when an `amended:` entry is newer.
- **Evidence:** test first.
- **Test scenarios:** never reviewed → warning (AE4); reviewed → no warning; hand edit after review →
  warning; amended after review → warning.
- **Verification:** `node --test plugins/kaizen/tests/cli.test.mjs`
- **Slice:** S4

### U6. Visual evidence in plans
- **Goal:** make rendering units declare and produce visual evidence.
- **Covers:** R6, AE5
- **Depends on:** —
- **Files:** `plugins/kaizen/scripts/plancheck.mjs`, `plugins/kaizen/references/plan-contract.md`,
  `plugins/kaizen/skills/plan/SKILL.md`, `plugins/kaizen/skills/work/SKILL.md`,
  `plugins/kaizen/tests/cli.test.mjs`
- **Approach:** KTD7; `work` captures the declared views with the bundled Playwright MCP into the run
  folder, rejects blank captures, and lists them in the commit body.
- **Evidence:** test first.
- **Test scenarios:** shader unit with "test first" → warning (AE5); with `visual: /` → none; with an
  exception → none; non-rendering unit → none.
- **Verification:** `node --test plugins/kaizen/tests/cli.test.mjs`
- **Slice:** S4

### U7. Rendering reviewer
- **Goal:** a reviewer that knows shaders, blending, fog, geometry and UI rendering.
- **Covers:** R7
- **Depends on:** U6
- **Files:** `plugins/kaizen/agents/rendering-reviewer.md` (new), `plugins/kaizen/scripts/models.mjs`,
  `plugins/kaizen/skills/review/SKILL.md`, `plugins/kaizen/skills/review/references/persona-catalog.md`,
  `plugins/kaizen/README.md`, `plugins/kaizen/docs/concepts/agents-and-models.md`, `CLAUDE.md`
- **Approach:** KTD8; imitate `agents/performance-reviewer.md`.
- **Evidence:** exception (agent prompt) — replacement check: contracts and models tests.
- **Verification:** `node --test plugins/kaizen/tests/contracts.test.mjs plugins/kaizen/tests/models.test.mjs`
- **Slice:** S4

### U8. Split and resume reviews
- **Goal:** complete reviews on large diffs and after reviewer failures.
- **Covers:** R8, R9, AE6, AE9
- **Depends on:** —
- **Files:** `plugins/kaizen/skills/review/SKILL.md`, `plugins/kaizen/skills/review/references/synthesis.md`,
  `plugins/kaizen/scripts/review-state.mjs`, `plugins/kaizen/scripts/review-hooks.mjs`,
  `plugins/kaizen/hooks/hooks.json`, `plugins/kaizen/scripts/kaizen.mjs`,
  `plugins/kaizen/tests/review.test.mjs`
- **Approach:** KTD9; split above 1500 changed lines; resume step (SendMessage to the stopped
  reviewer, else relaunch once); launch logging; record rule; `--allow-missing` through the waiver code.
- **Evidence:** test first (record rule); exception for the skill text.
- **Test scenarios:** a launched reviewer without output → refused, named (AE6); output without a
  `findings` array → refused; per-slice output missing → refused, named (AE9); `--allow-missing` →
  code only, recorded with the gap once confirmed; all outputs present → recorded.
- **Verification:** `node --test plugins/kaizen/tests/review.test.mjs`
- **Slice:** S5

### U9. Performance budget
- **Goal:** check performance against declared thresholds.
- **Covers:** R10, AE7
- **Depends on:** —
- **Files:** `plugins/kaizen/scripts/perf.mjs` (new), `plugins/kaizen/scripts/lib.mjs`,
  `plugins/kaizen/scripts/kaizen.mjs`, `plugins/kaizen/tests/perf.test.mjs` (new),
  `plugins/kaizen/docs/configuration.md`, `plugins/kaizen/README.md`
- **Approach:** KTD10; `kaizen perf [--json]`.
- **Evidence:** test first.
- **Test scenarios:** threshold met → pass; missed → exit 1 with the metric (AE7); crashing, silent or
  timed-out command → blind (exit 2); config merge keeps defaults.
- **Verification:** `node --test plugins/kaizen/tests/perf.test.mjs plugins/kaizen/tests/contracts.test.mjs`
- **Slice:** S6

### U10. Learn harvest
- **Goal:** capture every lesson of a cycle, one learning at a time.
- **Covers:** R11
- **Depends on:** —
- **Files:** `plugins/kaizen/skills/learn/SKILL.md`, `plugins/kaizen/docs/guides/learn.md`
- **Approach:** KTD11.
- **Evidence:** exception (prompt text) — replacement check: contracts test.
- **Verification:** `node --test plugins/kaizen/tests/contracts.test.mjs`
- **Slice:** S6

<!-- kaizen:verification -->
## Verification contract
- `node --test plugins/kaizen/tests/*.test.mjs` green on the CI matrix (`.github/workflows/kaizen.yml`).
- AE2 checked with a real `git push` to a bare repository in tests.
- README, CLI reference, configuration and guides updated (contracts test).

<!-- kaizen:done -->
## Definition of done
- U1–U10 delivered with their evidence; R1–R11 and AE1–AE9 covered; plan reviewed; Kaizen review
  without open P0/P1; CHANGELOG and plugin version updated.
