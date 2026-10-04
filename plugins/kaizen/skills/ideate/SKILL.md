---
name: ideate
description: Generates then critiques ideas grounded in the repo (or a topic) — six angles in parallel (frictions, inversion/automation, broken assumptions, leverage, analogies from other domains, flipped constraints), each idea with a verifiable basis, explicit and motivated rejection, 5 to 7 ranked survivors in docs/ideation/. Use when the user wants ideas, improvement leads or surprising directions before choosing one ("what could we improve", "surprise me", /kaizen:ideate). Not for refining an already chosen idea (/kaizen:brainstorm).
allowed-tools: Bash(node:*), Bash(git:*), Bash(gh:*), Read, Write, Glob, Grep, Agent, AskUserQuestion, WebSearch
argument-hint: "[topic, area or constraint | \"surprise me\"] [top N] [quick | deep]"
---

# Ideate — which ideas are worth exploring?

`/kaizen:ideate` comes **before** `/kaizen:brainstorm`: it answers "which ideas deserve a closer
look?". The brainstorm then says what **one** of them should be, the plan how to build it.

**Done:** a ranked document written under `<root>/ideation/`, every generated idea was critiqued, the
survivors are explained, and the user has the follow-up menu. No requirements, no plan, no code.

Read `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

## Rules

1. **Anchor before imagining.** No advice detached from the repo or the topic.
2. **Generate a lot, critique everything, only explain the survivors.** The whole list is generated
   before any critique. Every rejection has a reason.
3. **Send to the brainstorm to act.** Never straight from idea to plan.
4. **Never start on an unidentified topic**: ask (3 questions max, "Surprise me" is a real option,
   "Cancel" too). Nobody to answer (non-interactive session, or the user said they are not available)
   → "Surprise me", announced in the document. Do not ask solution, audience or criteria questions:
   that is the brainstorm's job.
5. **Announce the cost** (number of agents) before launching.

## Phase 0 — Topic and scale

- Named topic (an area, a flow, a feature) → stay **inside** that scope, at full ambition. Empty topic
  → ask, with "Surprise me" as an option (without anyone to ask: "Surprise me" by default, see rule 4).
- "quick" → 3 to 4 ideas per angle; "deep" → separate angles and more verification; "top N" → N
  survivors (generation does not change).
- Resume: an ideation document less than 30 days old on the same topic exists in `<root>/ideation/` →
  offer to enrich it rather than write a new one.

## Phase 1 — Anchoring (parallel)

- Repo: structure, `README`, `CLAUDE.md`, `CONCEPTS.md`, the area's code; recent plans
  (`node "$K" plan list`); learnings (`node "$K" learnings stats` then `search`) — areas with many
  "bug" learnings are documented frictions; open issues if `gh` is available
  (`gh issue list --limit 50 --json title,labels,comments`), grouped into themes.
- Outside the repo (non-software or external topic): targeted web search, sources cited.
- Write an **anchoring summary** (≤ 30 lines): what exists, where it rubs, what is documented.
- **Axes**: split the topic into 3 to 5 orthogonal axes (e.g. for a checkout: entry, payment,
  confirmation, failure recovery). Skip if the topic is atomic or in "surprise me".

## Phase 2 — Divergent generation

Launch **5 `general-purpose` agents in a single message**, each with the anchoring summary, the axes
and one angle as a **starting bias** (not a constraint):

1. **Frictions** — what is slow, broken, painful for the user or the operator.
2. **Inversion, removal, automation** — invert a painful step, remove it, automate it.
3. **Broken assumptions and reframing** — what is treated as fixed and is only a choice; reframe one
   level up or sideways.
4. **Leverage and compounding** — the choices that make many future moves cheaper.
5. **Analogies and flipped constraints** — how a completely different domain solves a problem with
   the same structure; and what if the budget were ×10 or zero, the team 100 or 1, the users 0 or 1
   million?

Shared instruction to paste into each prompt:

> Generate the smartest ideas your angle can reach: ideas a good team would call "we have to do
> this". Your first ideas will be the obvious ones: treat them as a warm-up and only keep those that
> still deserve their place once the non-obvious ideas are found. An idea that would appear in a
> generic list on this topic: sharpen it with the anchoring or drop it. Spread your ideas across the
> axes. 6 to 8 ideas. For each: **title** · **summary** (2–4 sentences) · **axis** · mandatory
> **basis**, labeled `direct:` (line, file, issue, provided context — quoted), `external:` (named prior
> art, with a source) or `reasoned:` (argument written end to end) · **why it matters** · **meeting
> test** (one line: would it deserve a team discussion?). No basis → no idea. Stay on topic: dropping
> or replacing the project is off limits. Read-only, write no file.

Then: merge and deduplicate; look for 3 to 5 cross-angle **combinations** stronger than their parts;
any axis without an idea → a targeted catch-up agent (2 axes max).

## Phase 3 — Critique

1. **Cold verification** — a `general-purpose` agent that did not see the generation receives the list
   and checks each basis (does the quoted line exist? is the prior art described correctly? does the
   argument hold?). It returns a verdict per idea.
2. **Arbitration** — you make the final cut weighing those verdicts (you may contradict them on
   evidence, saying so). Rejection reasons: too vague · not actionable · duplicate of a stronger one ·
   not grounded · too expensive for the likely value · already covered by what exists · no basis ·
   basis refuted · below the ambition bar · replaces the topic · outside the requested scope.
3. **Ranking** of the survivors (5 to 7 by default): grounding, strength of the basis (`direct` >
   `external` > `reasoned`), expected value, novelty, pragmatism, leverage on future work, cost, and
   spread across the axes.

## Phase 4 — Write

`<root>/ideation/YYYY-MM-DD-<topic>-ideation.md`, in the configured language (`config.language`):

```markdown
---
title: <Topic> - Ideation
date: YYYY-MM-DD
topic: <slug>
artifact: kaizen-ideation/v1
---
# <Topic> - Ideation
## Anchoring          (summary, sources)
## Axes
## Ranked ideas
### 1. <title>        (axis · basis · effort S/M/L · risk)
summary, why it matters, quoted basis, concrete first step, drawbacks
## Combinations
## Rejected           (table: idea — one-line reason)
## Accepted gaps      (axes without a survivor)
```

## Phase 5 — Follow-up

In the chat, **no** copy of the document: 5 to 7 lines (one per survivor, title + why) and the path.
Then one question: **Brainstorm idea no. …** (Recommended, invokes `kaizen:brainstorm` with the idea
and its anchoring) · **Dig into an axis** · **Stop here**.
