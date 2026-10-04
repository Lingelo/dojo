# `/kaizen:learn`

> Write **one** durable learning in `docs/learnings/`, where the next plan and the next review will read
> it. This is the step that makes the next cycle easier.

## At a glance

| | |
|---|---|
| **What it does** | Applies the durability test, gathers the problem, symptoms, dead ends, solution and prevention, looks for an existing learning to update, classifies with the corpus vocabulary, writes and validates |
| **When to use it** | After **verified** work that produced non-obvious reasoning: an API trap, a surprising cause, a costly dead end, a decision hard to reconstruct |
| **When not to use it** | A routine fix the test and the commit message already explain; a problem not solved yet |
| **What it produces** | `docs/learnings/<category>/<title>.md`, new or updated, validated frontmatter; or "Learning not written: <reason>" |
| **What next** | The learning is read by `learnings-researcher` at every plan, brainstorm, review and debug |

## Examples

```text
/kaizen:learn
/kaizen:learn the UTF-8 BOM for Excel
/kaizen:learn mode:auto                 # no questions (used by work, autopilot, debug)
```

## The durability test

> If this document disappeared, would a future developer reading the final implementation probably
> make the mistake again, or redo the same investigation?

Neither the effort spent nor the size of the diff counts. If the answer is no, nothing is written and
Claude says why. A real example from an eval: for a typo fixed in the README, the answer is "Learning
not written: … the diff and the commit message are enough".

## A learning

Two tracks, depending on `problem_type`:
- **bug**: `runtime_error`, `test_failure`, `security_issue`…, with `symptoms`, `root_cause` and
  `resolution_type` required;
- **knowledge**: `best_practice`, `convention`, `architecture_pattern`, `tooling_decision`…, with
  `applies_when` recommended.

```markdown
---
title: Excel shows broken accents in CSV exports
date: 2026-09-12
category: runtime-errors
module: exports
problem_type: runtime_error
component: service_layer
symptoms:
  - "Accents show up as Ã© when opened in Excel"
root_cause: wrong_api
resolution_type: code_fix
severity: medium
tags: [csv, excel, encoding, bom]
---
# Excel shows broken accents in CSV exports
## Problem · ## Symptoms · ## What didn't work · ## Solution · ## Why it works · ## Prevention
```

The **"What didn't work"** section is often the most valuable. Full schema:
[`references/learnings-schema.md`](../../references/learnings-schema.md). Validation:
`node $K learnings validate`.

## Good to know

- **One learning per run.** Several learnings means several successive runs.
- **Corpus vocabulary first**: `component`, `root_cause` and the folder reuse the values already used in
  `docs/learnings/` (`node $K learnings stats`), so that searches find them.
- An existing learning that became wrong is **updated**, not duplicated.
- A learning that holds for the whole team can become a **pack rule**: Claude proposes it.
- `retire_when`: only if the learning depends on a state outside the repo (upstream bug, tool version).
- Nothing secret or personal in a learning (`<REDACTED>`).

## See also

[prune-learnings](prune-learnings.md) · [Kaizen Packs](../packs.md) · [metrics](metrics.md)
