---
title: Kaizen multi-host (Cursor, Codex) - Plan
type: feat
date: 2026-10-07
topic: kaizen-multi-host
artifact: kaizen-plan/v1
source: plan
---

# Kaizen multi-host (Cursor, Codex) - Plan

<!-- kaizen:goal -->
## Goal capsule

**Goal:** a team on Cursor or Codex installs Kaizen from this repository and runs the same loop
(plan → work → review → ship) with the same artifacts and the same safety gates as on Claude Code,
without a second copy of skills, agents or scripts to maintain.
**Means:** the Compound Engineering approach — one repository, one native manifest per host, skills
as the portable unit, reviewer prompts read from a single source; plus git hooks so the gates do not
depend on any host.
**Product authority:** scope decided by the user in session (2026-10-07): Cursor and Codex first,
approach modeled on Every's Compound Engineering plugin.
**Open blockers:** none. S0 is a go/no-go spike: each later slice assumes the host behavior that S0
confirms, and a "no" in the matrix re-plans that slice before it starts.

<!-- kaizen:product -->
## Product contract

### Summary
Kaizen ships as a Claude Code, Cursor and Codex plugin from the same `plugins/kaizen/` folder. Where a
host lacks a capability (parallel subagents, a hook event, token transcripts), Kaizen degrades in a
documented way and never silently weakens a gate.

### Requirements

**Installation and invocation**
- R1. Kaizen installs in Cursor from this repository's marketplace and its skills can be invoked.
- R2. Kaizen installs in Codex from this repository's marketplace and its skills can be invoked.
- R3. Skills find the Kaizen CLI on every host, without depending on `CLAUDE_PLUGIN_ROOT`.
- R4. Skills, agents, references and scripts exist once; host-specific files are limited to manifests
  and hook wiring.

**Gates**
- R5. A commit that adds a secret is refused on every host, whether the agent or a human commits.
- R6. A push of an unreviewed branch is refused on every host, with the same waiver flow.
- R7. A review is only recorded as passed if Kaizen reviewers actually ran, on every host.

**Compatibility**
- R8. Claude Code behavior is unchanged: gates, review evidence, model per role, token accounting.
- R9. The user docs state, per host, what works and what degrades.

### Key decisions
- **Native manifests, no converter** — what Compound Engineering converged on after shipping a
  converter CLI; nothing to run at install time. Governs R1, R2, R4.
- **Cursor and Codex only in this plan** — the user's two named targets; the S0 matrix tells how
  cheap the next hosts are. Governs R1, R2.

### Acceptance examples
- AE1. (covers R1, R3) Given Cursor with this repository added as a plugin marketplace, when I
  install `kaizen` and ask for `/kaizen:help`, then the skill runs `kaizen.mjs status` and shows the
  repository state.
- AE2. (covers R2, R3) Given Codex with this repository added as a marketplace, when I invoke the
  `help` skill of the `kaizen` plugin, then it runs `kaizen.mjs status` and shows the repository state.
- AE3. (covers R5) Given a staged file containing an AWS access key, when the agent in Codex or Cursor
  runs `git commit`, then the commit is refused with the Kaizen secret message.
- AE4. (covers R5, R6) Given `kaizen.mjs hooks install` was run, when a human runs `git push` of a
  branch with no recorded review, then the push is refused with the same message as the agent gets.
- AE5. (covers R7) Given Codex and a branch whose diff is over the light-review limit, when
  `review record` is called without any reviewer having run, then it is refused.
- AE6. (covers R8) Given Claude Code, when the existing test suite runs, then every test passes
  without modifying any existing assertion about gates, evidence or token usage.
- AE7. (covers R3) Given `CLAUDE_PLUGIN_ROOT` is unset, when a skill resolves the CLI, then it finds
  `scripts/kaizen.mjs` relative to its own skill directory.

### Out of scope
- Later: GitHub Copilot, OpenCode, Gemini/Antigravity, Kimi, Grok, Devin, Cline (one manifest each
  once S0 shows the pattern holds).
- Later: token accounting (`cycle_cost`) for hosts other than Claude Code.
- Outside the product's identity: a converter or installer that rewrites skills per host.

<!-- kaizen:planning -->
## Planning contract

### Key technical decisions
- KTD1. **Ship native manifests next to `.claude-plugin/`** — `.cursor-plugin/plugin.json` and
  `.codex-plugin/plugin.json` in `plugins/kaizen/`, and a marketplace entry per host at the repo root
  (`.cursor-plugin/marketplace.json`, `.agents/plugins/marketplace.json` for Codex). Evidence:
  Compound Engineering ships exactly this layout (`.claude-plugin/`, `.cursor-plugin/`,
  `.codex-plugin/`, `.agents/` at its root); Cursor documents `.cursor-plugin/plugin.json` with
  `skills`, `agents`, `hooks`, `mcpServers`; Codex documents `.codex-plugin/plugin.json` with
  `skills`, `hooks`, `mcpServers` and repository marketplaces in `.agents/plugins/marketplace.json`.
  Rejected: a `kaizen.mjs install --target` converter (a second format to keep in sync; Compound
  Engineering moved away from it). Covers R1, R2, R4.
- KTD2. **Locate the CLI from the skill's own directory** — one paragraph in
  `references/conventions.md`: `K` is `${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs` when that variable
  is set, otherwise `<this skill's directory>/../../scripts/kaizen.mjs` (every host gives the model the
  skill's path when it loads it). Every skill then uses `$K` and `$KAIZEN` (plugin root) instead of
  spelling `${CLAUDE_PLUGIN_ROOT}`. Rejected: copying scripts into each skill (breaks R4). Covers R3.
- KTD3. **One hook script per gate, a payload adapter in front** — `scripts/hookio.mjs` reads the
  stdin of Claude Code, Cursor (`conversation_id`, `beforeShellExecution` + `command`, deny by exit 2
  or `permission: "deny"`) and Codex (`PreToolUse`/`PostToolUse`/`Stop`/`UserPromptSubmit`), and
  returns one shape `{ host, session, tool, command, input, transcript }`. The gate scripts keep their
  logic and only change how they read input. Rejected: one script per host (three copies of the
  secret and review rules). Covers R5, R6, R8.
- KTD4. **Git hooks as the host-independent floor** — `kaizen.mjs hooks install` writes `pre-commit`
  (secret scan of the staged diff) and `pre-push` (review state of the pushed tree), calling the same
  modules as the agent hooks. It never overwrites a hook it did not write: with an existing hook or a
  `core.hooksPath` (husky, lefthook) it prints the line to add instead, like `audit fix` scaffolds
  without overwriting. Covers R5, R6.
- KTD5. **Reviewer prompts stay in `agents/*.md`, read by path where there are no Kaizen subagents**
  — on Claude Code the review skill keeps launching `kaizen:<name>` subagents (evidence, model per
  role unchanged); elsewhere it reads `$KAIZEN/agents/<name>.md` and passes it as the prompt of the
  host's generic subagent, or of a headless child process (KTD6). Compound Engineering does the same
  with prompts in `references/`; keeping them in `agents/` keeps a single source and the Claude Code
  path untouched. Covers R4, R7, R8.
- KTD6. **Verifiable review evidence outside Claude Code comes from `kaizen.mjs review run`** — the
  CLI launches each selected reviewer as a headless host process (`codex exec`, `cursor-agent -p`,
  `claude -p`), collects its findings into the run folder and writes the evidence itself. On a host
  with a subagent hook (Cursor `subagentStart`), the hook logs evidence as on Claude Code. A review
  done inline by the main agent stays a light review and is refused above the light limit.
  Rejected: trusting the agent to declare which reviewers ran (the gate would become advisory).
  Covers R7.
- KTD7. **`CLAUDE_PLUGIN_DATA` gets a fallback chain** — `KAIZEN_DATA`, then `CLAUDE_PLUGIN_DATA`,
  then `~/.cache/kaizen` (already the last fallback in `scripts/kaizen.mjs:389`). Covers R3.

### Context and patterns to follow
- `plugins/kaizen/hooks/hooks.json` — the six hook entries to rewire through `hookio.mjs`.
- `plugins/kaizen/scripts/secret-gate.mjs`, `review-gate.mjs`, `review-hooks.mjs`,
  `quality-gate.mjs`, `cycle-agents.mjs` — current payload readers (`input.tool_name`,
  `input.session_id`, `input.transcript_path`).
- `plugins/kaizen/scripts/review-state.mjs` — evidence model (`addEvidence`, light limit,
  `PROTECTED_STATE`): KTD6 writes through it, never around it.
- `plugins/kaizen/scripts/audit.mjs` — scaffolding without overwriting, to imitate for KTD4.
- `plugins/kaizen/skills/review/SKILL.md` (step 4) and `skills/doc-review/SKILL.md` — the two
  places that launch agents.
- `plugins/kaizen/tests/contracts.test.mjs` — where manifest, doc and README contracts live.
- Compound Engineering (`EveryInc/compound-engineering-plugin`): root manifest layout,
  host-neutral dispatch wording in `skills/ce-code-review/SKILL.md`.

### Learnings and rules applied
- No `docs/learnings/` and no packs in this repository: verified, nothing to apply.
- `CLAUDE.md` (Key conventions) — hooks over deny rules; exit code 2 = block; scripts run on macOS,
  Linux and Windows → `hookio.mjs` and the git hooks are tested on the three OS in the Kaizen CI;
  everything in English.

### Risks
- **Host formats move fast** (Cursor and Codex plugin systems are months old) → S0 verifies on real
  installs, and the manifest contract test pins the fields we rely on.
- **Hook payload or tool names differ from the docs** (e.g. Codex shell tool name) → `hookio.mjs` is
  tested with payloads captured in S0, not with payloads written from the docs.
- **Headless CLIs unavailable or unauthenticated** in a user's environment → `review run` reports it
  and the review stays light; the push gate then refuses above the light limit, with the waiver flow
  as the explicit way out.

<!-- kaizen:threats -->
## Threats

- **Tampering** · review state · an agent on a new host writes `review-evidence.json` directly →
  `PROTECTED_STATE` writes stay blocked by the review gate on every host through `hookio.mjs` (U5);
  git `pre-push` re-checks the recorded tree (U6).
- **Elevation of privilege** · push gate · an agent pushes with `--no-verify` to skip the git hooks →
  the agent-side PreToolUse gate keeps refusing `--no-verify` on hosts with hooks (U5); on a host
  without a shell hook this is an accepted risk, stated in the hosts guide (U10), decided by the user.
- **Repudiation** · review evidence · a reviewer is claimed but never ran → evidence only from a hook
  or from `review run` itself (U7, U8), never from the agent's word.
- **Information disclosure** · secrets · a secret committed from a host without hook support →
  `pre-commit` hook (U6) runs the same scanner as `secret-gate.mjs`.

<!-- kaizen:rollout -->
## Rollout and rollback

- **Exposure**: direct. New manifests only appear in Cursor and Codex once a user adds the
  marketplace; Claude Code users see no change (R8). Git hooks are opt-in (`kaizen.mjs hooks install`).
- **Order**: S0 → S1 → S2 → S3 → S4 → S5 → S6 → S7; each slice leaves `main` green on Claude Code.
- **Rollback**: revert the slice's PR. Installed git hooks are removed with
  `kaizen.mjs hooks uninstall`. Nothing irreversible: no data migration, `.kaizen/state` format
  unchanged.
- **Signal**: no production service; the Kaizen CI (`.github/workflows/kaizen.yml`) on the three OS
  and the S0 smoke protocol rerun on Cursor and Codex before the version bump. Threshold: failed CI
  jobs > 0 or failed smoke steps > 0 after merge → revert the slice.

<!-- kaizen:units -->
## Implementation units

### U1. Host compatibility matrix (spike)
- **Goal:** confirm on real installs what each host does, before building on it.
- **Covers:** R1, R2, R3, R5
- **Depends on:** —
- **Files:** `plugins/kaizen/docs/reference/hosts.md` (new: protocol and matrix),
  `plugins/kaizen/evals/host-probe/` (new: probe marketplace and plugin, `probe.mjs`),
  `plugins/kaizen/tests/probe.test.mjs` (new), `plugins/kaizen/docs/README.md`,
  `plugins/kaizen/tests/fixtures/hooks/` (new, after the run: captured stdin payloads per host and event)
- **Approach:** install a throwaway plugin with a `.cursor-plugin` and a `.codex-plugin` manifest
  and a hook that dumps its stdin. Record: skill invocation syntax, the skill path given to the
  model (KTD2), `CLAUDE_PLUGIN_ROOT`/`CURSOR_PLUGIN_ROOT` expansion in hooks, the shell tool name and
  block semantics, `Stop`/`stop` and prompt-submit events, generic subagents, headless CLI flags.
  Each matrix row says "verified" with the host version, or "no". Go/no-go per later slice.
- **Evidence:** exception — spike; the captured payloads become the fixtures that U4 tests against.
- **Test scenarios:** none (spike).
- **Verification:** `hosts.md` has one verified row per capability used by U2–U9 for each host.
- **Slice:** S0

### U2. Host-neutral CLI location
- **Goal:** skills find the CLI and the plugin root on every host (KTD2, KTD7).
- **Covers:** R3, R4, AE7
- **Depends on:** U1
- **Files:** `plugins/kaizen/references/conventions.md`, `plugins/kaizen/skills/*/SKILL.md` (23),
  `plugins/kaizen/references/plan-contract.md`, `plugins/kaizen/references/learnings-schema.md`,
  `plugins/kaizen/scripts/kaizen.mjs`, `plugins/kaizen/tests/contracts.test.mjs`,
  `plugins/kaizen/tests/cli.test.mjs`
- **Approach:** one "Locating Kaizen" paragraph in `conventions.md` defines `$KAIZEN` and `$K`;
  skills replace the 73 `${CLAUDE_PLUGIN_ROOT}` spellings with `$KAIZEN`. Data dir fallback chain
  in `kaizen.mjs` (KTD7).
- **Evidence:** test first.
- **Test scenarios:** contract — no skill spells `${CLAUDE_PLUGIN_ROOT}` outside the resolution
  paragraph; every skill reads `conventions.md`; CLI — data dir honors `KAIZEN_DATA`, then
  `CLAUDE_PLUGIN_DATA`, then the home cache.
- **Verification:** `node --test plugins/kaizen/tests/contracts.test.mjs plugins/kaizen/tests/cli.test.mjs`
- **Slice:** S1

### U3. Host-neutral skill wording
- **Goal:** skills read correctly on a host without Claude Code's tool names.
- **Covers:** R1, R2, R4
- **Depends on:** U2
- **Files:** `plugins/kaizen/skills/*/SKILL.md`, `plugins/kaizen/references/conventions.md`,
  `plugins/kaizen/tests/contracts.test.mjs`
- **Approach:** a short tool glossary in `conventions.md` ("ask the user" = `AskUserQuestion` on
  Claude Code, a plain question elsewhere; "launch a subagent" = `Agent` on Claude Code, the host's
  subagent tool otherwise). Skill bodies use the neutral verb; `allowed-tools` frontmatter stays (other
  hosts ignore it, S0 confirms). Same wording style as `ce-code-review` ("sized to the host's
  active-agent cap").
- **Evidence:** test first (contract).
- **Test scenarios:** contract — no skill body names `AskUserQuestion` or `subagent_type` outside a
  "On Claude Code" sentence; frontmatter still has `name`, `description`, `allowed-tools`.
- **Verification:** `node --test plugins/kaizen/tests/contracts.test.mjs`
- **Slice:** S2

### U4. Hook payload adapter
- **Goal:** one normalized hook input for Claude Code, Cursor and Codex (KTD3).
- **Covers:** R5, R6, R8, AE6
- **Depends on:** U1
- **Files:** `plugins/kaizen/scripts/hookio.mjs` (new), `plugins/kaizen/tests/hookio.test.mjs` (new)
- **Approach:** `readHookInput()` detects the host from the payload (`cursor_version`,
  `conversation_id`, Codex fields from U1) and returns `{ host, session, tool, command, input,
  transcript }`; `deny(message)` writes stderr and exits 2 (works on all three, S0 confirms) and adds
  Cursor's `permission: "deny"` JSON when the host is Cursor.
- **Evidence:** test first, against the U1 fixtures.
- **Test scenarios:** each captured payload maps to the expected shape; unknown payload → Claude Code
  shape (no regression); a Cursor `beforeShellExecution` exposes `command`.
- **Verification:** `node --test plugins/kaizen/tests/hookio.test.mjs`
- **Slice:** S3

### U5. Gates read through the adapter
- **Goal:** the existing gates work unchanged on Claude Code and react on Cursor and Codex.
- **Covers:** R5, R6, R8, AE3, AE6
- **Depends on:** U4
- **Files:** `plugins/kaizen/scripts/secret-gate.mjs`, `review-gate.mjs`, `review-hooks.mjs`,
  `quality-gate.mjs`, `cycle-agents.mjs`, `plugins/kaizen/tests/gate.test.mjs`,
  `plugins/kaizen/tests/secrets.test.mjs`, `plugins/kaizen/tests/review.test.mjs`
- **Approach:** replace direct `input.tool_name`/`input.session_id` reads by `hookio.mjs`; token
  usage stays Claude Code only (`host === 'claude'`).
- **Evidence:** characterization first — existing gate tests green before the change, then new cases
  per host.
- **Test scenarios:** Codex and Cursor payloads of `git commit` with an AWS key → exit 2 (AE3);
  Cursor `git push` unreviewed → exit 2; `--no-verify` refused on all hosts; every existing gate,
  review and secrets test unchanged (AE6).
- **Verification:** `node --test plugins/kaizen/tests/*.test.mjs`
- **Slice:** S3

### U6. Git hooks install
- **Goal:** secret and review gates enforced by git itself, for any host and for humans (KTD4).
- **Covers:** R5, R6, AE4
- **Depends on:** U5
- **Files:** `plugins/kaizen/scripts/githooks.mjs` (new), `plugins/kaizen/scripts/kaizen.mjs`,
  `plugins/kaizen/tests/githooks.test.mjs` (new), `plugins/kaizen/README.md`,
  `plugins/kaizen/docs/reference/cli.md`
- **Approach:** `kaizen.mjs hooks install|uninstall|status`; generated hooks call
  `node <kaizen>/scripts/secret-gate.mjs --git` (staged diff) and `review-gate.mjs --git` (pushed
  refs from stdin); marker comment to recognize Kaizen's own hooks; `core.hooksPath` or a foreign hook
  → print the line to add, change nothing.
- **Evidence:** test first (temp git repos).
- **Test scenarios:** commit with a key refused; clean commit passes; push of an unreviewed branch
  refused, reviewed tree accepted (AE4); existing foreign hook untouched; `core.hooksPath` set →
  instruction printed; uninstall removes only marked hooks; works on Windows (Node shebang-less
  `sh` wrapper as git runs hooks through sh).
- **Verification:** `node --test plugins/kaizen/tests/githooks.test.mjs`
- **Slice:** S4

### U7. Reviewer prompts by path
- **Goal:** the review and doc-review skills launch Kaizen reviewers on any host (KTD5).
- **Covers:** R4, R7, R8
- **Depends on:** U3
- **Files:** `plugins/kaizen/skills/review/SKILL.md`, `plugins/kaizen/skills/doc-review/SKILL.md`,
  `plugins/kaizen/references/review-contract.md`, `plugins/kaizen/tests/contracts.test.mjs`
- **Approach:** step 4 becomes: on Claude Code, `kaizen:<name>` subagents as today; on a host with a
  generic subagent, prompt = `$KAIZEN/agents/<name>.md` body + contract; otherwise
  `node "$K" review run` (U8).
- **Evidence:** test first (contract).
- **Test scenarios:** contract — every reviewer named in `persona-catalog.md` has an `agents/` file
  readable by path; the Claude Code branch still names `subagent_type`.
- **Verification:** `node --test plugins/kaizen/tests/contracts.test.mjs`
- **Slice:** S5

### U8. Headless review runner with evidence
- **Goal:** verifiable reviewer evidence where the host has no subagent hook (KTD6).
- **Covers:** R7, AE5
- **Depends on:** U7, U5
- **Files:** `plugins/kaizen/scripts/review-run.mjs` (new), `plugins/kaizen/scripts/kaizen.mjs`,
  `plugins/kaizen/scripts/review-state.mjs`, `plugins/kaizen/tests/review.test.mjs`,
  `plugins/kaizen/tests/fixtures/` (fake `codex`/`cursor-agent` like the fake `gh` of `pr.test.mjs`)
- **Approach:** `kaizen.mjs review run --host <h> --reviewers a,b --context <file>` runs each
  reviewer through `run-bounded.mjs` in parallel, writes findings to the run folder, records evidence
  via `addEvidence` with `host` and `model`. Cursor `subagentStart` hook entry also logs evidence.
- **Evidence:** test first, fake CLIs.
- **Test scenarios:** two reviewers → two evidence entries and two finding files; a CLI missing or
  timing out → that reviewer failed, no evidence for it; `review record` above the light limit with no
  evidence refused on a Codex session (AE5); Claude Code evidence path unchanged.
- **Verification:** `node --test plugins/kaizen/tests/review.test.mjs`
- **Slice:** S5

### U9. Cursor and Codex manifests and marketplaces
- **Goal:** Kaizen installable from this repository in both hosts (KTD1).
- **Covers:** R1, R2, R4, AE1, AE2
- **Depends on:** U2, U3, U5
- **Files:** `plugins/kaizen/.cursor-plugin/plugin.json` (new), `plugins/kaizen/.codex-plugin/plugin.json`
  (new), `plugins/kaizen/hooks/cursor-hooks.json` (new), `plugins/kaizen/hooks/codex-hooks.json` (new,
  unless U1 shows Codex reads `hooks.json` as is), `.cursor-plugin/marketplace.json` (new),
  `.agents/plugins/marketplace.json` (new), `plugins/kaizen/tests/contracts.test.mjs`
- **Approach:** manifests point at the shared `skills/`, `agents/` (Cursor), `.mcp.json` and the host
  hook file; versions mirror `.claude-plugin/plugin.json`.
- **Evidence:** test first (contract) + the S0 smoke protocol on real hosts.
- **Test scenarios:** contract — the three manifests share name, version and description; every path
  they reference exists; marketplace entries point at `plugins/kaizen`; hook files reference only
  existing scripts.
- **Verification:** `node --test plugins/kaizen/tests/contracts.test.mjs`; AE1 and AE2 by hand.
- **Slice:** S6

### U10. Hosts guide and docs
- **Goal:** users know how to install on each host and what degrades (R9).
- **Covers:** R9
- **Depends on:** U9, U6, U8
- **Files:** `plugins/kaizen/docs/guides/hosts.md` (new), `plugins/kaizen/docs/README.md`,
  `plugins/kaizen/docs/getting-started.md`, `plugins/kaizen/README.md`, `CLAUDE.md`,
  `plugins/kaizen/CHANGELOG.md`, `plugins/kaizen/.claude-plugin/plugin.json` (version bump)
- **Approach:** install steps per host, the S0 matrix as a "what works where" table (parallel
  reviewers, model per role, evidence source, token metrics, gates), `hooks install` recommended
  outside Claude Code.
- **Evidence:** test first (contracts: docs index lists the guide, links resolve).
- **Test scenarios:** contract — `docs/README.md` lists `guides/hosts.md`; README lists `hooks`
  command; relative links resolve.
- **Verification:** `node --test plugins/kaizen/tests/contracts.test.mjs`
- **Slice:** S7

<!-- kaizen:verification -->
## Verification contract
- `node --test plugins/kaizen/tests/*.test.mjs` on every slice; Kaizen CI green on macOS, Linux and
  Windows (`.github/workflows/kaizen.yml`).
- Per unit: the targeted command in its **Verification** field.
- AE1, AE2, AE3 by hand on the latest Cursor and Codex, following the S0 smoke protocol in
  `docs/reference/hosts.md`, before the version bump.
- AE4, AE5, AE6, AE7 proved by the automated tests of U6, U8, U5 and U2.
- Size estimates (reviewable lines): S0 ~1,050 as built (over `pr.max_lines`: ~250 are generated
  hook JSON, ~160 the protocol page; accepted for a throwaway probe, reviewed as one unit), S1 ~250, S2 ~250, S3 ~350, S4 ~300, S5 ~380,
  S6 ~150, S7 ~250 — each under `pr.max_lines` (400).

<!-- kaizen:done -->
## Definition of done
- U1–U10 shipped, one PR per slice, each with its evidence.
- R1–R9 and AE1–AE7 covered: automated tests green, manual smoke on Cursor and Codex recorded in
  `docs/reference/hosts.md` with host versions.
- No existing Claude Code test modified in its assertions (AE6).
- `/kaizen:review` with no open P0/P1 on each slice; diff under `pr.max_lines` (`node "$K" size`).
- Learning captured on what differed between host docs and observed host behavior.
