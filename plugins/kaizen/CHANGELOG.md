# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions: [SemVer](https://semver.org/).

## [3.1.0] - 2026-10-05

Kaizen is self-sufficient: what it used to borrow from the marketplace's `security` and `playwright`
plugins (removed from the marketplace) now ships with it.

### Added
- **Secret scan before every commit** (`scripts/secret-gate.mjs`, `PreToolUse` on Bash): a `git commit`
  by Claude is refused when its changes — the index, plus what a `git add` in the same command,
  `commit -a` or commit paths bring in — add one of ~30 kinds of keys and tokens. `--no-verify` is
  refused too. Active in every git repo; `secrets.scan: false` turns it off, `secrets.ignore` (path
  globs) skips fixtures. Findings show `file:line — type` and a redacted preview, never the value.
- `node $K secrets scan [--staged | --base <ref>] [--json]`: the same scan from the CLI (exit 1 if
  anything is found).
- `audit fix secret_scanning`: `.github/workflows/kaizen-secrets.yml` scans every PR's commits, whoever
  wrote them. The audit now recognizes `kaizen.mjs secrets scan` in CI.
- **Playwright MCP server bundled** (`.mcp.json`, `@playwright/mcp` pinned): `polish`, `work` and
  `autopilot` can see the UI without another plugin. Troubleshooting covers a missing browser and
  headless machines.

### Changed
- Docs and skills no longer refer to the marketplace's `git`, `security`, `playwright` or `experts`
  plugins. The audit still counts a legacy `security@angelo-plugins` as secret scanning.

## [3.0.0] - 2026-10-04

Kaizen is now written in English (#17). Claude still talks to the user in their language, and the
documents written in the target repo follow `language` (`auto` = the language of the conversation).

### Breaking changes
- **Everything is in English**: skills, agents, references, templates, CLI and hook messages,
  documentation, tests and evals. Scripts that parsed the CLI's French output must read the English
  messages (or use `--json`).
- **Renamed values** in the JSON output and in the state files:
  - review verdict `reserves` → `concerns` (`review record --verdict reserves` is still accepted);
  - review depth `light` / `update`, confidence `high` / `medium` / `low`;
  - release note groups `Features`, `Fixes`, `Performance`, `Refactoring`, `Documentation`, `Reverts`,
    `Other`;
  - unattributed agent roles `unknown` / `other`; manual incident source `manual`.
- **English plan and constitution fields** in new documents: `**Check:**`, `NON-NEGOTIABLE`,
  `## AI policy`, `## Governance`, `## Amendments`, `Approved by:`, `**Covers:**`, `**Files:**`,
  `**Evidence:**`, `**Verification:**`, `**Slice:**`, `**Exposure**`, `**Rollback**`, `**Signal**`,
  `[NEEDS CLARIFICATION: …]`. The French fields of Kaizen 2.x (`**Contrôle :**`, `NON NÉGOCIABLE`,
  `Approuvé par :`, `[À CLARIFIER : …]`…) are **still read**: existing plans and constitutions keep
  passing `plan check` and `constitution check`.
- Documentation pages renamed: `docs/demarrage.md` → `docs/getting-started.md`,
  `docs/depannage.md` → `docs/troubleshooting.md`, `docs/positionnement.md` → `docs/positioning.md`.

### Added
- **Complete reference** in the README: one line per CLI command (`node $K <command>`), the five hooks
  with their role, exit codes; a contract test keeps it in sync with `kaizen.mjs` and `hooks.json`, and
  checks that every relative link of the documentation resolves.
- **Exhaustive documentation with diagrams**: ten in-depth pages (`docs/concepts/`: the loop, plans,
  constitution, gates and hooks, review, pull requests, production, learnings, metrics, agents and
  models) and three reference pages (`docs/reference/`: CLI, state and files, SDLC audit), illustrated
  by 14 SVG diagrams generated from `docs/media/source/diagrams.mjs` (light and dark themes); the loop
  is drawn as SVG in the README and the docs; every guide links to the page explaining its mechanism.
  A contract test checks every `#anchor` link.
- Documentation completed: `monitor` incidents and continuous monitoring, `deploy detect` platforms,
  `audit fix monitor_patrol|monitor_alert`, cycle cost per role, troubleshooting for refused
  deployments and upgrading from 2.x.
- English presentation video: narration, burned-in subtitles, `.srt` / `.vtt`.

### Upgrading from 2.x
- Nothing to migrate in the repo: French plans, learnings, constitutions and ADRs stay valid.
- Set `"language": "fr"` in `.kaizen/config.json` to keep writing deliverables in French whatever the
  conversation language.

## [2.1.0] - 2026-10-04

### Added
- **Subagent cost** in `cycle_cost` (#15): the Stop hook also adds up the transcripts of the session's
  subagents (`<session>/subagents/agent-*.jsonl`), deduplicated by message; the `Agent` hook logs each
  launch during a cycle (`.kaizen/state/agent-runs.jsonl`: role, model, id) to break tokens down by role
  of the model policy. `metrics` exposes the total (main + subagents), `main_tokens_median`,
  `subagent_tokens_median`, `subagent_share` and `tokens_by_role`.
- **Continuous monitoring** (#16): `monitor patrol` (confirmed check to schedule: routine, cron, CI
  workflow) and `monitor alert` (Alertmanager, PagerDuty, Datadog or plain JSON, for example through
  `repository_dispatch`) open an **incident** dated at its detection — `incident/<env>/…` tag, resolved
  by a rollback or `monitor incident resolve` (`resolve/<env>/…`). `monitor watch` also records its
  breach as an incident. `monitor incident open|resolve|list`.
- DORA: an incident before the next deployment counts as a failure, and the time to restore runs from
  detection to resolution; `deployments.incidents`. The postmortem reuses the tracked detection. The hook
  also refuses hand-made `incident/…` and `resolve/…` tags.
- `status` (and so `/kaizen:help`) puts an open incident first (`/kaizen:monitor <env>`), then an
  incident resolved less than 14 days ago without a postmortem (`/kaizen:postmortem`).
- `audit` checks continuous incident detection; `audit fix monitor_patrol` and `audit fix monitor_alert`
  generate the matching GitHub Actions workflows (`--env`, `--ref`).
- End-to-end evals `monitor-alert`, `help-incident` and `cycle-cost-subagents` (29 in total). The last
  one confirms on a real session that the `Agent` tool's response carries the agent id: subagents are
  tied to their role by id, not only by prompt.
- `/kaizen:monitor` instruction clarified: with nobody to answer, rollback is the default even if
  `deploy.auto_rollback` is off, unless the incident predates the last deployment.

### Fixed
- An incident is tied to the commit deployed **at the time of its detection**, not to the last
  deployment: an alert older than a deployment no longer blames it.
- `deploy run`, `deploy rollback` and `deploy flag` have a timeout (`deploy.timeout_seconds`, 30 min, or
  `environments.<env>.timeout_seconds`): a stuck command is killed with its whole process tree, the
  deployment fails without a tag and the report flags an uncertain state.
- A check killed by its timeout (`verify`, Stop gate, command-based `monitor` signals) no longer
  survives in the background: `scripts/run-bounded.mjs` kills the whole process tree (`taskkill /T /F`
  on Windows, process group on POSIX), not only the shell (#14).

## [2.0.0] - 2026-10-04

### Breaking changes
- Renamed skills (`compound` → `learn`, `refresh` → `prune-learnings`, `lfg` → `autopilot`,
  `babysit-pr` → `watch-pr`, `resolve-pr-feedback` → `address-feedback`) and learnings folder
  `docs/solutions/` → `docs/learnings/`, without compatibility: a 1.x repo renames its folder. Published
  in 1.2.0 by mistake; a rename without compatibility requires a major version.
- **`git push` of a branch requires a recorded review** in a repo initialized by Kaizen
  (`review.require_before_push: false` to go back to the 1.x behavior).

### Added
- `PreToolUse` hook `review-gate.mjs`: the "mandatory" review of `work`, `autopilot` and `ship` is
  enforced by a deterministic check, not only by the instruction. `/kaizen:review` records the reviewed
  tree (uncommitted changes included) with `node $K review record`; beyond
  `review.max_unreviewed_lines` (80) lines changed since, a new review. `review status` and
  `review check`.
- **Review evidence**: a `PostToolUse` hook on the `Agent` tool (`review-hooks.mjs --evidence`) logs
  each Kaizen code reviewer actually launched; `review record` refuses without a reviewer since the
  previous review, except a light review (≤ 20 lines) or an update after fixes.
- **Waiver confirmed by the user**: `review waive --reason` only shows a code; only the user typing
  `kaizen waive <code>` (`UserPromptSubmit` hook, 30 min, single use) makes it effective. `ship` adds a
  "Review waived" section to the PR. The `PreToolUse` hook refuses direct writes to the review state
  files and manual calls of the evidence hooks.
- **`deploy detect` / `deploy configure`**: recognizes the deployment platform (Vercel, Netlify, Fly.io,
  Heroku, Kamal, Capistrano, Helm, Kustomize, Serverless, AWS SAM, Firebase, GitHub Actions
  `workflow_dispatch` or continuous deployment workflows, Makefile, npm scripts, Compose, Terraform) and
  proposes commands, native rollback (or redeploy of the previous commit from a worktree) and
  health-check, with confidence and limits; writes the chosen candidate without overwriting.
- **Model policy** (`models`, `node $K models`): a role per agent, a model per role per profile (frugal
  research, critical reviewers on the strongest), adjustable per role or per agent; skills pass the
  model to each subagent and the review records the one actually requested.
- **`/kaizen:setup audit`** and `node $K audit`: the project's SDLC maturity in five areas (foundations,
  flow, delivery, operations, Kaizen loop), prioritized roadmap, guided fixes, and templates generated
  from the stack without ever overwriting
  (`audit fix ci|pr_template|dependabot|codeowners|gitignore_env`).
- **Deployment and monitoring**:
  - `/kaizen:deploy`: deploys through the team's commands (`deploy.environments`), preconditions (green
    CI, checklist of the shipped plans, rollback ready, healthy signals), approval typed by the user
    (`kaizen deploy <code>`) for a protected environment, annotated `deploy/<env>/…` tag pushed, signal
    watch, rollback (`rollback/<env>/…`), feature flags (`deploy.flags`);
  - `/kaizen:monitor` and `node $K monitor check|watch`: native HTTP health-check or any command
    printing a number, config thresholds overridden by those of the shipped plans
    (`` `error_rate` > 1 % ``), breach confirmed over consecutive samples, optional automatic rollback
    (`deploy.auto_rollback`);
  - `metrics`: DORA measured on real deployments (frequency, commit → production lead time, failure
    rate, time to restore) when `deploy/` tags exist;
  - `postmortem` reads the timeline from the tags and `monitor.jsonl`; `release` proposes
    `/kaizen:deploy`; `status` and `help` suggest deploying pending commits;
  - hook: the raw command of a protected environment and hand-made `deploy/`/`rollback/` tags are
    refused; `release notes` ignores deployment tags as a starting point.
- **`/kaizen:help`**: explains Kaizen and recommends the command to run for the described situation and
  the real state of the repo. Relies on **`node $K status`**, a deterministic diagnosis (initialization,
  profile, constitution, last plan, gate, branch review) that infers the next step.
- **Adoption profiles** `profile: lean | standard | full` (`init --profile`, question in `setup`): the
  ceremony adjusts (plan, `doc-review`, reviewers, `autopilot` shortcut in `lean`), never the
  deterministic gates.
- `/kaizen:metrics`: `learnings_applied_in_commits` (a learning cited in a commit message = applied, not
  only read), `learnings_never_cited` and a sample for `prune-learnings`, and the method of
  `learning_reuse_rate`. Commits applying a learning cite it in their body.
- **Cycle cost**: the `Stop` hook records the main session's tokens since `gate on` (transcript),
  `gate off` logs the cycle (plan, duration, blocks, tokens) in `.kaizen/state/cycles.jsonl`, and
  `/kaizen:metrics` aggregates it (`cycle_cost`).
- **Targeted gate checks**: `gate.targeted` with `{files}` (files touched by the branch); the full check
  stays the one of `work` and `ship`.
- **Operations**: `plan check` warns on a rollout without rollback, without signal or with a signal
  without threshold; `release notes` extracts the rollout of shipped plans (`rollout`, missing fields)
  for the checklist; a breached threshold points to `/kaizen:postmortem`.
- **Team governance** of the constitution: `approvers` and `ratified_by` in the frontmatter;
  `constitution check` requires an "Approved by: @…" amendment from a declared approver for each
  version, and refuses an approval by an agent. `setup` proposes `CODEOWNERS`.

### Fixed
- `Stop`-hook gate owned by the session that turned it on (`PostToolUse` `--claim` hook after
  `gate on`): another session on the same repo is no longer blocked.
- Gate held within `gate.budget_seconds` (840 s) under the hook timeout (900 s): before, several
  600-second commands could get the hook killed, which then protected nothing.
- `/kaizen:polish` always starts the dev server, even when the user says they will not look: the served
  page is the evidence of the touch-up (the eval failed intermittently).
- `dev detect` reads the default port of a custom Node server in its entry point
  (`process.env.PORT || 5173`, `.listen(8080)`) instead of wrongly announcing 3000.

## [1.2.0] - 2026-10-04

### Changed
- Kaizen's own vocabulary for the skills and the learnings folder (`docs/learnings/`).
- Presentation video re-rendered with the new names.

## [1.1.0] - 2026-10-02

### Added
- **Engineering constitution**: `/kaizen:constitution` (creation, `amend`, `audit`) and
  `CONSTITUTION.md`. Each article carries a **Check**, and an AI policy is included. The constitution is
  enforced by `plan check`, `/kaizen:doc-review` and the `standards` reviewer.
- **Richer plan**:
  - constitution check;
  - STRIDE threats;
  - rollout and rollback;
  - clarification markers;
  - PR-sized slices;
  - `node $K plan check`: R/AE → U traceability, required fields, constitution.
- `/kaizen:doc-review` and 6 plan reviewers: coherence, feasibility, scope, security, adversarial,
  design.
- **Shipping**:
  - `/kaizen:ship`, with a description drawn from the plan and a reviewer guide;
  - `/kaizen:address-feedback`;
  - `/kaizen:watch-pr`, built on `scripts/pr.mjs`: paginated snapshot, state of handled items,
    token-free watcher, branch update only on `BEHIND`.
- `/kaizen:polish`: dev server detection and start, touch-ups guided by the user.
- **Learning**:
  - `/kaizen:decide` (ADR);
  - `/kaizen:postmortem` (blameless);
  - `/kaizen:metrics` (approximated DORA and learnings reuse);
  - `/kaizen:release` (release notes and SemVer).
- `node $K size` (`pr.max_lines` ceiling) and `verify --only audit` (dependency audit).
- `node:test` tests (unit, CLI, gate, PR with a fake `gh`, contracts), GitHub Actions CI and 19
  end-to-end evals (`evals/run.mjs`, real `claude -p` on a demo project) covering 17 skills: review,
  plan, doc-review, learn, work, debug, autopilot, polish, brainstorm, constitution, decide, ideate,
  postmortem, metrics, release, prune-learnings, setup.
- User documentation in `docs/`: getting started, configuration, packs, troubleshooting, one guide per
  skill.
- One-minute presentation video (`docs/media/`), with voice-over, subtitles and a reproducible source.

### Changed
- `/kaizen:work`: size check, dependency audit, shipping through `/kaizen:ship`.
- `/kaizen:autopilot`: shipping through `ship`, then follow-up by `watch-pr`.
- `learnings-researcher` also reads ADRs and postmortems.
- The frontmatter parser ignores trailing YAML comments.
- Fixes from the end-to-end evals:
  - `autopilot` no longer accepts a "trivial change" shortcut: plan, gate, `verify` and review always
    run;
  - `polish` creates a local branch instead of stopping on the default branch;
  - `release` writes the CHANGELOG and the version without committing; commit, tag and publication on
    approval;
  - `ideate` goes "Surprise me" when nobody can pick the topic;
  - `decide` only writes an ADR for a decision costly to undo (description aligned).
- Windows: `KAIZEN_GH` can point to a Node script, paths shown in POSIX style, CI on `windows-latest`.

## [1.0.0] - 2026-10-02

### Added
- Compound engineering loop, adapted from Every's Compound Engineering plugin (MIT):
  - `brainstorm`, `plan`, `work`, `review`, `learn`;
  - `ideate`, `debug`, `prune-learnings`, `autopilot`, `setup`.
- 15 agents: 5 research and 10 code reviewers, with a shared findings contract.
- Unified plan `kaizen-plan/v1`, learnings schema, Kaizen Packs (local or pinned git).
- Zero-dependency deterministic CLI `scripts/kaizen.mjs`.
- `Stop`-hook gate (`scripts/quality-gate.mjs`).
