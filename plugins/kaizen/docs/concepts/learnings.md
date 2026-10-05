# Learnings and the compounding effect

A learning is a short document in `docs/learnings/` that carries **durable reasoning** the final code
does not make obvious. It is the mechanism that makes each cycle cheaper than the previous one: the
next brainstorm, plan, review and debug search it, the plan cites it, the commit that applies it says
so, and [`/kaizen:metrics`](../guides/metrics.md) checks the loop really closes. Guides:
[`learn`](../guides/learn.md), [`prune-learnings`](../guides/prune-learnings.md); schema:
[`references/learnings-schema.md`](../../references/learnings-schema.md).

![How learnings compound: verified work passes the durability test, the file is read back by learnings-researcher at brainstorm, plan, review and debug, citations in plans and commits feed metrics, and prune-learnings keeps the corpus true](../media/diagrams/learnings-loop.svg)

## The durability test

> If this document disappeared, would a future developer reading the final implementation probably
> make the mistake again, or redo the same investigation?

Effort spent, diff size or having finished do not count. Typically qualifying: a surprising root
cause, an API or framework trap, what **did not** work and why, an architecture decision costly to
reconstruct, a convention settled after discussion. Not qualifying: a typo, a fix the test and the
commit message fully explain. When the test fails, `/kaizen:learn` writes nothing and says where the
knowledge already lives (`Learning not written: …`).

**One learning per run**; a session that produced several runs `learn` several times. An existing
learning on the same problem is **updated** rather than duplicated; one that became wrong is fixed,
because leaving it would mislead.

## Format

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

| Field | Required | Values |
|---|---|---|
| `title`, `date` (`YYYY-MM-DD`), `module`, `component`, `severity` | always | severity: `critical`, `high`, `medium`, `low` |
| `problem_type` | always | **bug track**: `build_error`, `test_failure`, `runtime_error`, `performance_issue`, `database_issue`, `security_issue`, `ui_bug`, `integration_issue`, `logic_error` · **knowledge track**: `best_practice`, `documentation_gap`, `workflow_issue`, `developer_experience`, `architecture_pattern`, `design_pattern`, `tooling_decision`, `convention` |
| `symptoms` (1–5), `root_cause`, `resolution_type` | bug track | resolution: `code_fix`, `migration`, `config_change`, `test_fix`, `dependency_update`, `environment_setup`, `workflow_improvement`, `documentation_update`, `tooling_addition`, `seed_data_update` |
| `applies_when` (≤ 5 situations) | knowledge track, recommended | — |
| `category`, `tags` (≤ 8), `related_components`, `retire_when` | optional | `retire_when`: the change **outside the repo** that would make it obsolete (upstream bug fixed, tool version) |
| `framework_version` | bug track only | e.g. `rails 7.1.2` |

Default folders follow the type (`runtime-errors/`, `test-failures/`, `best-practices/`,
`tooling-decisions/`…); the file name is the title slug, without a date. Templates:
[`learning-bug.md`](../../templates/learning-bug.md), [`learning-knowledge.md`](../../templates/learning-knowledge.md).

**Corpus vocabulary first**: `component`, `root_cause` and the folder reuse the values the repo already
uses (`node $K learnings stats` counts them by `problem_type`, `component` and `module`); with competing
spellings, the most frequent; the suggested defaults only when nothing covers the area. Searches rely on
that consistency.

**YAML safety**: list items starting with `` ` [ * & ! | > % @ ? `` or containing `": "` are quoted.
Nothing secret or personal goes into a learning (`<REDACTED>`).

## Validation

`node $K learnings validate [files…]` (all learnings by default; exit 1 if any is invalid) checks:
frontmatter readable; required fields present; date format; known `problem_type`, `severity`,
`resolution_type`; bug track has `symptoms` (a list of 1–5), `root_cause`, `resolution_type`;
`applies_when` ≤ 5; `tags` ≤ 8; `framework_version` only on the bug track. `README.md` files and
`_archived/` folders are skipped everywhere.

## Search

`node $K learnings search <words…> [--limit 8] [--json]` is what `learnings-researcher` (and the skills
directly) use. Words are accent-folded, lower-cased and split; words of 2 letters or less are dropped.
Each learning is scored, per word found in a field:

| Field | Weight |
|---|---|
| `title`, `tags` | 4 each |
| `module`, `component`, `related_components` | 3 |
| `applies_when`, `symptoms` | 2 |
| `root_cause`, `problem_type` | 2 |
| body | 1 |

The sum is multiplied by `1 + (distinct words matched / words)`, rewarding learnings that match more of
the query; ties go to the most recent date. Results show the score, path, title, type and module (JSON
adds date, severity and matched words).

## Read back

`learnings-researcher` is launched by [brainstorm](../guides/brainstorm.md), [plan](../guides/plan.md),
[review](../guides/review.md) (for the standards reviewer) and [debug](../guides/debug.md). It searches
the learnings, ADRs, postmortems and the declared [packs](../packs.md), reads the candidates and turns
them into **constraints, traps to avoid and tests to plan**. A plan cites every learning that changes it
in its *Learnings and rules applied* section; a unit that applies one says so in its commit body:

```text
feat(SHOP-412): orders CSV serializer

Unit U1 of plan docs/plans/2026-10-04-0930-feat-orders-csv-export-plan.md. Covers R1, R2, AE1.
Applies docs/learnings/runtime-errors/excel-shows-broken-accents-in-csv-exports.md
```

## Measured

[`/kaizen:metrics`](metrics.md#kaizen-loop) separates:

- **read** — a learning cited by a plan dated in the window;
- **applied** — a learning cited in a commit message that reached the default branch in the window;
- **never cited** — older than the window and cited nowhere (plans, ADRs, postmortems, the last 5,000
  commit messages): a loop that does not close, and a candidate for pruning.

## Pruning

A wrong learning is worse than none, because plan and review apply it. `/kaizen:prune-learnings
[area] [prune]` checks each learning against the current code (paths, symbols, behavior, `retire_when`),
finds duplicates and contradictions, and classifies:

| Outcome | When |
|---|---|
| Keep | accurate and distinct |
| Update | substance holds, details drifted (moved path, renamed symbol, invalid frontmatter) |
| Merge | several say the same thing: keep the best, enriched, delete the others |
| Replace | the substance became wrong but the area deserves a learning: rewritten from the current code |
| Delete | the problem can no longer happen and it teaches nothing |

Replace and Delete ask for approval interactively; in `mode:auto` those learnings are only marked
*Possibly stale* and listed. Unverifiable is not wrong. `prune` also removes accurate learnings whose
reasoning now lives in a test or a comment, citing the file that justifies it. It never touches product
code, skills or `CLAUDE.md` (contradictions are reported), and keeps no `_archived` folder: git history
is the archive. Commit: `docs(<JIRA>): prune learnings in <area>`.

## From a learning to a rule

A learning tells what a past problem taught; a **pack rule** prescribes what work in an area must
follow. When a learning holds for the whole team, `learn` proposes turning it into a rule of a
[Kaizen Pack](../packs.md) (with your approval). A principle that holds for all the work belongs in the
[constitution](constitution.md). Hierarchy: constitution > pack rules > learnings > preferences.
