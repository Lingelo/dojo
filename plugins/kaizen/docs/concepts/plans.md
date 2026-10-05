# Plans (`kaizen-plan/v1`)

A plan is **one Markdown file per topic** that grows through the loop: `/kaizen:brainstorm` writes
*what* to build, `/kaizen:plan` adds *how* in the same file, `/kaizen:work` executes it, `/kaizen:review`
checks the code against it, `/kaizen:ship` turns it into a PR description, `/kaizen:release` and
`/kaizen:deploy` read its rollout section. The full example lives in
[`templates/plan-example.md`](../../templates/plan-example.md); the contract Claude follows is
[`references/plan-contract.md`](../../references/plan-contract.md).

![Anatomy of a plan: frontmatter, sections written by brainstorm and added by plan, traceability from requirements and acceptance examples to units, slices and PRs, and the plan check gate](../media/diagrams/plan-anatomy.svg)

## File and name

`node $K plan new --type feat --topic orders-csv-export` reserves the path atomically (it fails rather
than overwrite):

```text
docs/plans/2026-10-04-0930-feat-orders-csv-export-plan.md
```

The date and time come first so plans sort chronologically; a second plan created the same minute gets
`-plan-2.md`. `node $K plan list` shows each plan with its stage (`requirements` or
`implementation-ready`, decided by the presence of `<!-- kaizen:units -->`), `node $K plan latest`
prints the most recently modified one.

## Frontmatter

```yaml
---
title: Orders CSV export - Plan       # " - Plan" suffix, identical to the H1
type: feat                            # feat | fix | refactor | perf | docs | chore…
date: 2026-10-02
topic: orders-csv-export              # slug, resume key
artifact: kaizen-plan/v1
source: brainstorm                    # brainstorm | plan (who wrote the product contract)
jira: SHOP-412                        # optional
origin: docs/ideation/…               # optional upstream document
deepened: 2026-10-03                  # optional, set by "plan deepen"
---
```

There is **no `status` field** and `plan check` rejects one: whether a plan is done is read from git
(its units’ commits), never from a field someone forgets to update.

## Sections and markers

Each section starts with an HTML comment marker. Titles are written in the configured language;
markers never change, because tools find sections by them.

| Marker | Section | Written by | Required |
|---|---|---|---|
| `<!-- kaizen:goal -->` | Goal capsule: goal, means (if imposed), product authority, open blockers | brainstorm / plan | always |
| `<!-- kaizen:product -->` | Product contract: summary, requirements `R1…`, acceptance examples `AE1…`, key decisions, actors, journeys, scope, open questions | brainstorm (or plan without one) | always |
| `<!-- kaizen:relationships -->` | How this work fits with the parts split out of it | brainstorm | if the topic was split |
| `<!-- kaizen:planning -->` | Key technical decisions `KTD1…`, patterns to follow (exact paths), learnings and pack rules applied | plan | ready plan |
| `<!-- kaizen:constitution -->` | Table: article · verdict (✅ / ⚠️ exception) · justification | plan | if `CONSTITUTION.md` exists |
| `<!-- kaizen:threats -->` | Lightweight STRIDE on new or changed flows | plan | on a risk surface (`full`: always) |
| `<!-- kaizen:rollout -->` | **Exposure**, **Order**, **Rollback**, **Signal** with threshold | plan | as soon as it reaches production |
| `<!-- kaizen:units -->` | Implementation units `U1…` | plan | ready plan |
| `<!-- kaizen:verification -->` | Real commands, targeted checks, what proves each AE | plan | ready plan |
| `<!-- kaizen:done -->` | Verifiable definition of done | plan | ready plan |

### Requirements and acceptance examples

```markdown
- R1. A store manager can export the orders of the current filter as CSV.
- R2. The file opens in Excel with accented characters intact.
- AE1. (covers R2) Given the customer "Hélène Müller", when I export, then the file starts with a
  UTF-8 BOM and contains "Hélène Müller".
```

One sentence of intent per requirement, at most one qualifier. An acceptance example is required as
soon as a requirement is conditional. Numbering is continuous and never reused; a rule is written in
full only once, on its id, and cited elsewhere ("per R4").

A requirement only commits to what you asked for or chose, and to what it takes for it to work. A
safeguard nobody asked for goes to *Out of scope* or *Open questions*.

**Unclear points** are written in place instead of guessed:

```markdown
[NEEDS CLARIFICATION: email + password, SSO or both? — default: email + password]
```

They are allowed in a requirements-stage plan and forbidden in an implementation-ready one.

### Key technical decisions

`KTD1. <decision>` with its reason, the rejected alternative and `covers R…`. A decision made by you in
the session is carried over with the annotation `(decided in session: chosen over <alternative> —
<reason>)`; plan reviewers do not re-judge it unless evidence shows it cannot work. Heavy or
irreversible choices (data format, vendor, public interface) deserve [`/kaizen:decide`](../guides/decide.md)
and an ADR rather than one line.

### Units

```markdown
### U1. Orders CSV serializer
- **Goal:** …
- **Covers:** R1, R2, AE1
- **Depends on:** —
- **Files:** `app/exports/orders_csv.rb` (new), `spec/exports/orders_csv_spec.rb` (new)
- **Approach:** … (follows `app/exports/customers_csv.rb`)
- **Evidence:** test first
- **Test scenarios:** happy path; order without lines; accented characters (BOM, docs/learnings/…)
- **Verification:** `bundle exec rspec spec/exports/orders_csv_spec.rb` green
- **Slice:** S1
```

One unit ≈ one commit, ordered by dependency. **Evidence** is one of *test first*, *characterization
first* (existing code without tests) or *exception* (rename, pure config, generated files) with its
reason and replacement check.

### Slices

`**Slice:** S1` groups units into **one PR** each, under `pr.max_lines` (400 changed lines by
default, lockfiles and generated files excluded). DORA 2025 shows AI makes PRs bigger and makes review
the bottleneck; slices keep each PR reviewable, and each slice must leave the default branch healthy
(behind a flag if needed). A single-PR plan may omit the field.

### Rollout and rollback

```markdown
<!-- kaizen:rollout -->
- **Exposure**: behind the `orders_csv_export` flag, off by default, toggled by the product owner
- **Order**: migration (expand) → code → backfill → flag on → contract migration next release
- **Rollback**: flag off; the migration is additive and stays. Emails already sent cannot be recalled.
- **Signal**: `error_rate` > 1 % or `p95_ms` > 1000 for 10 min → rollback
```

The signal names refer to `monitor.signals` in the configuration. `monitor watch` applies these
thresholds as they are after `/kaizen:deploy` (they override the configured ones for that deployment),
and `release notes` copies the section into the production checklist. Recognized threshold forms:
`` `name` `` followed by `>`, `>=`, `<`, `<=`, `≥` or `≤` and a number, optionally a percentage
(`1 %` = 0.01).

## Stages and checks

| Stage | Detected when | Checked by |
|---|---|---|
| `requirements` | no `<!-- kaizen:units -->` | `plan check` (structure) + the "ready for planning" check: complete, consistent, focused, actionable |
| `implementation-ready` | `<!-- kaizen:units -->` present | `plan check` (traceability) + the "implementation-ready" check + `/kaizen:doc-review` |

### Everything `plan check` verifies

`node $K plan check <path> [--json]` exits 1 on any error. Errors:

| Error | Why |
|---|---|
| `frontmatter: <key> missing` (title, type, date, topic, artifact) | the plan cannot be resumed or listed |
| `unexpected artifact` (≠ `kaizen-plan/v1`) | another format |
| `status field forbidden` | progress is read from git |
| `section kaizen:goal / kaizen:product missing` | no contract to build against |
| `no requirement R1…` · non-continuous numbering · duplicate R | traceability needs stable ids |
| `[NEEDS CLARIFICATION: …] marker(s) left` (ready plan) | unresolved product questions |
| `placeholder left (TBD, TODO or {{…}})` | unfinished text |
| `section kaizen:planning / units / verification / done missing` (ready plan) | incomplete plan |
| `no unit U1…` · non-continuous unit numbering | — |
| `U<n>: field **Covers / Files / Evidence / Verification:** missing` | every unit must be traceable and verifiable |
| `R<n> is not covered by any unit` · `AE<n> … (no test scenario)` | something promised would not be built or proven |
| `R<n> / AE<n> cited by a unit but not defined` | broken reference |
| `section kaizen:constitution missing (CONSTITUTION.md exists)` · `article <id> not assessed` | every principle must be looked at |

Warnings (exit 0): title without the ` - Plan` suffix; `[NEEDS CLARIFICATION]` left in a requirements
plan; `kaizen:rollout` missing, or without **Rollback**, without **Signal**, or with a signal that has
no threshold; some units with a **Slice** and others without; a constitutional exception without a
visible justification.

The output summarizes the stage and the counts:
`✔ docs/plans/…-plan.md — implementation-ready · 5 R · 3 AE · 3 U · 2 slice(s)`.

## How each skill uses the plan

| Skill | Reads | Writes |
|---|---|---|
| brainstorm | learnings, packs, constitution, code | frontmatter, goal, product, relationships |
| plan | the requirements, research agents’ returns, `detect`, constitution, packs | planning, constitution, threats, rollout, units, verification, done; `deepened` |
| doc-review | the whole plan, cited code, constitution, packs | mechanical fixes in place |
| work | units, cited files, learnings and pack rules, constitution | code and commits (`Unit U3 of plan <path>. Covers R2, AE1.`) |
| review | R, AE, KTD, units | plan conformance table, findings |
| ship | goal, R, rollout, constitution exceptions | PR description and reviewer guide |
| release | rollout of the plans shipped since the last tag | production checklist |
| deploy / monitor | rollout signals and thresholds of the shipped plans | — |
| metrics | learnings cited by recent plans, constitution exceptions | — |
