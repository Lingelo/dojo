---
name: doc-review
description: Reviews a Kaizen plan or requirements before they get built — deterministic check (plan check), then specialized reviewers in parallel (coherence and feasibility always; scope, security, adversarial, design depending on the document), verification of the findings, mechanical fixes applied, decisions put to the author. Called automatically by /kaizen:plan; usable on its own. Use when the user says "review this plan", "challenge this spec", /kaizen:doc-review [path].
allowed-tools: Bash(node:*), Bash(git:*), Read, Edit, Glob, Grep, Agent, AskUserQuestion
argument-hint: "[plan path | empty = latest plan] [mode:auto]"
---

# Doc review — reviewing the plan before building

A defect fixed in a plan costs a sentence; in code, one more PR. Help the author finish a **safe**
document they can execute: find what would change the outcome or really hinder execution, fix what is
mechanical, put the rest to them. An adequate document needs no change.

Read `${CLAUDE_PLUGIN_ROOT}/references/conventions.md` and `${CLAUDE_PLUGIN_ROOT}/references/plan-contract.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

**`mode:auto`** (set by `/kaizen:plan` and `/kaizen:autopilot`): no questions. Apply `safe_auto` and
the `gated_auto` that clarify without changing a decision; return
`{ verdict: ready|ready-with-notes|blocked, applied: [...], decisions_needed: [...], coverage }`.

## 1. Document

Given path, otherwise `node "$K" plan latest`. Check it is readable on disk. Classify it:
**requirements** (no `<!-- kaizen:units -->`) or **ready plan**.

## 2. Deterministic check

`node "$K" plan check <path>`. Its errors are certain findings (confidence 100): fix directly those
that are mechanical (numbering, missing field the plan allows filling in, constitution article missing
from the table when the verdict is obvious); the others become decisions.

## 3. Reviewers

Depending on the **profile** (`node "$K" config` → `profile`): `lean` → `plan check` + coherence only;
`full` → always add `kaizen:plan-adversarial-reviewer`. In `standard` (default): always
`kaizen:plan-coherence-reviewer` and `kaizen:plan-feasibility-reviewer`, plus:

| Reviewer | When |
|---|---|
| `kaizen:plan-scope-reviewer` | every ready plan; requirements with > 8 items, several priorities or "later" items |
| `kaizen:plan-security-reviewer` | auth, sessions, exposed endpoints, sensitive data (personal, payment, tokens), third-party integrations |
| `kaizen:plan-adversarial-reviewer` | high-stakes area (auth, payment, migration, personal data, integrations), new abstraction or architecture pattern, plan without a prior brainstorm (`source: plan`), widened scope, unsettled alternatives |
| `kaizen:plan-design-reviewer` | screens, components, journeys, forms, accessibility |

Announce the team (one line per conditional reviewer and its reason). Read
`${CLAUDE_PLUGIN_ROOT}/references/doc-review-contract.md` and launch **all** the reviewers **in a single
message** (each reviewer's `model` read from `node "$K" models --json`), each with: the contract, the
plan path (to read in full), the constitution (`node "$K" constitution --json`) and the applicable pack
rules, the settled decisions (annotated Key Decisions, "decided in session" KTDs), and its lens.

## 4. Synthesis

- Normalize and deduplicate (same anchor, same problem); two concurring reviewers raise confidence.
- Gate: 75–100 kept; 50 only if P0; `quote` not found verbatim in the plan → rejected.
- **Check yourself** each P0/P1: reread the passage and the quoted code. Refuted → removed (noted in
  the coverage).
- A finding that re-judges a settled decision without evidence it cannot work → removed.

## 5. Apply and decide

- **Apply** the `safe_auto` (references, counts, terminology) and the `gated_auto` that clarify without
  changing a decision — **in place**, in the document's format, without stacking a "corrections"
  section. Rerun `plan check`.
- **Decisions** (`manual`, or `gated_auto` changing the behavior): interactively, one question per
  decision through `AskUserQuestion`, with the quoted passage, the consequence, and your
  recommendation first; apply the answer. In `mode:auto`: leave them in the return.

## 6. Report

In the user's language:

```markdown
## Plan review — <title>
**Verdict: ✅ ready | ⚠️ ready with notes | ⛔ blocked** — <one sentence>
**Team:** coherence, feasibility, security (export endpoint), …
**Applied:** 4 fixes (2 references, 1 term, 1 acceptance example added)
**Decisions made:** …
**Remaining:** <unresolved findings, with anchor>
```

⛔ if a P0 remains or `plan check` still fails; ⚠️ if unresolved P1/P2 remain.
