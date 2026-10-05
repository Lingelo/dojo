---
name: decide
description: Makes a hard or irreversible technical decision on evidence — frames the question, explores the code, the learnings, the constitution and external docs, compares 2 to 4 real options (including "do nothing"), gives an argued verdict with its confidence level and the signal that would change its mind, then records it as an ADR (docs/adr/) when it is costly to undo — a decision undone by a revert gets a simple answer, without an ADR. Use when the user asks "should we adopt X?", "A or B?", "do we migrate to…?", "document this decision", /kaizen:decide. Read-only until the ADR.
allowed-tools: Bash(node:*), Bash(git:*), Read, Write, Glob, Grep, Agent, AskUserQuestion, WebSearch, WebFetch
argument-hint: "[question or choice to settle] [adr-only]"
---

# Decide — a grounded verdict, then an ADR

Give a **clear-cut position grounded in the project** on a committing question: adopting a technology,
choosing between approaches, migrating, accepting debt. Then write it down as an **ADR** so the reason
outlives the conversation.

Read `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`. Template: `${CLAUDE_PLUGIN_ROOT}/templates/adr.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

**Never an unearned verdict.** A claim from the conversation is a lead to check, not evidence. If a
piece of information that would change the recommendation is missing and cannot be found: return
**"Blocked — missing context"** (what is missing, why it matters, how to get it).

**`adr-only`**: the decision is already made (in the conversation or a plan) → skip to step 5.

## 1. Frame

- Restate the question as one **decidable** sentence ("Adopt Temporal for billing workflows, or keep
  the Sidekiq jobs?").
- **Reversibility**: easy (a revert), costly (migration, rework), irreversible (published data format,
  external contract, vendor). The more irreversible, the higher the evidence bar. An easily undone
  decision does not deserve an ADR: say so and answer simply.
- Criteria: what matters **here** (constitution, plan constraints, volumes, team skills, cost),
  weighted. Only ask the user if a decisive criterion cannot be found.

## 2. Anchor (parallel)

- **Prior decisions** (mandatory): `node "$K" adr list`, `node "$K" learnings search <topic>`, related
  plans, `CONSTITUTION.md`. A past decision on the same topic is cited and respected, or explicitly
  replaced (`supersedes`).
- **Code**: `kaizen:repo-researcher` on the area (current usage, integration points, cost of a
  change); `kaizen:git-historian` if the area has a history.
- **External** (adoption, migration, comparison): `kaizen:docs-researcher` with precise questions —
  maturity, maintenance (latest releases, activity), license, known limits, compatibility with the
  lockfile's versions, cost. Primary, dated sources.

## 3. Compare

2 to 4 **truly different** options, always including "do nothing / keep what exists". For each: what
it optimizes, adoption cost (rough estimate in days, files touched), risks, reversibility, what the
learnings and the constitution say. A criteria × options table, then prose explaining what the table
does not say.

Before concluding, attack your recommendation: "in a year this decision turned out wrong — why?" If the
story is plausible and not covered, adjust or lower the confidence.

## 4. Verdict

```markdown
**Recommendation: <option>** — confidence <high | medium | low>
Why: <the 2 or 3 decisive reasons, with quoted evidence>
Under which conditions: <what must remain true>
What would change my mind: <observable signal>
Cost / next step: <concrete first step, reversible if possible (spike, flag, pilot)>
```

Interactively, ask for the decision (options + "other"), the recommended one first. The user decides;
their decision stands even if it differs from the recommendation (the ADR records both).

## 5. ADR

`node "$K" adr new --title "<decision>"` reserves `docs/adr/NNNN-<slug>.md`. Fill in the template, in
the configured language: context with evidence, options, decision and decisive reason, consequences
(including accepted debt), **review signal**, `status: accepted` if the user decided (otherwise
`proposed`), `reversibility`, `deciders`. If it replaces an ADR, update the old one (`status:
superseded`, `superseded_by`). Then:
- if a plan is in progress, cite the ADR in its relevant KTD;
- if the decision creates a durable rule for the team ("every new queue goes through…"), propose a
  pack rule or a constitution amendment — without writing it on your own.
