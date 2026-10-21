---
name: metrics
description: Measures the health of delivery and of the Kaizen loop — DORA metrics approximated from git and GitHub (delivery frequency, change lead time, rework rate, change failure rate, time to restore), batch size, and the compounding effect (learnings created and reused by plans, constitution exceptions) — then interprets them with 1 to 3 actions. Use when the user asks "where do we stand", "our DORA metrics", "is kaizen any use", a retrospective, /kaizen:metrics [window].
allowed-tools: Bash(node:*), Bash(git:*), Bash(gh:*), Read, Write, Glob
argument-hint: "[window: 30d | 12w | 6m — default 90d] [compare]"
---

# Metrics — are we really improving?

Kaizen promises that each cycle makes the next one easier. This skill **checks** it. DORA 2025: AI
increases throughput **and** instability; only teams that keep small batches and real feedback turn
one into gains without paying the other.

Read `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

## 1. Measure

`node "$K" metrics --since <window>` (add `--no-github` if `gh` is not authenticated). With `compare`,
also run the previous window of the same length — the CLI measures from today, so compute the previous
one by reading two windows (e.g. `--since 180d` and `--since 90d`) and deducing the first half; say it
is an approximation.

## 2. Read honestly

Each metric has its **method** in the output: report it. These are approximations from the default
branch, unless real deployments exist (`deploy/` tags). Report the visible limits: shallow history
(`--depth` clone), squash merges without GitHub access (lead time unavailable), window too short (fewer
than 10 changes → trends not significant).

| Metric | Reading |
|---|---|
| Delivery frequency | higher and regular = small batches integrating fast |
| Change lead time | median PR opened → merged, or first commit → deployment; a long lead time often comes from review (DORA 2025) |
| Rework rate | share of changes that fix; rising = we ship defects |
| Change failure rate | changes followed by a fix within 7 days on the same files, or deployments followed by a rollback or an incident |
| Time to restore | from recorded incidents (`/kaizen-ops:monitor`, detection → resolution) when there are real deployments, otherwise from postmortems (`detected` → `resolved`) |
| Batch size | median and share above `pr.max_lines` — the first lever according to DORA |
| Kaizen loop | new learnings, **read** (cited by a recent plan), **applied** (cited by a commit), never cited, constitution exceptions |
| Work items | `work_items`: what each feature or fix cost end to end (every turn charged to the Jira key, plan or branch), median per kind (`by_kind`), the most expensive (`top`), share of tokens `unattributed` — local to the machine |
| Friction | `friction`: push refusals by reason (`no_review`, `stale`, `blocked_verdict`) and source, median minutes blocked on push (`unblocked_median_minutes`), branches still blocked, waivers and their share of cleared pushes, quality gate blocks per check and releases (`max_blocks` reached), secrets refused — local to the machine |
| Cycle cost | `cycle_cost`: closed work/autopilot cycles, median duration and tokens (main session + subagents), subagent share (`subagent_share`), tokens per role (`tokens_by_role`), share of cycles where the gate blocked — local to the machine |

**Learning reuse**: this is Kaizen's own metric. Learnings written but never cited by a plan = the loop
does not close (learnings not findable, badly tagged, or `learnings-researcher` not launched) →
`/kaizen:prune-learnings` (starting with `learnings_never_cited_sample`) and check findability from
`CLAUDE.md`.

**Work items**: compare the median cost of a feature and of a fix with their outcomes (rework, failure
rate). A fix costing as much as a feature → diagnosis is slow (`/kaizen:debug` with learnings and git
history first) or the bugs are design debt; one item far above the median → read its plan and PR before
concluding. A high `unattributed` share → work done on the default branch without a plan or a Jira-named
branch: name branches after their ticket. `node "$K" cost <item>` details one.

**Friction**: a guard rail is worth what it catches minus what it taxes. Read it with the outcomes
(failure rate, rework): a rising **waiver share** means the review is felt as a tax — find out why
(slow reviews → `review estimate` and the profile; reviewers raising noise → their findings) rather than
loosening the gate. Long `unblocked_median_minutes` → reviews are run late: run `/kaizen:review` before
the push, not after the refusal. Most push refusals `stale` → many changes after the review: review later
in the cycle or raise `review.max_unreviewed_lines` slightly. The same check in most quality gate blocks →
slow or unstable (`gate.targeted`, fix the flake); `released` events → the gate gave up, the work shipped
red. Repeated secret refusals on the same path → a fixture (`secrets.ignore`) or a real habit to fix.
Never propose disabling a gate from these numbers alone.

**Cost**: weigh it against the gain. Long or expensive cycles with a failure rate that does not drop →
the ceremony does not pay off: on a low-stakes repo, propose the `prototype` profile; on a repo in
production, target the costly step instead (`models.roles`, `gate.targeted`). A gate blocking in most cycles → checks too
slow or unstable (`gate.targeted`), or units too big. Read `tokens_by_role` with the model policy
(`node "$K" models`): a role weighing heavily on a strong model is the first savings lever (`prototype`
profile or `models.roles`). Say the measurement is local, and that an `unknown` role designates
subagents not matched to their launch. When cost is the question (or on request), also run
`node "$K" metrics dashboard` and give the path of the page it writes (cost per cycle, by role and by
model, period filter) — it is local, never commit it.

## 3. Conclude

Short report (≤ 30 lines), in the user's language: table of values, 2 to 3 findings, and **1 to 3
concrete actions** tied to a skill ("62 % of PRs exceed 400 lines → split into slices in /kaizen:plan,
`size` blocking in ship"; "0 learnings cited out of 14 → prune-learnings + tags"). No "good/bad"
judgment without a reference: compare to the previous window when possible.

Offer to save the report in `<root>/metrics/YYYY-MM-DD.md` to follow the trend (frontmatter with
`date`, `since`; no personal data).
