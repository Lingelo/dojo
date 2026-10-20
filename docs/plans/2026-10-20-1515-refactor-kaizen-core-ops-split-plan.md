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
**Means:** framing only. This plan compares the options and recommends one; it becomes
implementation-ready (units, verification) once the open questions below are decided.
**Product authority:** Angélo LIMA in session on 2026-10-20 ("cadre la séparation cœur/ops dans un
plan"), after the critique of Kaizen's surface (23 skills, delivery-platform drift).
**Open blockers:** the open questions under "To resolve before planning".

<!-- kaizen:product -->
## Product contract

### Summary
Move the production commands (deploy, monitor, postmortem) into a second plugin of the dojo marketplace,
`kaizen-ops`, made of skills and documentation only. The CLI, the hooks and every deterministic
protection stay in Kaizen core, so enabling or not enabling the ops plugin never weakens a gate.

### Problem
Kaizen 3.10 ships 23 skills. Four of them only make sense for a team that deploys through Kaizen
(`deploy`, `monitor`, `postmortem`, and partly `release`), yet every session of every Kaizen user
carries them: their descriptions are 2,341 of the 11,924 characters of skill descriptions loaded into
Claude's context (20 %), and they appear in the command list a newcomer reads. The four-command path
(3.10) fixed onboarding; it did not remove the surface.

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
- **Tests and docs** — `deploy.test.mjs` (372 lines), `deploydetect.test.mjs` (177), part of
  `audit.test.mjs`; guides `deploy`, `monitor`, `postmortem`, `release`; `concepts/production.md`.

### Requirements

**Surface**
- R1. With only Kaizen core enabled, the production commands appear neither in the command list nor in
  the skill descriptions Claude loads.
- R2. Enabling `kaizen-ops` restores every production command with its current behaviour, without
  changing `.kaizen/config.json`.

**Protections and shared facts**
- R3. Every deterministic protection keeps working whichever plugins are enabled: protected-environment
  deploy refusal, forged deployment tags, protected state files, the user-typed deployment code.
- R4. Core features that read production facts — DORA metrics, `status` (incidents, undeployed
  commits), the SDLC audit, the plan rollout section and its checks, release notes — keep working
  without `kaizen-ops`.

**Migration**
- R5. A repository whose configuration declares `deploy.environments` or `monitor.signals` while
  `kaizen-ops` is not enabled is told so by `kaizen doctor`, `/kaizen:setup` and `/kaizen:help`, with
  the exact fix.
- R6. `kaizen-ops` refuses to run against a Kaizen core older than the version it was released with,
  naming both versions and the fix.
- R7. Every place that names a production command (`status` next steps, `help` routing, READMEs, guides,
  CHANGELOG) names it under its new namespace.

### Acceptance examples
- AE1. (covers R1) Given only `kaizen@dojo` is enabled, when the user opens the command list, then no
  deploy, monitor or postmortem command is listed.
- AE2. (covers R2, R7) Given `kaizen-ops@dojo` is also enabled and `deploy.environments.production` is
  declared, when the user runs the ops deploy command for production, then it asks for the typed
  approval, tags `deploy/production/…`, watches the plan's signals and rolls back on a breach, as
  `/kaizen:deploy production` does in 3.10.
- AE3. (covers R3) Given `kaizen-ops` is not enabled, when Claude runs the raw deploy command of a
  protected environment or `git tag deploy/production/x`, then the core hook refuses it.
- AE4. (covers R4) Given `kaizen-ops` is not enabled and deployment tags exist, when the user runs
  `/kaizen:metrics`, then deployment frequency and lead time come from the tags, as before.
- AE5. (covers R5) Given `deploy.environments` is declared and `kaizen-ops` is not enabled, when
  `kaizen doctor` runs, then it reports "production commands moved to kaizen-ops" with the settings line
  that enables it.
- AE6. (covers R6) Given core 3.10.0 and `kaizen-ops` 1.0.0 requiring 4.0.0, when an ops command runs,
  then it stops with "kaizen-ops 1.0.0 needs Kaizen ≥ 4.0.0 (found 3.10.0): update kaizen@dojo".

### Key decisions
- **Split skills and docs, keep the CLI and the hooks in core** (recommended, see options below) — the
  surface users see is skills; the coupling lives in scripts and hooks, which stay where the gates are.
  Governs R1–R4.
- **`release` stays in core** (proposed) — release notes, SemVer and CHANGELOG serve teams that never
  deploy through Kaizen, and `release notes` reads shipped plans, a core artifact. Governs R1, R4.
- **The ops plugin finds core at runtime, never by a declared plugin dependency** — the resolution
  `githooks.mjs` already uses (`$KAIZEN_CLI`, `git config kaizen.cli`, the marketplace cache
  `cache/dojo/kaizen/<semver>`, pinned), plus `${CLAUDE_PLUGIN_ROOT}/../../kaizen/<semver>` when both
  plugins come from the same marketplace. No assumption that Claude Code resolves plugin
  dependencies. Governs R2, R6.

### Options considered

| Option | What moves | User sees | Cost | Risk | Verdict |
|---|---|---|---|---|---|
| A. Status quo + four-command path (3.10) | nothing | 23 commands, ops ~20 % of skill descriptions | none | none | baseline |
| B. Config switch `ops.enabled: false` | nothing; ops skills answer "disabled" | still 23 commands, still in context | low | low | no gain on R1: a disabled skill is still loaded |
| C. Full split (skills, scripts, hooks, tests) | 4 scripts, 2 hook paths, 3 test files, 3 skills, docs | 20 commands | high: core imports ops code (metrics, audit, status, monitor), hooks must be duplicated or split | protections depend on a second plugin being enabled (fails R3) | rejected |
| **C′. Skills-and-docs split (recommended)** | 3 skills, their guides and the production concept page; a 30-line CLI resolver | 20 commands with core only (−1,895 characters of descriptions), 23 with ops | medium: command renames across docs, status, help; resolver; doctor check | low: scripts and hooks untouched | **recommended** |

Why C′ over A: it is the only option that satisfies R1 without touching a gate, and it makes production
an explicit opt-in that matches how teams adopt Kaizen (loop first, production later). Why not now:
the gain is ~1,900 characters of skill descriptions (16 %, ~500 tokens) per session and three fewer commands; if nobody installs Kaizen without
deploying through it, A is enough — see the decision gate below.

### Decision gate
Go with C′ only if at least one of these holds; otherwise close this plan as "A, decided":
- Kaizen is used, or meant to be used, on repositories that do not deploy through Kaizen.
- The production commands are expected to grow (more platforms, more signals) faster than the loop.
- The command list or the context budget is reported as a problem by a user.

### Out of scope
- Moving scripts, hooks or tests out of core (option C).
- Splitting the cost and friction tooling (`estimate`, `ledger`, `dashboard`, `friction`) into its own
  plugin — the same reasoning may apply later; not decided here.
- Changing how deployments, signals or incidents behave.

### Open questions

**To resolve before planning**
- [NEEDS CLARIFICATION: go or no-go at the decision gate above — default: go with C′ if you use Kaizen on at least one repository that does not deploy through it]
- [NEEDS CLARIFICATION: plugin name, which sets the commands' namespace (`/kaizen-ops:deploy`) — default: `kaizen-ops`]
- [NEEDS CLARIFICATION: does `postmortem` move with deploy and monitor, or stay in core for incidents found outside Kaizen's monitoring — default: moves, core keeps `/kaizen:learn` for non-production lessons]
- [NEEDS CLARIFICATION: versioning — default: Kaizen 4.0.0 (commands leave its namespace: breaking) and kaizen-ops 1.0.0, released together]
- [NEEDS CLARIFICATION: keep a deprecation stub for `/kaizen:deploy`, `/kaizen:monitor` and `/kaizen:postmortem` for one minor version, answering "moved to kaizen-ops, enable it with …" — default: yes, removed in 4.1.0]

**Deferred to planning**
- Exact resolver order and its tests on macOS, Linux and Windows paths of the plugin cache.
- Whether `audit` scores delivery and operations differently when kaizen-ops is not enabled.
- Contract tests: README listing per plugin, guides index per plugin.

<!-- kaizen:rollout -->
## Rollout and rollback

- **Exposure:** a marketplace release; existing users get Kaizen 4.0.0 on their next plugin update. Teams
  with `deploy.environments` or `monitor.signals` are told by `kaizen doctor` (run first by `help`,
  `work`, `setup`) to enable `kaizen-ops`; the deprecation stubs answer anyone typing the old commands.
- **Order:** publish `kaizen-ops` 1.0.0 in `marketplace.json` and Kaizen 4.0.0 in the same commit, so
  no state exists where the commands are in neither plugin.
- **Rollback:** revert that commit — the skills return to core under their old names; no repository
  state or configuration changed, since scripts, hooks, tags and `.kaizen/` files are untouched.
- **Signal:** issues or session reports of "unknown command /kaizen:deploy" or of a production command
  run without approval; more than one report in the first week → restore the stubs' guidance or revert.
- **Irreversible:** nothing — no data migration, no tag or config format change.
