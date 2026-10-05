---
name: plan
description: Turns an idea, requirements or a plan from /kaizen:brainstorm into an implementation plan ready to execute (HOW to build) — parallel research (repo patterns, past learnings, git history, external docs), justified technical decisions, work units with files, evidence strategy and tests, verification contract. Use when the user says "plan it", "break this work down", "how do we implement…", /kaizen:plan, or to deepen an existing plan (deepen). Never writes production code.
allowed-tools: Bash(node:*), Bash(git:*), Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, WebSearch, WebFetch
argument-hint: "[description | plan path | deepen <path>]"
---

# Plan — deciding HOW to build

`/kaizen:brainstorm` defines **WHAT**, `/kaizen:plan` decides **HOW**, `/kaizen:work` executes. A prior
brainstorm is optional. **Research, decide, write — never implement**: no production code, no tests run
"to see". Directional pseudo-code is allowed.

Read `${CLAUDE_PLUGIN_ROOT}/references/conventions.md` then `${CLAUDE_PLUGIN_ROOT}/references/plan-contract.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

**`mode:return`** (set by `/kaizen:autopilot`): no questions; take the most conservative default and
record it as an assumption; return `{ status: complete|blocked, plan_path, blockers }`. Evidence that
invalidates a decision made in session stops the writing: return `status: blocked` with
`settled-decision-invalidated`, the decision and the reason.

## Phase 0 — Source and output shape

1. **Source** — in order: path passed as argument; plan written by `/kaizen:brainstorm` in this
   session; otherwise the description. With `deepen <path>`, go straight to the "Deepen" section.
2. **Existing plan** — if the path points to an already ready plan (`<!-- kaizen:units -->` present)
   and no deepening is requested, offer: execute it, deepen it, or revise it.
3. **Output shape** (when in doubt, the heavier one):
   - **Direct** — doable and verifiable in one pass, no decision to weigh: state the change in a few
     sentences and propose `/kaizen:work`.
   - **Brief** — bounded work, at most one decision, no risk surface: plan in the chat.
   - **Durable** — everything else, and always if: explicit request for a plan, `return` mode, risk
     surface (auth, payment, migration, external contract). → file.
4. Without a brainstorm, if the request allows several plausible product readings, ask the 1 to 3
   blocking questions (one per turn) — or propose `/kaizen:brainstorm` if it is broader.

## Phase 1 — Research (parallel, a single message)

Prepare a self-contained **work context** (goal, R/AE requirements, assumed modules, decisions under
consideration) and launch as needed, each agent with its `model` (`node "$K" models --json`):

| Agent | When |
|---|---|
| `kaizen:repo-researcher` | always in Durable: patterns to imitate, integration, neighboring tests |
| `kaizen:learnings-researcher` | always if `<root>/learnings/` contains learnings or packs are declared — pass it the CLI path, the resolved root and the pack list (`node "$K" packs --json`) |
| `kaizen:git-historian` | the work changes old, central or already bug-prone code |
| `kaizen:docs-researcher` | a decision depends on uncertain external behavior or a technology new to the repo — ask it **precise questions** |
| `kaizen:flow-analyst` | multi-step behavior and no prior brainstorm with acceptance examples |

Meanwhile, read yourself the files the request names, `node "$K" detect` (real verification commands)
and `node "$K" constitution --json` (principles to respect). A heavy or irreversible architecture
decision (data format, vendor, public interface) deserves `/kaizen:decide`: propose it rather than
settling it in one KTD line.

## Phase 2 — Decide

- Resolve each "deferred to planning" question with evidence (code, learning, doc, pack).
- State the **key technical decisions** `KTD1…`: decision, reason, rejected alternative, `covers R…`.
  A decision made by the user in session is carried over as is with its annotation.
- An applicable learning **changes** the plan (constraint, test, sequence) and is cited; an applicable
  pack rule is cited `(pack: <id>, <file>)`; do not contradict it without saying so.
- What really remains open and blocks: a question to the user (one at a time). In `mode:return`,
  record the chosen assumption; never leave a `[NEEDS CLARIFICATION: …]` in a ready plan.
- **Constitution**: assess each article (`kaizen:constitution` section). A NON-NEGOTIABLE article that
  cannot be respected blocks the plan (capsule: open blocker) — do not work around it.
- **Threats**: risk surface (auth, sensitive data, payment, external input, integration) →
  `kaizen:threats` section (lightweight STRIDE), each countermeasure carried by a unit. `full` profile:
  always.
- **Rollout**: `kaizen:rollout` section — exposure (flag?), order, rollback, what is irreversible,
  signal to watch. Cite the signal by its name declared in `monitor.signals` (`node "$K" config`) with
  its threshold, `` `error_rate` > 1 % → rollback ``: that is what `/kaizen:deploy` will watch after the
  release. Signal needed but not declared → say so in the plan (to add to the config). `lean` profile:
  only if the change reaches production in a way that is hard to undo (migration, public API, data);
  otherwise one line is enough.

## Phase 3 — Structure

Split into **units** `U1…` per `plan-contract.md`: one unit ≈ one coherent commit, ordered by
dependency, each with exact files, `Covers`, approach (pattern to imitate, path cited), **evidence**
strategy (test first by default for any behavior change), test scenarios (each `AE` has its own; edge
cases and "What didn't work" learnings become tests), executable verification.

**Slices**: group the units into slices (`**Slice:** S1`), one slice = one PR under `pr.max_lines`
(config, 400 by default) that leaves the default branch healthy. Roughly estimate lines per unit;
beyond the limit, split (often: model and tests → endpoint → interface, the visible part behind a
flag).

**Build what is asked**: only add an unrequested mechanism (guard, retry, option, abstraction) if an
existing contract requires it, if its absence lets harm happen before anyone sees it, or if it would be
expensive to add later (stored data, public interface, money, security) — and in its smallest form.

## Phase 4 — Write

- Plan from a brainstorm: **enrich the same file in place** (add `kaizen:planning`, `kaizen:units`,
  `kaizen:verification`, `kaizen:done`; do not rewrite the product contract except for a validated
  correction).
- Otherwise: `node "$K" plan new --type <type> --topic <slug>`, then capsule + product contract
  (`source: plan`) + planning sections.
- No trace of the process in the file. Relative paths. Configured language (`config.language`); the
  field names the tools read (`**Covers:**`, `**Files:**`, `**Evidence:**`, `**Verification:**`,
  `**Slice:**`, `**Rollback**`, `**Signal**`) stay as in the contract.

## Phase 5 — Confidence check

1. `node "$K" plan check <path>` must pass: fix until green.
2. Go through the **"implementation-ready" check** of `plan-contract.md` and fix in place.
3. **Mandatory independent review** (Durable shape): invoke `kaizen:doc-review <path> mode:auto`. It
   applies the mechanical fixes and returns the remaining decisions: ask them to the user (one per
   turn) interactively, or record them in `mode:return`. A ⛔ verdict blocks what follows. Then reread
   the plan as a hostile reviewer: which unit is fuzziest? which KTD rests on an assumption? which risk
   has no test? If a weakness touches a decision, run a targeted research (see "Deepen") before
   delivering.

## Phase 6 — Follow-up

Interactively, ask exactly: "Plan ready: `<path>`. What do you want to do?" with:
1. **Start implementation** → invoke `kaizen:work <path>` (Recommended).
2. **Chain everything autonomously** → `kaizen:autopilot <path>`.
3. **Deepen** a weak section → next section.
4. **Review it myself** → stop, give the path and the 3 decisions to check first.

## Deepen (`deepen`)

For each weak section (thinly supported KTD, fuzzy unit, risk without a test, learning not consulted):
launch the suitable agent with a precise question, integrate the answer **in place** (no stacked
"resolutions" section), add `deepened: <date>` to the frontmatter, and rerun the confidence check.
Summarize in 3 to 5 lines what changed.
