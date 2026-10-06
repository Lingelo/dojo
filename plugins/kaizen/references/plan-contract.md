# Unified plan contract (`kaizen-plan/v1`)

One single file per topic, under `<root>/plans/`. `/kaizen:brainstorm` writes its first version
(requirements only); `/kaizen:plan` enriches it **in place** (how to build); `/kaizen:work` executes
it; `/kaizen:review` checks the code against it.

Full reference example: `${CLAUDE_PLUGIN_ROOT}/templates/plan-example.md`.

The path is reserved by `node "$K" plan new --type <type> --topic <slug>`:
`<root>/plans/YYYY-MM-DD-HHMM-<type>-<topic>-plan.md`.

## Frontmatter

```yaml
---
title: Orders CSV export - Plan             # " - Plan" suffix, identical to the H1
type: feat                                  # feat | fix | refactor | perf | docs | chore…
date: 2026-10-02
topic: orders-csv-export                    # slug, resume key
artifact: kaizen-plan/v1
source: brainstorm                          # brainstorm | plan (who wrote the product contract)
jira: SHOP-412                              # optional: originating ticket
origin: docs/ideation/…                     # optional: upstream document
deepened: 2026-10-03                        # optional: deepening date
---
```

No `status` field: progress is inferred from git, never from a mutable field.

## Sections and markers

Each section is preceded by its marker. Titles follow the configured language, markers never do.
`node "$K" plan list` considers a plan "implementation-ready" when `<!-- kaizen:units -->` is present.

| Marker | Section | Written by | Required |
|---|---|---|---|
| `kaizen:goal` | Goal capsule | brainstorm / plan | yes |
| `kaizen:product` | Product contract | brainstorm (or plan without a brainstorm) | yes |
| `kaizen:relationships` | How this work fits together | brainstorm | if the topic was split |
| `kaizen:planning` | Planning contract | plan | yes (ready plan) |
| `kaizen:constitution` | Constitution check | plan | yes if `CONSTITUTION.md` exists |
| `kaizen:threats` | Threats | plan | on a risk surface (auth, sensitive data, payment, external input, third-party integration) |
| `kaizen:rollout` | Rollout and rollback | plan | yes as soon as the change reaches production |
| `kaizen:units` | Implementation units | plan | yes (ready plan) |
| `kaizen:verification` | Verification contract | plan | yes (ready plan) |
| `kaizen:done` | Definition of done | plan | yes (ready plan) |

### Goal capsule (`kaizen:goal`)

- **Goal** — what is true for users or operators *afterwards*, phrased so it stays the goal even with
  another implementation. A reader who has read nothing else must be able to keep it in mind.
- **Means** — only if an approach is imposed ("go through the existing queue").
- **Product authority** — who decided the scope (the user in this session, a ticket…).
- **Open blockers** — or "none".

### Product contract (`kaizen:product`)

Floor: **Summary** (1 to 3 lines, forward-looking) and **Requirements** (`R1.` one sentence of intent
+ at most one qualifier; grouped by concern under bold sub-headings when they cover distinct topics;
continuous numbering).

Depending on the material (omit otherwise): Problem · Key decisions (provenance index: the decision in
bold, one line of reason, `Governs R3, R5`) · Actors · Key journeys · **Acceptance examples**
(`AE1. (covers R2) Given …, when …, then …` — required as soon as a requirement is conditional) ·
Success criteria · Out of scope ("later" / "outside the product's identity") · Dependencies and
assumptions · Open questions ("To resolve before planning" / "Deferred to planning") · Sources.

**Fuzzy areas**: as long as an answer is missing, write it in place
`[NEEDS CLARIFICATION: precise question — proposed default if nobody answers]` rather than guessing
("login" → `[NEEDS CLARIFICATION: email + password, SSO or both?]`). Allowed in a "requirements" plan;
**forbidden** in an implementation-ready plan (`plan check` fails).

A requirement only commits to what the user asked for or chose, and to what it takes for it to work.
A safeguard nobody asked for (audit, alert, option…) goes into Out of scope or Open questions, not into
the requirements.

### Planning contract (`kaizen:planning`)

- **Key technical decisions** — `KTD1. <decision>`: reason, rejected alternative, `covers R…`.
- **Context and patterns to follow** — existing files and patterns to imitate (exact paths).
- **Learnings and rules applied** — each learning from `<root>/learnings/` or pack rule that
  constrains the plan, cited (`docs/learnings/…` or `(pack: id, file)`), with what it changes here.
- Depending on the material: Technical design (diagram if the structure deserves it) · Cross-cutting
  impact · Risks and dependencies · Docs / operations notes.

### Constitution check (`kaizen:constitution`)

If `CONSTITUTION.md` exists (`node "$K" constitution --json`), **every article** is assessed, in a
table, before any unit:

```markdown
| Article | Verdict | Justification / evidence |
|---|---|---|
| I. Evidence first | ✅ | every unit has a test-first evidence strategy |
| IV. Small batches | ⚠️ exception | U3 goes over: 600-line generated migration, cannot be split — reviewed separately |
```

A **NON-NEGOTIABLE** article admits no ⚠️: if the plan cannot respect it, the plan is blocked (capsule:
open blocker) or the constitution must be amended. Not for a **draft** constitution (`status: draft`):
its articles are assessed the same way, but a gap is a warning, never a blocker. Every exception is restated in the PR description.

### Threats (`kaizen:threats`)

Only if the work touches a risk surface. Lightweight **STRIDE** model on new or changed flows: for each
plausible threat (spoofing, tampering, repudiation, information disclosure, denial of service,
elevation of privilege), one line: targeted asset · scenario · countermeasure in the plan (the unit
carrying it) or accepted risk (and by whom). No theoretical threat without a path in this change.

### Rollout and rollback (`kaizen:rollout`)

- **Exposure** — direct, behind a feature flag (name, default, who toggles it), progressive.
- **Order** — migrations as expand → migrate → contract; what must be deployed before what.
- **Rollback** — how to go back (turn the flag off, revert, reverse migration) and what is not
  reversible (data written, emails sent) — say it explicitly.
- **Signal** — what is watched after deploying to know it works (log, metric, error) and the
  **threshold** that triggers the rollback (`> 1 %`, `p95 > 10 s`). Written
  `` `error_rate` > 1 % `` (name declared in `monitor.signals`, between backticks), the threshold is
  applied as is by `monitor watch` after `/kaizen:deploy`. `plan check` reports a missing rollback or
  signal, and a signal without a threshold; `release notes` carries these fields into the production
  checklist.

### Implementation units (`kaizen:units`)

Work packages sized for one commit each, ordered by dependency:

```markdown
### U1. Orders CSV serializer
- **Goal:** …
- **Covers:** R1, R2, AE1
- **Depends on:** —
- **Files:** `app/exports/orders_csv.rb` (new), `spec/exports/orders_csv_spec.rb` (new)
- **Approach:** … (follows `app/exports/customers_csv.rb`)
- **Evidence:** test first | characterization first | exception (reason + replacement check)
- **Test scenarios:** happy path; order without lines; accented characters (BOM, docs/learnings/…)
- **Verification:** `bundle exec rspec spec/exports/orders_csv_spec.rb` green
- **Slice:** S1
```

**Slices**: one slice = **one PR**, under the `pr.max_lines` limit (400 reviewable lines by default).
The DORA 2025 report shows AI makes PRs bigger and turns review into the bottleneck: split the plan
into slices that can be shipped and reviewed separately (each slice leaves the default branch working
— behind a flag if needed). A single-PR plan may omit the field.

### Verification contract (`kaizen:verification`)

The repo's real commands (`node "$K" detect`), targeted checks per unit, manual or browser checks if
there is UI, and what proves each `AE`.

### Definition of done (`kaizen:done`)

Verifiable list: all units shipped, each R covered by evidence, checks green, review passed with no
open P0/P1, learning captured if it passes the durability test.

## "Ready for planning" check (after brainstorm)

1. **Complete** — no TBD or placeholder; every open question is classified; any remaining
   `[NEEDS CLARIFICATION: …]` is in "To resolve before planning".
2. **Consistent** — capsule, requirements, journeys, examples and scope do not contradict each other;
   no rule is written in full in two places.
3. **Focused** — one single coherent unit of work; the rest is context, later or out of scope.
4. **Actionable** — `/kaizen:plan` can decide *how* without inventing product behavior, actors, scope
   or success criteria.

## "Implementation-ready" check (after plan)

First the **deterministic** check: `node "$K" plan check <path>` (frontmatter, sections, continuous
numbering, no `[NEEDS CLARIFICATION`, each R and AE covered by a unit, required unit fields, each
constitution article assessed). It must pass. Then judgment:

1. Each `R` is covered by at least one unit; each `AE` by a test scenario.
2. Each unit has exact files, an evidence strategy and an executable verification.
3. Each `KTD` is justified by evidence (code, learning, doc, pack), not by a preference.
4. Relevant learnings and pack rules are cited, or their absence is a verified finding.
5. No open blocker, or the plan is explicitly marked blocked in the capsule.
6. Slices fit under `pr.max_lines` and each leaves the default branch healthy.
7. The rollback is described, and what is irreversible is said.
