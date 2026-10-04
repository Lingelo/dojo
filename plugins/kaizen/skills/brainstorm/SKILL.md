---
name: brainstorm
description: Turns a fuzzy or ambitious idea into clear requirements (WHAT to build) through a one-question-at-a-time dialogue grounded in the code and past learnings, then writes the first version of the unified plan (product contract with R ids and acceptance examples). Use when the user wants to explore, frame or refine a feature or a problem before planning — "let's think about…", "I'd like…", /kaizen:brainstorm. Not for executing already specified work (/kaizen:plan or /kaizen:work).
allowed-tools: Bash(node:*), Bash(git:*), Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion
argument-hint: "[idea, feature or problem to explore]"
---

# Brainstorm — defining WHAT to build

The brainstorm answers **WHAT** through dialogue; `/kaizen:plan` then enriches the **same file** with
the **HOW**. This skill writes **no code**.

Before starting, read `${CLAUDE_PLUGIN_ROOT}/references/conventions.md` (CLI, root, language,
questions, subagents). Before writing the file, read `${CLAUDE_PLUGIN_ROOT}/references/plan-contract.md`.

`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

**Without a description as argument**: ask what the user wants to explore and wait.

**`mode:return`** (set by `/kaizen:autopilot`): drop the token, run the dialogue normally, and instead
of the final menu return `{ status: complete|blocked, plan_path, open_blockers }`.

## Phase 0 — Resume, classify, size

1. **Resume** — `node "$K" plan list`: does a recent plan on the same topic exist? Offer to resume it
   rather than create a second one.
2. **Routing** — stop and route if the request is:
   - a factual question or a one-step task → answer directly;
   - a bug with a symptom → propose `/kaizen:debug`;
   - "give me ideas" without a chosen idea → propose `/kaizen:ideate`.
3. **Size** (when in doubt, take the heavier one):
   - **Light** — small, bounded, little ambiguity: a few questions, conclusion **in the chat**, no
     file, unless requested or a decision a future reader must find under a stable id.
   - **Standard** — a normal feature: dialogue, approaches, file.
   - **Deep** — multiple actors, contested scope, risk (payment, auth, data): full dialogue, journey
     analysis, rich file.
4. **Coherence** — does the request contain **one** unit of work? If it mixes several ("redo billing
   and add SSO"), propose splitting: handle one area, the others become context in the
   `kaizen:relationships` section.

## Phase 1 — Understand (grounded, one question at a time)

**Anchor first, in parallel and without disturbing the user:**
- read `CLAUDE.md`, `CONCEPTS.md` if it exists, and the area's code (bounded reads);
- `node "$K" learnings search <topic keywords>` → read the learnings that come up;
- `node "$K" packs --json` → note the rules whose `applies_when` matches;
- `node "$K" constitution --json` → the non-negotiable principles frame the possible approaches;
- in Standard/Deep size, launch `kaizen:repo-researcher` (existing patterns) and, if the learnings
  corpus is substantial, `kaizen:learnings-researcher`, in **a single message**.

A contradiction between the request and the verified code, a learning or a pack rule: expose it
**before** going on ("module X already does Y — do we extend it or replace it?").

**Then the dialogue.** Rules:
- **One question per turn**, through `AskUserQuestion`, with your recommendation first.
- Only ask what the environment does not settle (the code, the config, the conversation).
- A decision already made in the conversation is settled: record it, do not ask again.
- High-leverage questions first: who is the user and what is their real problem? What happens if we do
  nothing? What is the smallest useful version? Which edge cases change the behavior? What is
  explicitly out of scope?

**Pressure test** (Standard/Deep): is it the right problem? Is there a simpler version delivering 80 %
of the value? Which blind spot (security, existing data, accessibility, migration, operations) has not
been addressed?

**Journeys**: if the feature has multi-step behavior, launch `kaizen:flow-analyst` on the current
requirements and turn its critical gaps into questions.

Leave the phase when you can state the goal, the requirements, the edge cases and the scope without
inventing anything.

## Phase 2 — Approaches

Outside the Light size, propose **2 or 3 truly different approaches** (not three variants of the same)
with for each: principle, what it optimizes, its cost and risk, and what the learnings or packs say
about it. Recommend one and ask for the choice. Then write a **framing summary** of 5 to 10 lines in the
chat (goal, key requirements, approach, out of scope) and have it validated.

## Phase 3 — Write the plan (requirements only)

1. Does it deserve a file? Only if the dialogue produced decisions, a scope or acceptance criteria a
   future reader must find under stable ids, or if the user asks. Otherwise, conclude in the chat and
   go to phase 4.
2. `node "$K" plan new --type <feat|fix|refactor…> --topic <slug>` reserves the path.
3. Write according to `plan-contract.md`, in the configured language (`config.language`): frontmatter
   (`source: brainstorm`), **Goal capsule**, **Product contract** — and nothing else. Do **not** write
   empty planning or unit sections: `/kaizen:plan` will add them.
   - Requirements `R1…` grouped by concern; examples `AE1…` for every conditional requirement; key
     decisions as a provenance index (`Governs R…`), annotated
     `(decided in session: chosen over <alternative> — <reason>)` when the user decided.
   - Constraints from a pack cited `(pack: <id>, <file>)`, learnings cited by their path.
   - What remains fuzzy but does not block planning: `[NEEDS CLARIFICATION: question — proposed
     default]` in place, rather than an assumption presented as settled.
   - A diagram only if a structure warrants it (multi-step flow, states, data transformation, screen
     mockup) — never instead of the prose.
4. `node "$K" plan check <path>` (requirements stage) then the **"ready for planning" check** from
   `plan-contract.md`. Fix in place what preserves the intent; ask a targeted question for what would
   change the product behavior. Do not declare the file written while a check fails.

## Phase 4 — Follow-up

Ask (one question) what the user wants to do, only showing the relevant options:
1. **Plan** → invoke the `kaizen:plan` skill with the plan path (Recommended).
2. **Chain everything autonomously** → invoke `kaizen:autopilot` with the plan path.
3. **Refine further** → back to phase 1 on the point to dig into.
4. **Stop here** → summarize in 3 lines and give the file path.

Execute the chosen option; showing the menu is not finishing.
