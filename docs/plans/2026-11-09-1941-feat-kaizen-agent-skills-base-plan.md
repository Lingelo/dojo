---
title: Kaizen 5.2, agent-skills as the base - Plan
type: feat
date: 2026-11-09
topic: kaizen-agent-skills-base
artifact: kaizen-plan/v1
source: plan
origin: docs/ideation/2026-11-09-kaizen-6-ideation.md
---

# Kaizen 5.2, agent-skills as the base - Plan

<!-- kaizen:goal -->
## Goal capsule

**Goal:** a team can enable Addy Osmani's agent-skills from the dojo marketplace next to Kaizen, work
with his commands (`/spec`, `/plan`, `/build`, `/review`, `/ship`…) and his files (`SPEC.md`,
`tasks/`, `CONSTRAINTS.md`), and keep Kaizen's gates without running a single Kaizen command for them —
the first step of Kaizen 6, where agent-skills is the base and Kaizen its engine.
**Means:** agent-skills shipped **unmodified** as a synced copy in this marketplace (the kioku
pattern); Kaizen's engine reads his artifacts and recognizes his reviewers. No Kaizen skill is
removed or rewritten in 5.2.
**Product authority:** Angélo LIMA in session on 2026-11-09 ("on converge vers Osmani le plus
possible en adaptant", then "Oui option B, rédige le plan de la 5.2"). Option B and the roadmap are
in `docs/ideation/2026-11-09-kaizen-6-ideation.md`, sections Convergence and Proposed order.
**Open blockers:** none for U1–U7. U8 (host spike) needs someone with Codex and Copilot CLI accounts:
it is the maintainer's, done locally, and it does not block the release.

<!-- kaizen:product -->
## Product contract

### Summary
Add `agent-skills` to the dojo marketplace as a copy of `addyosmani/agent-skills`, refreshed by a
workflow that opens a pull request instead of pushing. Teach Kaizen's CLI and hooks to read
`SPEC.md`, `tasks/plan.md`, `tasks/todo.md` and `CONSTRAINTS.md`, and to count a review by his
`code-reviewer` persona as a review for the push gate. Measure, on Claude Code, Codex and Copilot CLI,
what happens when both plugins are enabled.

### Problem
The convergence decided on 2026-11-09 makes agent-skills the base of Kaizen 6. Today:
- agent-skills is not in the dojo marketplace; installing it from its own marketplace risks the
  auto-update failure this repository already saw with an external source (kioku, 2026-11-03,
  `CLAUDE.md`);
- Kaizen only reads its own formats (`docs/plans/*-plan.md`, `CONSTITUTION.md`): with his files,
  `kaizen status` and `/kaizen:help` see nothing to do;
- the push gate only accepts reviews by `kaizen:*-reviewer` agents (`reviewerOf`,
  `plugins/kaizen/scripts/review-state.mjs:68`): a branch reviewed with `/agent-skills:review` is refused
  as unreviewed (or asked about, in `ask` mode);
- nobody knows yet how the two plugins behave together (double skill triggering, `/review` name
  collisions, his `.sh` hooks next to Kaizen's), nor on Codex and Copilot CLI.

### Requirements

**The copy**
- R1. agent-skills is installable from the dojo marketplace as `agent-skills@dojo`, with his files
  unchanged except his `.github/` folder, and a record of the upstream commit it was copied from.
- R2. A newer upstream commit reaches this repository as a pull request to review, never as a direct
  push to `main`, with its hooks and scripts changes listed in the pull request body.
- R3. The kioku sync keeps its current behavior.

**The engine reads his files**
- R4. `kaizen status` and `/kaizen:help` report an agent-skills cycle in progress — spec present,
  tasks done and left, next task, constraints file present — and name the agent-skills command to run
  next.
- R5. `kaizen tasks` lists the tasks of `tasks/todo.md` (number, title, done or not, files likely
  touched, verification commands), in text and JSON.
- R6. `kaizen doctor` reports whether `agent-skills@dojo` is enabled, which of his artifacts exist, and,
  when both plugins are enabled, that overlapping commands exist during 5.x with the guide to read.

**His reviews count**
- R7. A review of the branch by his `code-reviewer` persona is recorded for the push gate by itself,
  for the tree it reviewed, without a Kaizen command.
- R8. A review whose output carries a **Critical** finding is recorded as blocked, so pushing the same
  tree is refused as after a Kaizen review returning ⛔.
- R9. His other personas (`security-auditor`, `test-engineer`, `web-performance-auditor`) are logged as
  review evidence, like Kaizen's specialist reviewers.

**Measured, documented**
- R10. A guide explains how to use agent-skills with Kaizen in 5.2: what to enable, which commands to
  prefer while both exist, what the engine does with each of his files.
- R11. What happens on Claude Code, Codex and Copilot CLI with both plugins enabled is measured and
  written down, with the hook payloads recorded as test fixtures for 5.3.

### Acceptance examples
- AE1. (covers R2) Given upstream `main` moved and its `hooks/session-start.sh` changed, when the
  sync workflow runs, then a pull request is opened whose body lists `hooks/session-start.sh` under
  "Executable changes", and `main` is unchanged until it is merged.
- AE2. (covers R4, R5) Given `tasks/todo.md` with tasks 1–2 checked and 3–5 unchecked, when I run
  `kaizen status`, then it shows "agent-skills tasks: 2/5 done, next: Task 3 — <title>" and names
  `/agent-skills:build` as the next command.
- AE3. (covers R7) Given a branch with 120 changed lines and no Kaizen review, when Claude launches
  `agent-skills:code-reviewer` and it returns without a Critical finding, then `git push` is allowed
  and `kaizen review status` shows a review of depth `agent-skills` on that tree.
- AE4. (covers R8) Given the same branch, when the persona's output contains a `Critical:` finding,
  then pushing that tree is refused with the reason of a blocked review, and allowed again once the
  code changed and a new review returned no Critical finding.
- AE5. (covers R6) Given both `kaizen@dojo` and `agent-skills@dojo` enabled in
  `.claude/settings.json`, when I run `kaizen doctor`, then it reports both, the artifacts found, and
  an info line pointing to the agent-skills guide about overlapping commands.

### Out of scope
- Later (5.3–6.0, ideation): silenced-check guard, evidence ledger, scope from "Files likely touched",
  `verify --prove`, host hook adapters, removing or deprecating Kaizen's overlapping skills,
  `CONSTITUTION.md` → `CONSTRAINTS.md` migration, docs rewrite, video.
- Outside the product's identity: editing agent-skills' files in this repository.

### Dependencies and assumptions
- agent-skills is MIT (`license` in his `plugin.json`, version 0.6.15 on 2026-11-09) and its plugin root
  is the repository root with `.claude-plugin/plugin.json` named `agent-skills`.
- In Claude Code, his personas run as `agent-skills:<name>` subagents when the plugin is called
  `agent-skills` — to confirm in U8; U6 also accepts the bare name.
- His review severity labels are those of `code-review-and-quality`: Critical, (none), Nit, Optional,
  FYI.

<!-- kaizen:planning -->
## Planning contract

### Key technical decisions
- KTD1. Parameterize `sync-kioku.mjs` with `--plugin <name>` (default `kioku`) and `--mode push|pr`
  rather than writing a second script or a generic framework: two uses do not justify an abstraction
  (agent-skills' own rule), and one script keeps the safety checks (staged swap, escaping symbolic
  links, `plugin.json` name) in one place. Rejected: a copy of the script (two places to fix the same
  safety bug). Covers R1, R3.
- KTD2. The agent-skills sync opens a pull request (`--mode pr`) where kioku pushes: kioku is the
  maintainer's own code, agent-skills is third-party code whose hooks run on users' machines. Covers
  R2.
- KTD3. One read-only parser module, `scripts/agentskills.mjs`, for his four files, tolerant to missing
  sections (his templates evolve), tested on fixtures shaped like his templates
  (`planning-and-task-breakdown`, `spec-driven-development`, `constraint-driven-development`).
  Rejected: reading them inside `kaizen.mjs` (already 1,213 lines). Covers R4, R5, R6.
- KTD4. His review is recorded from the PostToolUse hook that already logs reviewers
  (`review-hooks.mjs --evidence`), on the worktree tree at that moment, with a verdict read from the
  persona's returned text (Critical → `blocked`, otherwise `ready`), depth `agent-skills`. No run
  folder is required: his personas do not write `<name>.json` outputs, so they are never counted by
  `missingOutputs`. Rejected: asking the agent to run `kaizen review record` after his review — that is
  the weight the convergence removes. Covers R7, R8, R9.
- KTD5. No change to Kaizen's skills, agents or default behavior when agent-skills is not enabled or
  his files are absent: every new path is inert without them. Covers R4–R9.

### Context and patterns to follow
- `.github/scripts/sync-kioku.mjs`, `.github/scripts/sync-kioku.test.mjs`,
  `.github/workflows/sync-kioku.yml` — the copy pattern.
- `plugins/kaizen/scripts/review-state.mjs` (`reviewerOf`, `addEvidence`, `recordReview`,
  `decidePush`) and `plugins/kaizen/scripts/review-hooks.mjs` (`--evidence`).
- `plugins/kaizen/scripts/doctor.mjs` and `plugins/kaizen/tests/doctor.test.mjs` — a new check.
- `plugins/kaizen/scripts/kaizen.mjs` `status` (line ~593) — the next-step logic.
- `plugins/kaizen/tests/contracts.test.mjs` — README lists every CLI command and hook, `docs/README.md`
  lists every guide, relative links resolve.

### Learnings and rules applied
- `CLAUDE.md` (kioku): an external marketplace source was not auto-updated (2026-11-03) → copy, not an
  external source.
- `CLAUDE.md` (kioku): never edit the copy; the same rule holds for `plugins/agent-skills/`, enforced
  by the sync replacing the folder.
- `CLAUDE.md` key conventions: scripts run on macOS, Linux and Windows — his hooks are `.sh`; U8
  records what happens on Windows instead of assuming.
- No `docs/learnings/` folder exists in this repository: absence verified.

<!-- kaizen:threats -->
## Threats

Risk surface: third-party integration (code copied from another repository, hooks executed on users'
machines).

| Threat (STRIDE) | Asset | Scenario | Countermeasure |
|---|---|---|---|
| Tampering | users' machines | an upstream change adds a malicious or broken hook or script, copied into the marketplace | sync by pull request only (U2), "Executable changes" listed in its body (AE1), merged by a human |
| Tampering | this repository | a symbolic link in upstream points outside the copy | existing escaping-link refusal of the sync script, kept for both plugins (U1) |
| Spoofing | push gate | the agent launches `agent-skills:code-reviewer` with a trivial prompt to get a review recorded | accepted risk, same level as Kaizen's reviewers today (evidence is the launch, not the content); the verdict and reviewer are visible in `review status` and the PR. Revisit with the evidence ledger (5.3) |
| Elevation of privilege | `main` | the workflow token pushes upstream content directly | `--mode pr`: the job only pushes a `sync/agent-skills` branch and opens a PR |

<!-- kaizen:rollout -->
## Rollout and rollback

- **Exposure** — opt-in: `agent-skills@dojo` is a new marketplace entry nobody has enabled; the
  engine's new paths only act when his files exist or his personas run.
- **Order** — U1–U2 (the copy) can merge first; U3–U7 ship as Kaizen 5.2.0; U8 follows, its fixtures
  feed 5.3.
- **Rollback** — remove the marketplace entry and `plugins/agent-skills/` (one revert); Kaizen 5.2.0 →
  revert or release 5.2.1. Nothing irreversible: no user file is written by the engine.
- **Signal** — Kaizen CI green on the three OSes; issues mentioning agent-skills; `kaizen doctor`
  output on this repository. Threshold: any CI failure on `main` or a reported push wrongly refused or
  allowed after a persona review → revert the change concerned.

<!-- kaizen:units -->
## Implementation units

### U1. Sync script takes a plugin name and a mode
- **Goal:** one script copies kioku (push, as today) or agent-skills (pull request).
- **Covers:** R1, R3
- **Depends on:** —
- **Files:** `.github/scripts/sync-kioku.mjs`, `.github/scripts/sync-kioku.test.mjs`
- **Approach:** `--plugin` (default `kioku`) drives the target folder, marker file
  (`.<plugin>-source`) and the expected `plugin.json` name; `--mode push|pr` only changes what the
  script prints for the workflow (the branch to push); keep every safety check. Add `--plugin
  agent-skills` cases next to the existing kioku cases; existing kioku tests unchanged.
- **Evidence:** test first
- **Test scenarios:** kioku defaults unchanged; agent-skills copy with marker; wrong `plugin.json`
  name refused; escaping symbolic link refused; up to date → no change; `.github/` dropped.
- **Verification:** `node --test .github/scripts/sync-kioku.test.mjs` green
- **Slice:** S1

### U2. Workflow, first copy, marketplace entry
- **Goal:** agent-skills is in the marketplace and refreshed by pull request.
- **Covers:** R1, R2, AE1
- **Depends on:** U1
- **Files:** `.github/workflows/sync-agent-skills.yml` (new), `plugins/agent-skills/` (generated by the
  script, never hand-edited), `.claude-plugin/marketplace.json`, `CLAUDE.md`, `README.md`
- **Approach:** copy `sync-kioku.yml`; daily schedule; job pushes branch `sync/agent-skills` and opens
  or updates a PR with `gh pr create`, body listing changed files under `hooks/`, `scripts/` and any
  `*.sh` as "Executable changes"; `permissions: contents: write, pull-requests: write`. First copy
  produced by running the script locally. Marketplace entry with his description and MIT. `CLAUDE.md`
  gets an agent-skills paragraph (a copy, never edited, sync by PR).
- **Evidence:** exception — the workflow's PR step cannot run locally; replacement check: the script's
  tests (U1) plus one manual `workflow_dispatch` run after merge, its PR linked in the release notes
- **Test scenarios:** first copy present with `.agent-skills-source`; marketplace JSON valid and
  lists six plugins; `claude plugin` loads `agent-skills@dojo` (checked in U8).
- **Verification:** `node --test .github/scripts/sync-kioku.test.mjs` green;
  `node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json'))"`
- **Slice:** S1

### U3. Parser for his artifacts
- **Goal:** Kaizen reads `SPEC.md`/`docs/SPEC.md`, `tasks/plan.md`, `tasks/todo.md`, `CONSTRAINTS.md`.
- **Covers:** R4, R5
- **Depends on:** —
- **Files:** `plugins/kaizen/scripts/agentskills.mjs` (new), `plugins/kaizen/tests/agentskills.test.mjs`
  (new), `plugins/kaizen/tests/fixtures/agent-skills/` (new: `SPEC.md`, `tasks/plan.md`,
  `tasks/todo.md`, `CONSTRAINTS.md`)
- **Approach:** `readAgentSkills(root)` → `{ spec: {path, sections, boundaries: {always, ask, never}},
  plan: {path}, tasks: [{n, title, done, acceptance, verification, depends, files, scope}],
  checkpoints, constraints: {path, floor, enforced: [{dimension, rule, command, stage}], exceptions:
  [{id, owner, expires}]} }`; task `done` from the title checkbox or all acceptance boxes checked;
  missing file or section → field absent, never an error.
- **Evidence:** test first
- **Test scenarios:** full fixtures; tasks partly checked; task without "Files likely touched"; spec at
  `docs/SPEC.md`; `CONSTRAINTS.md` without exceptions; CRLF line endings (Windows); none of the files
  → empty result.
- **Verification:** `node --test plugins/kaizen/tests/agentskills.test.mjs` green
- **Slice:** S2

### U4. `kaizen tasks` and an agent-skills-aware `status`
- **Goal:** the CLI shows his cycle and names his next command.
- **Covers:** R4, R5, AE2
- **Depends on:** U3
- **Files:** `plugins/kaizen/scripts/kaizen.mjs`, `plugins/kaizen/tests/cli.test.mjs`,
  `plugins/kaizen/skills/help/SKILL.md`, `plugins/kaizen/README.md`, `plugins/kaizen/docs/reference/cli.md`
- **Approach:** `tasks [--json]` prints U3's tasks; `status` adds an `agent_skills` block when his files
  exist and, if unchecked tasks remain and no Kaizen plan is in progress, sets the next step to
  `/agent-skills:build` (spec without tasks → `/agent-skills:plan`); a Kaizen plan in progress keeps
  priority. `help` reads that block (one paragraph).
- **Evidence:** test first
- **Test scenarios:** AE2; no files → `status` unchanged (snapshot of today's output); spec only →
  next `/agent-skills:plan`; Kaizen plan in progress + tasks → Kaizen plan wins, tasks shown.
- **Verification:** `node --test plugins/kaizen/tests/cli.test.mjs` green
- **Slice:** S2

### U5. `doctor` check `agent_skills`
- **Goal:** the user sees whether agent-skills is on and what Kaizen reads from it.
- **Covers:** R6, AE5
- **Depends on:** U3
- **Files:** `plugins/kaizen/scripts/doctor.mjs`, `plugins/kaizen/tests/doctor.test.mjs`
- **Approach:** read `.claude/settings.json` `enabledPlugins` for `agent-skills@dojo` (as the
  `ops_plugin` check does for `kaizen-ops@dojo`); report artifacts found; both enabled → info pointing
  to `docs/guides/agent-skills.md`. Never a warning when agent-skills is absent.
- **Evidence:** test first
- **Test scenarios:** AE5; agent-skills absent → check `ok` without noise; his files present but plugin
  not enabled → info with the line to add.
- **Verification:** `node --test plugins/kaizen/tests/doctor.test.mjs` green
- **Slice:** S2

### U6. His reviewers recognized, his review recorded by itself
- **Goal:** a review by `agent-skills:code-reviewer` satisfies the push gate for the tree it saw.
- **Covers:** R7, R8, R9, AE3, AE4
- **Depends on:** —
- **Files:** `plugins/kaizen/scripts/review-state.mjs`, `plugins/kaizen/scripts/review-hooks.mjs`,
  `plugins/kaizen/tests/review.test.mjs`, `plugins/kaizen/docs/concepts/review.md`
- **Approach:** `reviewerOf` also returns `agent-skills:<persona>` for `code-reviewer`,
  `security-auditor`, `test-engineer`, `web-performance-auditor` (with or without the `agent-skills:`
  prefix — U8 confirms which one Claude Code sends); `addLaunch` ignores them (no run folder).
  `--evidence`: for `code-reviewer`, call a new `recordAgentSkillsReview(root, { response })` that
  writes `reviews.json[branch]` with `depth: 'agent-skills'`, the worktree tree, `verdict`
  `blocked` if the returned text has a line starting with `Critical` (`/^\s*[-*]?\s*\**Critical\**\s*:/mi`),
  else `ready`, plus the specialist personas seen since the last record; friction logged as
  `review_recorded`. Existing `recordReview` and `decidePush` unchanged.
- **Evidence:** test first
- **Test scenarios:** AE3; AE4; persona name without prefix; Kaizen reviewer launches unaffected;
  `missingOutputs` ignores his personas; review on tree A then 200 lines changed → push refused as
  today (ceiling); not a Kaizen repo → nothing written.
- **Verification:** `node --test plugins/kaizen/tests/review.test.mjs` green
- **Slice:** S3

### U7. Guide, release 5.2.0
- **Goal:** users know how to run both, and Kaizen 5.2.0 is released.
- **Covers:** R10
- **Depends on:** U4, U5, U6
- **Files:** `plugins/kaizen/docs/guides/agent-skills.md` (new), `plugins/kaizen/docs/README.md`,
  `plugins/kaizen/README.md`, `plugins/kaizen/docs/positioning.md`, `plugins/kaizen/CHANGELOG.md`,
  `plugins/kaizen/.claude-plugin/plugin.json`, `CLAUDE.md`
- **Approach:** the guide: why (link to the ideation), enabling both, which command to use while both
  exist (his for spec/plan/build/review/ship, Kaizen for learn/metrics/watch-pr and the gates), what the
  engine does with each of his files (table), what 5.3–6.0 will change. Positioning gains an
  agent-skills column. CHANGELOG 5.2.0 (Added; no Breaking). Version 5.2.0.
- **Evidence:** exception — documentation; replacement check: contract tests (guide indexed, links
  resolve, README lists `tasks`)
- **Test scenarios:** —
- **Verification:** `node --test plugins/kaizen/tests/*.test.mjs` green
- **Slice:** S3

### U8. Host spike: both plugins on Claude Code, Codex, Copilot CLI
- **Goal:** know, measured, what works and what breaks, and keep the payloads for 5.3.
- **Covers:** R11
- **Depends on:** U2, U6
- **Files:** `plugins/kaizen/docs/hosts.md` (new), `plugins/kaizen/tests/fixtures/hosts/` (new:
  recorded hook payloads per host and event), `plugins/kaizen/docs/README.md`
- **Approach:** on each host, install from the dojo marketplace (Codex and Copilot through their
  Claude-format marketplace support), run a short scripted session (spec → plan → build one task →
  review → push), with a temporary hook that saves every payload it receives. Record: which skills
  trigger for "review my change" (his, Kaizen's, both), command names and collisions (`/review`), whether
  his `.sh` hooks and Kaizen's Node hooks run (and on Windows), the subagent type his personas get,
  which Kaizen gates hold. Findings table in `docs/hosts.md`, dated, replacing the "reported" cells of
  the ideation.
- **Evidence:** exception — manual, needs accounts on Codex and Copilot CLI; replacement check: the
  recorded payloads are committed and parsed by a smoke test
- **Test scenarios:** each recorded payload parses as JSON and has a tool name and an event name.
- **Verification:** `node --test plugins/kaizen/tests/*.test.mjs` green; `docs/hosts.md` has one
  dated row per host
- **Slice:** S4

<!-- kaizen:verification -->
## Verification contract

- Sync: `node --test .github/scripts/sync-kioku.test.mjs`.
- Kaizen: `node --test plugins/kaizen/tests/*.test.mjs` (CI on macOS, Linux, Windows via
  `.github/workflows/kaizen.yml`); kaizen-ops: `node --test plugins/kaizen-ops/tests/*.test.mjs`.
- AE1: first `workflow_dispatch` run of `sync-agent-skills` after merge opens a PR (linked in the
  release notes).
- AE2, AE5: CLI tests on fixtures; manual run of `kaizen status` and `kaizen doctor` on a scratch repo
  with his files.
- AE3, AE4: review tests with recorded persona outputs (one with a `Critical:` finding); manual push on
  a scratch branch in U8.
- R11: `docs/hosts.md` filled, fixtures committed.

<!-- kaizen:done -->
## Definition of done

- U1–U7 merged; Kaizen 5.2.0 released; `agent-skills@dojo` listed and loadable.
- Each R covered by its evidence above; every check green on the three OSes.
- Review passed with no open P0/P1.
- U8 findings written in `docs/hosts.md`, with fixtures, before 5.3 planning starts.
- A learning captured if the spike contradicts an assumption of this plan (persona naming,
  marketplace support on Codex or Copilot).
