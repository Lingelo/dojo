# The review system

Kaizen reviews twice: the **plan** before code exists ([`/kaizen:doc-review`](../guides/doc-review.md))
and the **code** before it leaves your machine ([`/kaizen:review`](../guides/review.md)). Both use
specialized read-only subagents with a strict return contract, merge their findings, keep only what is
substantiated, and re-verify what would block. This page explains how.

## Code review

![The multi-agent review pipeline: scope, depth, intent and plan, selection, ten reviewers in parallel, normalize, deduplicate, confidence gate, validation of blocking findings, verdict and review record](../media/diagrams/review-pipeline.svg)

### 1. Scope and depth

- **Current branch** (default): diff against `git merge-base HEAD origin/<default>` (or `base:<ref>`),
  **including uncommitted changes**. A PR number or URL reviews that PR (`gh pr view/diff`), taking
  existing review comments into account; it never checks out another branch.
- Lockfiles, generated files, binaries and vendored code are excluded from the reviewed diff and
  mentioned.
- **Depth**:

| Depth | When | Reviewers |
|---|---|---|
| light | ≤ 20 lines, no risk surface, docs/config only | none: Claude reviews with the contract itself |
| targeted | < 100 lines in a single area | 1 to 3 |
| full | otherwise | usually 3 to 7 |

### 2. Intent and plan

A 2-to-3-line intent summary, and the plan: `plan:<path>`, otherwise a plan cited in the branch’s
commits, otherwise a plan whose `topic` matches the branch. Its requirements (R), acceptance examples
(AE), decisions (KTD) and units become the criteria of the **plan conformance** check.

### 3. Selection

By judgment on the actual diff, not by keywords:

| Reviewer | Selected when the diff touches… |
|---|---|
| `correctness` | always (targeted and full) |
| `standards` | a `CONSTITUTION.md`, a standards file (`CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `.claude/rules/`), a matching pack rule, or a relevant learning exists |
| `testing` | tests or their infrastructure, or any behavior change |
| `maintainability` | substantial refactor, new abstractions, file moves, coupling, ≥ 200 executable lines |
| `security` | auth, public endpoints, user input, permission checks (feature flags guarding access included), secrets, crypto, uploads, deserialization, server-side URLs |
| `performance` | query shape, algorithmic complexity, heavy loops, fan-out, caching policy |
| `reliability` | error handling, retries, timeouts, jobs, async handlers, webhooks, external calls |
| `api-contract` | an externally consumed boundary: routes, payload shapes, serializers, event schemas, versioning, a package’s public signature |
| `data-migration` | migrations, schema dumps, backfills, data transformations |
| `adversarial` | ≥ 50 changed lines, or auth/payment, persistent writes, events, retries, concurrency, external APIs, or a check that could wrongly go green (CI, gates, mocks) |

The profile adjusts it: `lean` keeps correctness and standards, plus security on a risk surface; `full`
adds adversarial from targeted depth. For `standards`, Claude gathers the constitution
(`constitution --json`), the matching pack rules (`packs --json`) and the relevant learnings
(`learnings search <diff terms>`). Each kept reviewer is announced with its reason.

### 4. Parallel launch

All reviewers start **in a single message** (real parallelism), each through the `Agent` tool with
`subagent_type: "kaizen:<name>"` and the `model` from `node $K models --json`. Each prompt carries the
[reviewer contract](../../references/review-contract.md) and a `<review-context>` block: reviewer name,
intent, relevant plan excerpts, changed files, the diff (or a `diff.patch` path in the run folder for
diffs over ~1,500 lines), and for `standards` the rules to apply. A run folder
(`node $K run-dir reviews` → `.kaizen/state/reviews/<timestamp>/`) keeps each raw return.

A reviewer that errors or returns non-JSON is **failed**: it appears in the coverage, never silently
dropped. The PostToolUse hook logs every launch as evidence for `review record`.

### 5. The reviewer contract

Each reviewer returns JSON only:

```json
{
  "reviewer": "security",
  "findings": [{
    "title": "Export endpoint skips the store scope check",
    "severity": "P0",
    "file": "app/controllers/exports_controller.rb",
    "line": 12,
    "why_it_matters": "Any logged-in manager can export another store's orders…",
    "evidence": ["app/controllers/exports_controller.rb:12 -- orders = Order.where(id: params[:ids])"],
    "suggested_fix": "scope through current_store.orders",
    "autofix_class": "gated_auto",
    "confidence": 100,
    "requires_verification": true,
    "pre_existing": false
  }],
  "residual_risks": [],
  "testing_gaps": []
}
```

| Field | Values |
|---|---|
| `severity` | **P0** critical, fix before merge (data loss, vulnerability, crash in normal use) · **P1** important (real bug in normal use, broken contract) · **P2** real edge case or trap · **P3** low |
| `confidence` | **100** verifiable from the code alone · **75** verified in the diff and its surroundings, affects normal use · **50** established concern under the action threshold (survives only as P0, or as a gap/risk). Never 0 or 25 |
| `autofix_class` | `gated_auto` (concrete fix, apply after judgment) · `manual` (needs a design decision) · `advisory` |

The **quote-the-line rule**: a finding at 75 or 100 must start its evidence with the verbatim line(s)
that make it true, as `file:line -- <line>`; otherwise it is capped at 50. History-dependent findings
add `provenance: <sha> <author> <date> - <subject>`. Reviewers must drop non-findings: what a linter
catches, intentional code (comments, commits, plan say so), what is handled elsewhere, speculation
without a current signal, general quality without a written rule. Scope: lines the diff changes,
unchanged code the diff newly makes wrong, and pre-existing problems flagged as such. About 40 tool
calls each, read-only.

### 6. Synthesis

Following [`synthesis.md`](../../skills/review/references/synthesis.md):

1. **Normalize** — out-of-enum values fixed or downgraded to 50; findings without evidence rejected;
   unquoted 75/100 lowered to 50.
2. **Deduplicate** — same file, lines within ±3, same failure mode → one finding with the highest
   severity, the best evidence and fix, every reviewer listed. Two independent reviewers agreeing raise
   confidence one anchor (capped at 100). Contradictory findings are both kept and the tension reported.
3. **Confidence gate** — 100/75 actionable; 50 + P0 kept as "unconfirmed"; other 50s move to gaps or
   risks; `pre_existing` go to their own section and never weigh on the verdict.
4. **Validate each P0/P1** (and each `gated_auto` P2 that would be applied) by rereading the quoted
   lines: does the line exist? does the missing guard really exist nowhere? is it intentional?
   → **confirmed**, **refuted** (removed, reason in the coverage) or **unresolved** (kept, "to verify").
   On protected topics — data loss, access control, injection, secrets, crypto, concurrency, public
   contracts — a finding is only refuted on quoted contrary evidence. More than 8 to validate: a
   read-only subagent per batch.
5. **Plan conformance** — each R and AE: covered (file + test), covered differently (reported), not
   covered (P1 if in scope). A KTD bypassed without explanation is a finding.
6. **Rank** — severity, confidence, number of agreeing reviewers; findings are numbered so you can say
   "apply 1, 3 and 4".

### 7. Report, verdict, record

The report: verdict and coverage, findings table (#, severity, confidence, file:line, finding, fix,
reviewer) with the why and quoted line of each P0/P1, constitution table, plan conformance, test gaps,
residual risks, pre-existing, and *to capture* (traps worth a learning or a pack rule).

| Verdict | When | Recorded as |
|---|---|---|
| ⛔ Not ready | a P0 remains, or a confirmed P1 | `blocked` |
| ⚠️ Ready with concerns | non-blocking P1/P2 remain, or coverage is incomplete | `concerns` |
| ✅ Ready | otherwise | `ready` |

`review record` stores the reviewed tree for the [push gate](gates-and-hooks.md#the-review-required-before-git-push-pretooluse).
With `apply`, the `gated_auto` findings are applied from most to least severe, `verify` after each (a
fix that breaks something is reverted), committed as `fix(<JIRA>): review fixes …`, and the review is
recorded again with the post-fix verdict. `manual` findings stay listed with their proposal. In
`mode:agent` (used by work and autopilot) the review returns the merged JSON and never changes the tree.

## Plan review

[`/kaizen:doc-review`](../guides/doc-review.md) applies the same principles to a plan:

1. `plan check` first: its errors are certain findings (confidence 100); mechanical ones are fixed.
2. Reviewers by profile — `lean`: plan check + coherence; `standard`: coherence and feasibility always,
   plus scope (every ready plan, or requirements with > 8 items), security (auth, sessions, exposed
   endpoints, sensitive data, integrations), adversarial (high-stakes areas, new abstractions, plan
   without a brainstorm, widened scope), design (screens, journeys, accessibility); `full`: adversarial
   always.
3. Each receives the [document reviewer contract](../../references/doc-review-contract.md), the plan
   path, the constitution, the pack rules and the **settled decisions** — which they do not re-judge
   unless evidence shows they cannot work. Findings anchor to `R3`, `U2`, `KTD1` or a section and quote
   the plan verbatim (otherwise ≤ 50); `autofix_class` adds `safe_auto` for mechanical corrections.
4. Synthesis as above; a finding re-judging a settled decision without evidence is removed.
5. `safe_auto` and clarifying `gated_auto` fixes are applied **in place**; decisions are put to you one
   question at a time (or returned in `mode:auto`).

Verdict: ⛔ blocked if a P0 remains or `plan check` fails, ⚠️ ready with notes if P1/P2 remain, ✅ ready.
`/kaizen:plan` always runs it on durable plans; a ⛔ blocks what follows.

## The agents

The ten code reviewers, six plan reviewers and five researchers are described in
[Agents and models](agents-and-models.md).
