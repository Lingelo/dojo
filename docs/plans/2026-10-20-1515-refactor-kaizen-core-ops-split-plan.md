---
title: Kaizen core and ops split - Plan
type: refactor
date: 2026-10-20
topic: kaizen-core-ops-split
artifact: kaizen-plan/v1
source: plan
---

# Kaizen core and ops split - Plan

<!-- kaizen:goal -->
## Goal capsule

**Goal:** a team that only wants the development loop installs Kaizen without its production commands
in its command list or in Claude's context, while a team that deploys with Kaizen keeps every
production command and every protection by enabling one more plugin — and no repository loses a gate.
**Means:** the production skills and their docs move to a second plugin of the dojo marketplace,
`kaizen-ops`; the CLI, the hooks and every deterministic protection stay in Kaizen core.
**Product authority:** Angélo LIMA in session on 2026-10-20 ("cadre la séparation cœur/ops dans un
plan", then "Défauts OK, complète le plan": go, name `kaizen-ops`, `postmortem` moves, Kaizen 4.0.0 +
kaizen-ops 1.0.0, deprecation stubs until 4.1.0).
**Open blockers:** none.

<!-- kaizen:product -->
## Product contract

### Summary
Move `deploy`, `monitor` and `postmortem` into a `kaizen-ops` plugin made of skills and documentation
only, reaching Kaizen core's CLI at runtime. Core keeps the CLI, the hooks, the tests of the production
code and `release`, so enabling or not enabling `kaizen-ops` never weakens a gate.

### Problem
Kaizen 3.10 ships 23 skills. Three of them only make sense for a team that deploys through Kaizen —
`deploy`, `monitor`, `postmortem` — yet every session of every Kaizen user carries them: their
descriptions are 1,895 of the 11,924 characters of skill descriptions loaded into Claude's context
(16 %, ~500 tokens), and they appear in the command list a newcomer reads. The four-command path (3.10)
fixed onboarding; it did not remove the surface.

Measured coupling (3.10.0):
- **Scripts** — `deploy.mjs` (211 lines), `monitor.mjs` (309), `deploydetect.mjs` (380), `release.mjs`
  (96). Imported by core: `metrics.mjs` → `deploy.mjs` (DORA from deployment tags), `monitor.mjs` →
  `deploy.mjs`, `audit.mjs` → `deploydetect.mjs` (delivery and operations scores), `kaizen.mjs` → all
  four (CLI, `status` incidents and undeployed commits).
- **Hooks** — `review-gate.mjs` refuses a direct deploy of a protected environment, hand-made
  `deploy/`, `rollback/`, `incident/`, `resolve/` tags and writes to `deploy-approvals.json` /
  `deployments.jsonl`; `review-hooks.mjs --confirm` confirms the user-typed `kaizen deploy <code>`.
- **Plans** — `plan` writes the rollout section and cites `monitor.signals`; `plan check` warns on a
  rollout without rollback, signal or threshold; `release notes` extracts the rollout of shipped plans.
- **Names** — 90 mentions of `/kaizen:deploy`, `/kaizen:monitor` or `/kaizen:postmortem` in 29 files of
  core outside the three skills and their guides (skills, references, docs, README, CLI messages, evals).
- **Tests and docs** — `deploy.test.mjs` (372 lines), `deploydetect.test.mjs` (177), part of
  `audit.test.mjs`; guides `deploy`, `monitor`, `postmortem`; `concepts/production.md`.

### Requirements

**Surface**
- R1. With only Kaizen core enabled, the production commands appear neither in the command list nor in
  the skill descriptions Claude loads — from Kaizen 4.1.0; during 4.0.x only one-line deprecation stubs
  remain.
- R2. Enabling `kaizen-ops` gives every production command its current behaviour under
  `/kaizen-ops:<command>`, without changing `.kaizen/config.json`.

**Protections and shared facts**
- R3. Every deterministic protection keeps working whichever plugins are enabled: protected-environment
  deploy refusal, forged deployment tags, protected state files, the user-typed deployment code.
- R4. Core features that read production facts — DORA metrics, `status` (incidents, undeployed
  commits), the SDLC audit, the plan rollout section and its checks, release notes — keep working
  without `kaizen-ops`.

**Migration**
- R5. A repository whose configuration declares `deploy.environments` or `monitor.signals` while
  `kaizen-ops` is not declared is told so by `kaizen doctor`, `/kaizen:setup` and `/kaizen:help`, with
  the exact fix.
- R6. `kaizen-ops` refuses to run against a Kaizen core older than the version it was released with,
  naming both versions and the fix.
- R7. Every place that names a production command (`status` next steps, hook messages, `help` routing,
  READMEs, guides, CHANGELOG) names it under `/kaizen-ops:`; during 4.0.x, `/kaizen:deploy`,
  `/kaizen:monitor` and `/kaizen:postmortem` answer with the new name and how to enable the plugin.

### Acceptance examples
- AE1. (covers R1) Given Kaizen 4.1.0 alone is enabled, when the user opens the command list, then no
  deploy, monitor or postmortem command is listed.
- AE2. (covers R2, R7) Given `kaizen-ops@dojo` is also enabled and `deploy.environments.production` is
  declared, when the user runs `/kaizen-ops:deploy production`, then it asks for the typed approval,
  tags `deploy/production/…`, watches the plan's signals and rolls back on a breach, as
  `/kaizen:deploy production` does in 3.10.
- AE3. (covers R3) Given `kaizen-ops` is not enabled, when Claude runs the raw deploy command of a
  protected environment or `git tag deploy/production/x`, then the core hook refuses it.
- AE4. (covers R4) Given `kaizen-ops` is not enabled and deployment tags exist, when the user runs
  `/kaizen:metrics`, then deployment frequency and lead time come from the tags, as before.
- AE5. (covers R5) Given `deploy.environments` is declared and `kaizen-ops@dojo` is not declared in
  `.claude/settings.json`, when `kaizen doctor` runs, then it reports "production commands moved to
  kaizen-ops" with the settings line that enables it.
- AE6. (covers R6) Given core 3.10.0 and `kaizen-ops` 1.0.0 requiring 4.0.0, when an ops command runs,
  then it stops with "kaizen-ops 1.0.0 needs Kaizen ≥ 4.0.0 (found 3.10.0): update kaizen@dojo".
- AE7. (covers R7) Given Kaizen 4.0.x, when the user types `/kaizen:deploy production`, then Claude
  answers that the command is now `/kaizen-ops:deploy` and gives the settings line to enable it, and
  deploys nothing.

### Key decisions
- **Split skills and docs, keep the CLI and the hooks in core** — the surface users see is skills; the
  coupling lives in scripts and hooks, which stay where the gates are. Governs R1–R4. (recommended in
  this plan, accepted in session)
- **Name `kaizen-ops`, commands `/kaizen-ops:<command>`** — explicit kinship with Kaizen, no generic
  `ops` namespace. Governs R2, R7. (session default)
- **`postmortem` moves with deploy and monitor** — it reconstructs incidents from deployment and
  incident tags; lessons outside production stay with `/kaizen:learn`. Governs R1. (session default)
- **`release` stays in core** — release notes, SemVer and CHANGELOG serve teams that never deploy through
  Kaizen, and read shipped plans, a core artifact. Governs R1, R4.
- **Kaizen 4.0.0 and kaizen-ops 1.0.0, released together** — commands leave Kaizen's namespace: a
  breaking change. Governs R6. (session default)
- **Deprecation stubs for one minor version** — `/kaizen:deploy`, `/kaizen:monitor`,
  `/kaizen:postmortem` answer "moved" in 4.0.x and are removed in 4.1.0. Governs R1, R7. (session
  default)

### Out of scope
- Moving scripts, hooks or tests out of core (option C below, rejected).
- Splitting the cost and friction tooling (`estimate`, `ledger`, `dashboard`, `friction`) into its own
  plugin — the same reasoning may apply later; not decided here.
- Changing how deployments, signals or incidents behave.

### Options considered

| Option | What moves | User sees | Cost | Risk | Verdict |
|---|---|---|---|---|---|
| A. Status quo + four-command path (3.10) | nothing | 23 commands, ops ~16 % of skill descriptions | none | none | baseline |
| B. Config switch `ops.enabled: false` | nothing; ops skills answer "disabled" | still 23 commands, still in context | low | low | no gain on R1: a disabled skill is still loaded |
| C. Full split (skills, scripts, hooks, tests) | 4 scripts, 2 hook paths, 3 test files, 3 skills, docs | 20 commands | high: core imports ops code (metrics, audit, status, monitor), hooks split or duplicated | protections depend on a second plugin being enabled (fails R3) | rejected |
| **C′. Skills-and-docs split** | 3 skills, their guides, the postmortem template; a CLI resolver | 20 commands with core only (−1,895 characters of descriptions), 23 with ops | medium: command renames across docs, status, help; resolver; doctor check | low: scripts and hooks untouched | **chosen** |

<!-- kaizen:planning -->
## Planning contract

### Key technical decisions
- KTD1. **`kaizen-ops/scripts/kaizen.mjs` is a resolver that forwards to core's CLI** — the moved skills
  keep `K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"` and every `node "$K" …` line unchanged; the
  resolver finds core, checks its version, then runs `node <core>/scripts/kaizen.mjs <args>` with the
  same stdin, stdout, stderr and exit code. Rejected: rewriting every CLI line of the three skills to a
  core path (90 lines of churn, drift-prone). Covers R2, R6.
- KTD2. **Resolution order, same as the git hooks** — `git config kaizen.cli`, `$KAIZEN_CLI`, the
  sibling checkout `<kaizen-ops>/../kaizen/scripts/kaizen.mjs` (this repository, `--plugin-dir`, evals),
  then the newest semver of `kaizen` in the dojo plugin cache
  (`$CLAUDE_CONFIG_DIR|~/.claude/plugins/cache/dojo/kaizen/<x.y.z>`), each candidate accepted only if its
  `.claude-plugin/plugin.json` says `"name": "kaizen"`. The cache logic mirrors
  `templates/githooks/pre-push`. Rejected: a declared plugin dependency — not assumed to exist in
  Claude Code. Covers R2.
- KTD3. **Version gate from a file, not plugin.json** — `kaizen-ops/scripts/requires.json`
  (`{ "kaizen": "4.0.0" }`) compared to core's `plugin.json` version; plugin.json keeps the four fields
  the marketplace contract requires. Covers R6.
- KTD4. **`core-root` answered by the resolver itself** — `node "$K" core-root` prints core's plugin
  root, so the moved skills read `$(node "$K" core-root)/references/conventions.md` and
  `…/docs/configuration.md` instead of `${CLAUDE_PLUGIN_ROOT}/…`. Core keeps one source for both files.
  Covers R2.
- KTD5. **Stubs are real skills with a one-line description and a short guide** — the contract tests
  require a guide per skill and resolve every `kaizen:<name>` reference; a stub satisfies both until
  4.1.0 removes it with its guide. Covers R7.
- KTD6. **Production docs stay in core where they describe the CLI** — `concepts/production.md`,
  `configuration.md` (`deploy`, `monitor`), `reference/cli.md`; the three guides move to
  `kaizen-ops/docs/guides/`. Covers R4, R7.
- KTD7. **Doctor checks the settings, not the runtime** — a plugin cannot list which plugins are enabled;
  `doctor` already reads `.claude/settings.json` for `kaizen@dojo`, and does the same for
  `kaizen-ops@dojo` when the config declares deployment or signals. Covers R5.

### Context and patterns to follow
- Resolver: the inline node of `plugins/kaizen/templates/githooks/pre-push` (cache scan, semver sort,
  plugin.json name check, explicit refusal message).
- Settings check: `plugins/kaizen/scripts/doctor.mjs` (`MARKETPLACE`, `PLUGIN_ID`, settings reading)
  and `audit fix claude_settings` in `plugins/kaizen/scripts/githooks.mjs`.
- Plugin skeleton: `plugins/kaizen/.claude-plugin/plugin.json`, `plugins/slide-studio/` (a second
  plugin with its own tests and CI workflow `.github/workflows/slide-studio.yml`).
- Contracts: `plugins/kaizen/tests/contracts.test.mjs` (frontmatter, `${CLAUDE_PLUGIN_ROOT}` paths,
  `kaizen:<name>` references, one guide per skill, README listing, anchors).
- Evals: `plugins/kaizen/evals/run.mjs` passes `--plugin-dir`; ops scenarios need both directories.

### Learnings and rules applied
- `docs/solutions/logic-errors/allowed-tools-frontmatter-body-mismatch.md` — a moved or stub skill
  whose body calls a tool absent from `allowed-tools` fails silently: the three moved skills keep their
  frontmatter, and the stubs list only what they use.
- `docs/solutions/maintenance-debt/plugin-marketplace-cleanup-removing-dead-weight.md` — the registry,
  the root README, `CLAUDE.md` and every reference move together in one commit, then a search for
  dangling names.

### Risks
- **Dangling names** — 90 mentions to rename; the contract test on `kaizen:<name>` references catches
  any `/kaizen:deploy` left after 4.1.0, and a grep in U5's verification catches them in 4.0.
- **Resolver on Windows** — paths with spaces and backslashes in the cache; tested on the CI matrix.
- **S2 above the PR size limit** — the moves are renames (small in `git diff -M`), but 90 renamed mentions,
  stubs, the doctor check, regenerated diagrams and changelogs may exceed 400 reviewable lines. S2 must
  stay one merge (rollout order); if `kaizen size` goes over, the PR says so and its reviewer guide reads
  it commit by commit (U3 → U7), rather than splitting the release.
- **Two-plugin evals** — resolved: `claude --plugin-dir` is repeatable (`claude --help`), the evals pass both.

<!-- kaizen:threats -->
## Threats

| Asset | Scenario | Countermeasure |
|---|---|---|
| Protected deployments (R3) | Ops skills moved, a protection moved with them and lost when the plugin is off | Hooks and their scripts stay in core (KTD1, option C rejected); U5 adds a test of each refusal with core alone |
| CLI the ops skills run | Resolver runs an unintended `kaizen.mjs` | Only the four sources of KTD2, each checked for `"name": "kaizen"`; repo-local git config and env vars are not set by a clone — same trust as the git hooks |
| Deployment approval | Stub `/kaizen:deploy` in 4.0.x deploys something | Stubs only answer (`allowed-tools: Read`), never run the CLI (U4) |

<!-- kaizen:rollout -->
## Rollout and rollback

- **Exposure:** a marketplace release; existing users get Kaizen 4.0.0 on their next plugin update. Teams
  with `deploy.environments` or `monitor.signals` are told by `kaizen doctor` (run first by `help`,
  `work`, `setup`) to enable `kaizen-ops`; the deprecation stubs answer anyone typing the old commands.
- **Order:** S1 lands `kaizen-ops` unregistered; S2 registers it in `marketplace.json` and releases
  Kaizen 4.0.0 in the same commit, so no state exists where the commands are in neither plugin; S3
  (4.1.0) removes the stubs.
- **Rollback:** revert S2's merge — the skills return to core under their old names; no repository
  state or configuration changed, since scripts, hooks, tags and `.kaizen/` files are untouched.
- **Signal:** issues or session reports of "unknown command /kaizen-ops:deploy", of a missing
  production command, or of a production command run without approval; more than one report in the
  first week → fix forward if the cause is a name, revert S2 otherwise.
- **Irreversible:** nothing — no data migration, no tag or config format change.

<!-- kaizen:units -->
## Implementation units

### U1. Core CLI resolver and version gate
- **Goal:** `kaizen-ops/scripts/kaizen.mjs` finds Kaizen core, refuses an older core, forwards every call.
- **Covers:** R2, R6, AE6
- **Depends on:** —
- **Files:** `plugins/kaizen-ops/scripts/kaizen.mjs` (new), `plugins/kaizen-ops/scripts/requires.json`
  (new), `plugins/kaizen-ops/tests/resolver.test.mjs` (new)
- **Approach:** KTD1–KTD4; resolution mirrors `templates/githooks/pre-push`; `core-root` and `--version`
  answered locally; any other call spawned with `stdio: 'inherit'` and its exit code returned.
- **Evidence:** test first
- **Test scenarios:** `KAIZEN_CLI` wins over the cache; sibling checkout found from `plugins/kaizen-ops`;
  newest semver chosen in a fake cache, a directory whose plugin.json is not `kaizen` skipped; core
  3.10.0 refused with the AE6 message; nothing found → explicit message, exit 1; arguments, stdin and
  exit code forwarded; paths with spaces.
- **Verification:** `node --test plugins/kaizen-ops/tests/*.test.mjs` green
- **Slice:** S1

### U2. kaizen-ops plugin skeleton and CI
- **Goal:** a second plugin that passes its own contracts before it carries any skill.
- **Covers:** R2
- **Depends on:** U1
- **Files:** `plugins/kaizen-ops/.claude-plugin/plugin.json` (new: name, version 1.0.0, description,
  author), `plugins/kaizen-ops/README.md` (new), `plugins/kaizen-ops/CHANGELOG.md` (new),
  `plugins/kaizen-ops/tests/contracts.test.mjs` (new), `.github/workflows/kaizen.yml` (paths, syntax
  check and tests of `plugins/kaizen-ops`)
- **Approach:** contracts adapted from `plugins/kaizen/tests/contracts.test.mjs` (frontmatter,
  `${CLAUDE_PLUGIN_ROOT}` paths, `kaizen-ops:<name>` references, one guide per skill, README listing,
  anchors); not registered in `marketplace.json` yet.
- **Evidence:** test first
- **Test scenarios:** contracts green with zero skills; CI runs both plugins' tests on the 6-job matrix.
- **Verification:** `node --test plugins/kaizen-ops/tests/*.test.mjs plugins/kaizen/tests/*.test.mjs` green
- **Slice:** S1

### U3. Move deploy, monitor and postmortem to kaizen-ops
- **Goal:** the three skills run from `kaizen-ops` with unchanged behaviour.
- **Covers:** R2, AE2
- **Depends on:** U2
- **Files:** `plugins/kaizen/skills/{deploy,monitor,postmortem}/SKILL.md` → `plugins/kaizen-ops/skills/…`
  (moved), `plugins/kaizen/docs/guides/{deploy,monitor,postmortem}.md` → `plugins/kaizen-ops/docs/guides/`
  (moved), `plugins/kaizen/templates/postmortem.md` → `plugins/kaizen-ops/templates/` (moved),
  `plugins/kaizen-ops/docs/README.md` (new)
- **Approach:** `git mv`; in the moved skills, `${CLAUDE_PLUGIN_ROOT}/references/…` and
  `…/docs/configuration.md` become `$(node "$K" core-root)/…` (KTD4); `$K` lines unchanged (KTD1);
  `allowed-tools` unchanged.
- **Evidence:** test first (contracts of both plugins), then the deploy evals
- **Test scenarios:** every cited path resolves in its plugin or through `core-root`; skills listed in
  `kaizen-ops/README.md` and `docs/README.md`.
- **Verification:** both plugins' contracts green; `node plugins/kaizen/evals/run.mjs deploy-healthy`
  with both plugin directories passes
- **Slice:** S2

### U4. Deprecation stubs in core
- **Goal:** `/kaizen:deploy`, `/kaizen:monitor`, `/kaizen:postmortem` answer with the new name for 4.0.x.
- **Covers:** R7, AE7
- **Depends on:** U3
- **Files:** `plugins/kaizen/skills/{deploy,monitor,postmortem}/SKILL.md` (new stubs),
  `plugins/kaizen/docs/guides/{deploy,monitor,postmortem}.md` (new short guides)
- **Approach:** short description ("Moved in Kaizen 4.0 — … Use when the user types /kaizen:<command>"), `allowed-tools: Read`, body: give
  `/kaizen-ops:<command>`, the settings line `"kaizen-ops@dojo": true`, and stop; never run the CLI.
- **Evidence:** test first
- **Test scenarios:** stub frontmatter valid against core's skill contract (description of 120 to 1024
  characters, "Use when"); no `$K` and no `Bash` in a stub; its body asks for no tool beyond `Read`.
- **Verification:** `node --test plugins/kaizen/tests/contracts.test.mjs` green
- **Slice:** S2

### U5. Rename every reference and prove the protections
- **Goal:** core names the production commands `/kaizen-ops:…` everywhere, and its gates work alone.
- **Covers:** R3, R4, R7, AE3, AE4
- **Depends on:** U3
- **Files:** `plugins/kaizen/scripts/kaizen.mjs` (`status` next steps), `plugins/kaizen/scripts/review-gate.mjs`,
  `plugins/kaizen/scripts/review-hooks.mjs` (messages), `plugins/kaizen/skills/{help,plan,release,autopilot}/SKILL.md`,
  `plugins/kaizen/references/{conventions,plan-contract}.md`, `plugins/kaizen/README.md`,
  `plugins/kaizen/docs/**` (configuration, concepts, guides, positioning, troubleshooting, getting started),
  `plugins/kaizen/docs/media/source/diagrams.mjs` (then regenerated SVGs),
  `plugins/kaizen/evals/run.mjs` and `plugins/kaizen/evals/scenarios/{deploy-*,monitor-*,postmortem-revert,help-incident}.mjs`,
  `plugins/kaizen/tests/{cli,deploy,review}.test.mjs`
- **Approach:** replace the 90 mentions; the README's "Deploy and monitor" table becomes a pointer to
  `kaizen-ops`; evals pass both plugin directories for ops scenarios (temporary marketplace if
  `--plugin-dir` cannot repeat).
- **Evidence:** characterization first (protections and production facts tested with core alone before
  the renames)
- **Test scenarios:** protected deploy command and forged `deploy/…` tag refused with core alone (AE3);
  DORA frequency and lead time from tags with core alone (AE4); `status` next step names
  `/kaizen-ops:deploy production`; no `/kaizen:deploy|monitor|postmortem` left outside the stubs and
  CHANGELOG.
- **Verification:** `node --test plugins/kaizen/tests/*.test.mjs` green; `grep -rn "kaizen:\(deploy\|monitor\|postmortem\)" plugins/kaizen --include=*.md --include=*.mjs`
  lists only the stubs, their guides and the CHANGELOG
- **Slice:** S2

### U6. Migration warnings
- **Goal:** a repository that deploys with Kaizen is told to enable `kaizen-ops`, with the fix.
- **Covers:** R5, AE5
- **Depends on:** U3
- **Files:** `plugins/kaizen/scripts/doctor.mjs`, `plugins/kaizen/scripts/githooks.mjs`
  (`audit fix claude_settings`), `plugins/kaizen/skills/{setup,help}/SKILL.md`,
  `plugins/kaizen/tests/doctor.test.mjs`, `plugins/kaizen/tests/githooks.test.mjs`
- **Approach:** KTD7; `doctor` warns "production commands moved to kaizen-ops" with the settings line when
  `deploy.environments` or `monitor.signals` is non-empty and `kaizen-ops@dojo` is not declared;
  `audit fix claude_settings` declares it in that case; `setup` and `help` relay the warning.
- **Evidence:** test first
- **Test scenarios:** config with environments, settings without kaizen-ops → warning with the line;
  declared → no warning; no deploy or signals → no warning; `claude_settings` fix adds both plugins when
  needed, never overwrites.
- **Verification:** `node --test plugins/kaizen/tests/doctor.test.mjs plugins/kaizen/tests/githooks.test.mjs` green
- **Slice:** S2

### U7. Release Kaizen 4.0.0 and kaizen-ops 1.0.0
- **Goal:** both plugins published together, documented at the marketplace level.
- **Covers:** R1, R2, R7
- **Depends on:** U4, U5, U6
- **Files:** `.claude-plugin/marketplace.json`, `plugins/kaizen/.claude-plugin/plugin.json` (4.0.0),
  `plugins/kaizen/CHANGELOG.md`, `plugins/kaizen-ops/CHANGELOG.md`, `README.md`, `CLAUDE.md`
- **Approach:** one commit registers `kaizen-ops` and bumps core (rollout order); CHANGELOG 4.0.0 under
  "Breaking" names the moved commands and the settings line; root README table and `CLAUDE.md` list four
  plugins.
- **Evidence:** test first (contract: plugin registered and documented)
- **Test scenarios:** marketplace lists both; `requires.json` matches core 4.0.0; no dangling name in the
  root README or `CLAUDE.md`.
- **Verification:** both plugins' tests green; CI green on the 6-job matrix
- **Slice:** S2

### U8. Remove the stubs (4.1.0)
- **Goal:** core's command list no longer carries the production commands.
- **Covers:** R1, AE1
- **Depends on:** U7, released and one minor version elapsed
- **Files:** `plugins/kaizen/skills/{deploy,monitor,postmortem}/` and their guides (deleted),
  `plugins/kaizen/.claude-plugin/plugin.json` (4.1.0), `plugins/kaizen/CHANGELOG.md`
- **Approach:** delete the stubs and their guides; the `kaizen:<name>` reference contract then fails on
  any remaining old name.
- **Evidence:** test first
- **Test scenarios:** core skills exclude deploy, monitor, postmortem; no reference to them left.
- **Verification:** `node --test plugins/kaizen/tests/*.test.mjs` green
- **Slice:** S3

<!-- kaizen:verification -->
## Verification contract

- **Every unit:** `node --test plugins/kaizen/tests/*.test.mjs` and, from U1,
  `node --test plugins/kaizen-ops/tests/*.test.mjs`; syntax check of both plugins' scripts as in CI.
- **AE1:** core contracts list no deploy, monitor or postmortem skill after U8.
- **AE2:** `node plugins/kaizen/evals/run.mjs deploy-healthy deploy-breach deploy-protected` with both
  plugins (real `claude -p`, costly: once before S2 merges).
- **AE3, AE4:** U5's characterization tests, run with core alone.
- **AE5:** U6's doctor tests. **AE6:** U1's resolver tests. **AE7:** U4's stub contract and a manual
  `/kaizen:deploy production` in a session with Kaizen 4.0.0 alone.
- **CI:** 6-job matrix (Ubuntu, macOS, Windows × Node 18, 22) green on each slice.

<!-- kaizen:done -->
## Definition of done

- [x] S1 (#36) and S2 (#37) merged, Kaizen 4.0.0 and kaizen-ops 1.0.0 in `marketplace.json`; S3 (4.1.0)
  shipped right after S2 at the user's request, without the one-minor-version delay (doctor's
  `ops_plugin` warning remains the migration signal).
- [x] Every R covered by its tests or evals above; CI green on the matrix for each slice.
- [x] No `/kaizen:deploy`, `/kaizen:monitor` or `/kaizen:postmortem` outside the CHANGELOGs and
  `old → new` migration notes (contract-enforced).
- [x] Kaizen review run on all three slices (10 reviewers, 2026-10-20): no P0/P1; P2/P3 fixed in
  4.1.1 / kaizen-ops 1.0.1, except the shared core lookup between the git hooks and the resolver
  (maintainability, manual — decision pending). Not recorded: the reviewed work was already merged.
- [x] Learning captured: `docs/solutions/architecture-patterns/plugin-reaching-another-plugins-cli.md`
  (resolver shim, resolution order, gates kept in core, macOS realpath, stubs and rename detection).
