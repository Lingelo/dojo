---
name: work
description: Executes a Kaizen plan (or a concrete request) end to end — dedicated branch, unit by unit with test-first evidence, one conventional commit per unit, quality gate active (Stop hook) while checks are red, then simplification, mandatory review and delivery. Use when the user says "implement the plan", "execute", /kaizen:work [path]. For a bug without a known cause, prefer /kaizen:debug.
allowed-tools: Bash(node:*), Bash(git:*), Bash(npm:*), Bash(npx:*), Bash(pnpm:*), Bash(yarn:*), Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, TaskCreate, TaskUpdate, TaskList
argument-hint: "[plan path | description | empty = latest plan] [mode:return]"
---

# Work — executing the plan

**Outcome:** a fully implemented and locally verified set of changes, then reviewed and shipped (or
returned to the caller in `mode:return`).

Read `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`. Before writing code for the first time, read
`${CLAUDE_PLUGIN_ROOT}/skills/work/references/implementation-loop.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

**`mode:return`** (set by `/kaizen:autopilot`): implementation and local verification **only** — no
simplification, review, push or PR (the caller handles them), no questions. **Leave the gate on**: the caller
keeps it for its whole run and turns it off itself (Phase 4 does not apply). Return:
`{ status: complete|blocked, plan_path, branch, commits: [sha…], units: [{id, status, evidence}],
verification: [{name, ok}], decisions_flagged: […], blockers: […] }`.

## Phase 0 — Input triage

- **Plan path** → read it **in full**. No units (`kaizen:units` missing) → it is only a product
  contract: propose `/kaizen:plan` first (in `mode:return`: return `blocked`).
- **Empty** → `node "$K" plan latest`; confirm the plan found before executing it (except in
  `mode:return`).
- **Request without a plan**:
  - **Trivial** (1–2 files, no behavior change) → execute directly, without a task list, keeping the
    verification (and the review, even light, before any push).
  - **Bounded** → infer 2 to 6 units yourself, announce them in 5 lines, then execute.
  - **Fuzzy or risky** → propose `/kaizen:plan` (or `/kaizen:brainstorm`) instead of improvising.
- Do not renegotiate a validated plan: a decision to weigh becomes **one** question, not a return to
  planning.

## Phase 1 — Workspace

1. `git status --short`: list the files **already modified** by the user. A unit needing one of these
   files → ask once whether to include or exclude it (in `mode:return`: `blocked` with the collision).
2. **Branch** — if you are on the default branch (`main`, `master`, or
   `git rev-parse --abbrev-ref origin/HEAD` **without** the `origin/` prefix), create a branch
   `<type>/<topic>` (prefixed with the plan's or the request's Jira key if known) and say so. Never
   write to the default branch without an explicit request in this session.
3. **Gate** — `node "$K" gate on --plan <path>`: the Stop hook will refuse to finish while checks are
   red (3 blocks max, then it lets through while saying so).
4. **Context** — read the files referenced by the plan, the learnings it cites (`docs/learnings/…`),
   the cited pack rules and `CONSTITUTION.md` if it exists. A cited learning is an implementation
   constraint; a constitution article is a rule, not a suggestion (a **draft** one, `status: draft`, informs only). Check the plan once:
   `node "$K" plan check <path>` (red → `/kaizen:plan` first).
5. **Tasks** — one task per unit (`TaskCreate`), in dependency order.

## Phase 2 — Execute

Follow `implementation-loop.md` for each unit: evidence first, implementation within the repo's
conventions, targeted verification, evidence recorded, **unit commit** (the unit's files only,
conventional format with Jira). A unit's independent reads go out in a single message.

Many **independent** units (no shared file, no dependency): you may hand some to `general-purpose`
subagents in parallel (`model`: `node "$K" models --json` → `roles.implement.model`), each with a
self-contained package (full unit, files, pattern to imitate, verification command, no committing
allowed). You remain the integrator: inspect the real diff of each result, rerun the verification, and
make the commits yourself. At the slightest conflict, go back to serial.

## Phase 3 — Quality (autonomous mode only)

1. **Full verification** — `node "$K" verify`. Red → fix the root cause, never by weakening a test.
   Dependencies added or changed → `node "$K" verify --only audit` too.
2. **Size** — `node "$K" size`. Above `pr.max_lines`: the slice was too big — propose splitting it into
   several PRs (stacked branches, one per group of units) rather than shipping a block nobody will
   review well. Accepted exception (generated code, migration) → stated in the PR.
3. **Plan coverage** — each `R` and each `AE` has its evidence (test or recorded verification); each
   item of the "Definition of done" is true. Otherwise, complete it.
4. **Simplification** — if the `simplify` skill is available, invoke it on the branch diff; otherwise,
   reread the diff yourself with three lenses (reusing an existing utility, clarity, efficiency) and
   apply the safe simplifications. Verify again.
5. **Mandatory review** — invoke `kaizen:review plan:<path>`. The work is **not** done and nothing is
   pushed without a review report actually produced, or an explicit instruction from the user to skip
   it. A mental self-review does not count.
6. Apply the kept P0/P1 fixes (or ask for those marked `manual`), verify again, commit, then record the
   review again with the post-fix verdict (`node "$K" review record --verdict …`): without it, the push
   hook will refuse the delivery.

## Phase 4 — Deliver

1. `node "$K" gate off`.
2. Summary: units shipped, evidence, commits, remaining review findings (and why), decisions made
   along the way.
3. Propose (one question): **ship** (Recommended → invoke `kaizen:ship <plan>`: push, PR with a
   description and reviewer guide from the plan, then PR watching offered) · **keep it local** ·
   **capture a learning first**.
4. If the work produced non-obvious reasoning (a trap, a surprising cause, a decision that took
   investigation), propose `/kaizen:learn` — that is what makes the next cycle easier.
