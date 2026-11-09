---
title: Kaizen 6 - Ideation
date: 2026-11-09
topic: kaizen-6
artifact: kaizen-ideation/v1
---

# Kaizen 6 - Ideation

Deep revision of Kaizen in the light of Addy Osmani's
[agent-skills](https://github.com/addyosmani/agent-skills). Requested by Angélo LIMA in session on
2026-11-09 ("on peut même revoir en profondeur", then "en vrai on peut aller en profondeur").
Generated inline in one session, not through `/kaizen:ideate`'s parallel agents, and the bases quoted
from the repo were checked by hand, not by a cold verifier.

## Anchoring

**What agent-skills is** (README and [launch article](https://addyosmani.com/blog/agent-skills/)):
24 lifecycle skills and one routing meta-skill (`using-agent-skills`), 9 commands mapped on
Define → Plan → Build → Verify → Review → Ship, 4 personas, 7 reference checklists, a portable core
with thin per-host adapters. Its thesis: agents take the shortest path to "done" and skip the invisible
senior-engineer work, so the skills make that work non-optional *in the text*:

- **Process, not prose** — steps with exit criteria, not essays.
- **Anti-rationalization tables** — "pre-written rebuttals to lies the agent hasn't yet told"
  ("too simple for a spec", "I'll add tests later").
- **Verification** — every skill ends with evidence; "seems right" is not enough; "passing tests are
  evidence, not proof".
- **Scope discipline** — "touch only what you're asked to touch", which the article calls the biggest
  factor in whether an agent's PR can be merged.
- **Progressive disclosure** — a small router loads only the current phase; "every token loaded into
  context degrades performance somewhere".
- Skills it has that Kaizen does not: `doubt-driven-development` (fresh-context adversarial check of
  decisions *during* the build), `source-driven-development` (framework choices cite official docs),
  `constraint-driven-development` (a quality bar with default thresholds and a guard against silenced
  checks), `interview-me`, `deprecation-and-migration`, `observability-and-instrumentation`,
  `definition-of-done` as a standing bar.

**What Kaizen is today** (5.1.0, measured on this branch):

- 20 skills, 22 agents, 32 scripts, 24 test files. Skill descriptions loaded in every session:
  **9,711 characters**. 18 of the 20 skills begin by reading `references/conventions.md`
  (**267 lines**), whatever the task.
- Discipline lives **in code**: Stop hook on red checks (`quality-gate.mjs`), push refused without a
  proven review (`review-gate.mjs`), commit refused on a secret (`secret-gate.mjs`), user-approved
  waivers (`approvals.mjs`), every stop logged to `.kaizen/state/friction.jsonl` — including the
  reason of each waiver request (`review-state.mjs:189`, `requestWaiver(root, { reason })`).
- Discipline is **not in the text**: no skill has a rationalization or red-flag section (grep:
  zero hits for "rationaliz" or "excuse" in `skills/`, `agents/`, `references/`).
- The quality gate trusts what the verify commands report: nothing looks at whether a change added
  `it.skip`, `eslint-disable`, `@ts-ignore`, `# noqa`, lowered a coverage threshold or deleted
  tests (`quality-gate.mjs` only knows "skipped" for a check the time budget cut off, line 89).
- Scope is a written rule (`skills/work/references/implementation-loop.md:53`, "The plan's units
  and scope define what gets built"), not something measured: units declare **Files**, nothing
  compares them to the diff.
- `docs/positioning.md` lists "Claude Code only" and "more concepts to learn" as Kaizen's costs,
  and "a single maintainer" as a limit.

**Where it rubs.** Kaizen is the stronger *guarantee* (what the agent cannot do) and the weaker
*intent* (what the agent should want to do), with a large surface for a newcomer and for the context
window. agent-skills is the reverse: strong intent, no enforcement, light surface, any host.

## Axes

1. **Intent** — what the skills tell the agent, and how.
2. **Guarantees** — what code makes impossible or visible.
3. **Surface and context** — commands, descriptions, what is loaded when.
4. **Reach** — which agents and which humans Kaizen can serve.
5. **Compounding** — how each cycle makes the next one better.

## Ranked ideas

### 1. Rewrite every skill as process: steps, rationalizations, red flags, evidence

*Axis: intent · basis: direct + external · effort M · risk low*

One anatomy for every `SKILL.md`, held by the contract tests: **When / Not for** → **Steps** (each with
an exit criterion) → **Rationalizations** (excuse → rebuttal, 4 to 8 rows, specific to the skill) →
**Red flags** (what the agent notices in itself or the code that means stop) → **Evidence** (what must be
shown before saying done, and which CLI command proves it). Kaizen already has "Done when"; this
completes it. Example rows for `work`:

| Excuse | Rebuttal |
|---|---|
| "This change is too small for a test." | Small changes break the build too. The unit's Evidence field decides, not the size. |
| "The test is flaky, I'll skip it for now." | A skipped test is a removed check. Fix it, or record an exception the user approves. |
| "While I'm here I'll also clean up X." | Not in the unit's Files. Note it for a follow-up; touch only what was asked. |
| "Tests pass, so it works." | Passing tests are evidence, not proof. Run the AE's verification too. |

**Why it matters:** the gates catch the agent *after* it cut the corner. The tables stop many corners
from being cut, which removes friction (fewer refusals, fewer waivers) instead of adding it.
**Basis:** zero rationalization sections in Kaizen today; agent-skills' design principle.
**First step:** write the tables for `work`, `debug`, `review`, `ship` and `plan`; add the anatomy
to the skill contract test, warning only, so the 15 other skills can follow.
**Drawbacks:** about 40 lines more per skill — offset by idea 5.

### 2. Silenced-check guard: a green gate must not be a muted one

*Axis: guarantees · basis: direct + external · effort M · risk medium (false positives)*

A deterministic scan of the diff, in the quality gate (Stop) and in the push gate, for checks that were
switched off instead of satisfied:

- test skips and focus: `it.skip`, `xit`, `describe.only`, `@Disabled`, `@Ignore`,
  `pytest.mark.skip`, `t.Skip(`, `#[ignore]`;
- linter and type silencing: `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `# noqa`,
  `# type: ignore`, `//nolint`, `@SuppressWarnings`, `rubocop:disable`;
- weakened bars: a lowered coverage threshold, a test file deleted, the assertion count of a test file
  going down, `continue-on-error: true` or `|| true` added to CI or to a `verify` command.

A hit is refused like a red check. It is lifted the way Kaizen already lifts things: a unit whose
Evidence is `exception (reason + replacement check)`, or a user-approved waiver through `approvals.mjs`.
Every hit goes to `friction.jsonl`. Pattern list in a module like `secrets.mjs`, extensible in
`.kaizen/config.json` (`guard.silenced.patterns`, `guard.silenced.ignore`).

**Why it matters:** this is the cheapest way for an agent to turn the quality gate green, and today the
gate cannot see it. It is agent-skills' "guard against silenced checks", made into a guarantee.
**Basis:** `quality-gate.mjs` only runs commands and reads exit codes; `secret-gate.mjs` +
`secrets.mjs` are the pattern to copy.
**First step:** `kaizen.mjs guard silenced [--base <ref>]`, report only, run in `review`; make it
block once false positives are measured on Kaizen's own history.

### 3. Evidence ledger: the PR says only what was really run

*Axis: guarantees · basis: direct + reasoned · effort M · risk low*

The PostToolUse Bash hook already sees every command (`quality-gate.mjs --claim`). Record each
verification run — command, exit code, duration, HEAD tree, output hash — in
`.kaizen/state/evidence/<branch>.jsonl`. Each unit's evidence and each AE's proof then points to a
recorded run of the current tree. `ship` writes the PR's "How it was verified" from the ledger, not
from what the agent says it did; an AE claimed without a run is marked "not shown". `review record`
already requires evidence that reviewers ran: this applies the same rule to tests.

**Why it matters:** "verification gates" in agent-skills are a request; here they become a fact the
reviewer can trust, and the stale-evidence case (tests passed on a previous tree) disappears.
**First step:** write the ledger from the existing hook; show it in `kaizen status`.

### 4. Scope drift, measured

*Axis: guarantees · basis: direct + external · effort S · risk low*

When the branch carries a plan, compare the diff's files with the union of the units' **Files**.
Files outside it are listed: by `review` as a finding (P2 by default, P1 if outside the plan *and*
on a risk surface from `risk.mjs`), in the PR description under "Outside the plan", and in `metrics`
as a scope-drift rate per cycle. The fix is never a hand edit: either revert, or `plan amend`
(the user decides), which already exists. Plus the four other conduct rules from the article, written into
`conventions.md` and offered as a constitution starter article: surface assumptions before building,
stop on conflicting requirements, push back when warranted, prefer the boring solution.
Assumptions made during `work` go to the PR description.

**Basis:** units declare Files (`references/plan-contract.md`); nothing compares them to the diff.

### 5. Context budget: route, then disclose

*Axis: surface and context · basis: direct + external · effort M · risk medium*

- Split `conventions.md` (267 lines, read by 18 skills) into a **core** of 60 lines or fewer (loop, CLI,
  language, questions, commits) and topical references read only by the step that needs them (push
  gate, deployment, packs, profiles, subagents).
- A contract test with a **budget**: total description characters, and the lines each skill loads before its
  first step. A change that goes over the budget fails CI.
- `kaizen context` reports what a session actually loaded (from the transcripts the ledger already
  reads).

**Why it matters:** every cycle pays for those 267 lines today, and so does every session for the
9,711 description characters. This was the reason for the kaizen-ops split (4.0) — finish that work.

### 6. Seven lifecycle commands and a router (6.0, breaking)

*Axis: surface and context · basis: external + reasoned · effort L · risk high*

Replace the 20 public commands with the lifecycle, each a thin entry point that loads its modes on
demand:

| Command | Absorbs today's | Modes |
|---|---|---|
| `/kaizen:define` | ideate, brainstorm, constitution | `ideas`, `interview` (one question at a time), `constraints` (quality bar with default thresholds → constitution checks) |
| `/kaizen:plan` | plan, doc-review, decide | `review`, `adr`, `amend` |
| `/kaizen:build` | work, debug, polish, autopilot | `debug`, `polish`, `auto` |
| `/kaizen:review` | review, address-feedback | `feedback` |
| `/kaizen:ship` | ship, watch-pr, release | `watch`, `release` |
| `/kaizen:learn` | learn, prune-learnings, metrics | `prune`, `metrics`, `harvest` |
| `/kaizen` | help, setup | the router: where the repo stands, which phase is next; `setup` |

Old names answer for one major with the new name (as 4.0 → 4.1 did for `deploy`), and a
`lifecycle-commands` migration is registered in `upgrade.mjs` (`since: 6.0.0`, held by
`tests/upgrade.test.mjs`). Agents and the CLI do not change.

**Why it matters:** the "four commands" path (3.10) fixed onboarding on paper; this fixes it in the
command list and the context. **Drawback:** churn for current users, docs and diagrams to rewrite
(diagrams are generated by `docs/media/source/diagrams.mjs`, which helps).

### 7. Three levels of guarantee: written, git, session

*Axis: reach · basis: direct + reasoned · effort L · risk high*

Make explicit what each guarantee needs to be enforced, and bring as many as possible down to the
level that does not depend on Claude Code:

| Level | Enforced by | Works with | Today |
|---|---|---|---|
| **T0 written** | skill text (ideas 1, 4) | any agent reading `SKILL.md` or `AGENTS.md` | partly |
| **T1 git + CI** | `pre-commit`/`pre-push` hooks (`templates/githooks/`), a `kaizen verify-pr` CI step | any agent, any human | secrets, review on push |
| **T2 session** | Claude Code hooks | Claude Code | everything |

Ship the skills as a portable core (an `npx skills add`-compatible layout plus a generated
`AGENTS.md` digest), and move the silenced-check guard, the evidence ledger check and the scope report
to T1 as well. Each guarantee in the docs says its level.

**Why it matters:** removes "Claude Code only", the first cost in `positioning.md`, without weakening
anything: T2 stays the strictest. **Drawback:** a second distribution channel to maintain, with a
single maintainer.

## Combinations

- **Living rationalizations (1 + 2 + 3 + compounding).** agent-skills' tables are static. Kaizen
  already logs the real excuses: waiver reasons in `friction.jsonl`, silenced-check hits, review
  findings on skipped evidence. `/kaizen:learn harvest` turns the ones that come back into rows of the
  repo's own table (`docs/learnings/` type `rationalization`, read by the skill at its Rationalizations
  step). Each refusal makes the next one less likely. This is the core idea of Compound Engineering,
  applied to the agent's own behavior.
- **Doubt at decision time (1 + 3).** During `build`, any `decisions_flagged`, any KTD departure and
  any irreversible step (migration, data write, public API) gets a fresh-context check by
  `adversarial-reviewer`, optionally on another model family (a `doubt` role in `models.mjs`).
  Framework API choices must cite their source (`docs-researcher`); the verdict goes into the evidence
  ledger. This is agent-skills' doubt-driven + source-driven, with traces.
- **Constraints → constitution (1 + 6).** `define constraints` asks for a quality bar with numbered
  defaults (PR size, coverage floor, a11y level, perf budget, allowed silencing) and writes each one as a
  constitution article with a **Check:** — which `plan check`, review and the silenced-check guard
  already enforce.

## Rejected

| Idea | Reason |
|---|---|
| Adopt agent-skills as a dependency and drop Kaizen's skills | replaces the topic; loses the plan contract, gates and learnings |
| Personas instead of 22 role agents | already covered, and more precise (11 code reviewers sharing a contract) |
| Port agent-skills' checklists (security, perf, a11y) as is | duplicate of stronger reviewers and packs; take only the missing rows |
| A `deprecation` skill | too expensive for the value now; a `type: deprecate` plan with expand → migrate → contract units covers it |
| Observability skill | already covered by plan rollout signals + kaizen-ops monitor; kept as one check (signals declared in rollout must exist in the code) under idea 3's review |
| Lower ceremony per profile for the new guards | contradicts the rule that profiles never scale the deterministic gates |
| Count concepts and remove the least used across users | not grounded: usage is only measurable on the maintainer's repos |

## Accepted gaps

- **Concept debt** (approvals `ask`/`code`, push offers, cost estimate, dashboard, deprecated profile
  names): no survivor, because there is no usage data beyond the maintainer's repos. Idea 5's budget
  and idea 6's restructuring are where to cut, with the measured friction and ledger of this
  repository as the evidence.
- **Multi-maintainer**: outside the ideation's scope.

## Proposed order

| Release | Content | Breaking |
|---|---|---|
| 5.2 | idea 1 (5 skills + contract warning), conduct rules of idea 4 | no |
| 5.3 | idea 2 (report, then block), idea 3 | no |
| 5.4 | scope drift (idea 4), doubt at decision time | no |
| 5.5 | idea 5, living rationalizations | no |
| 6.0 | idea 6, idea 7 (T1 guarantees, portable core), concept cuts | yes, with `upgrade` migration |

`docs/positioning.md` gains an agent-skills column with the first release of this series.

## Sources

- [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)
- [Agent Skills, addyosmani.com](https://addyosmani.com/blog/agent-skills/)
- [My LLM coding workflow going into 2026](https://addyosmani.com/blog/ai-coding-workflow/)
