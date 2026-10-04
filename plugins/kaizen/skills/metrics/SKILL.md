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
| Time to restore | from recorded incidents (`monitor`, detection → resolution) when there are real deployments, otherwise from postmortems (`detected` → `resolved`) |
| Batch size | median and share above `pr.max_lines` — the first lever according to DORA |
| Kaizen loop | new learnings, **read** (cited by a recent plan), **applied** (cited by a commit), never cited, constitution exceptions |
| Cycle cost | `cycle_cost`: closed work/autopilot cycles, median duration and tokens (main session + subagents), subagent share (`subagent_share`), tokens per role (`tokens_by_role`), share of cycles where the gate blocked — local to the machine |

**Learning reuse**: this is Kaizen's own metric. Learnings written but never cited by a plan = the loop
does not close (learnings not findable, badly tagged, or `learnings-researcher` not launched) →
`/kaizen:prune-learnings` (starting with `learnings_never_cited_sample`) and check findability from
`CLAUDE.md`.

**Cost**: weigh it against the gain. Long or expensive cycles with a failure rate that does not drop →
the ceremony does not pay off: propose the `lean` profile. A gate blocking in most cycles → checks too
slow or unstable (`gate.targeted`), or units too big. Read `tokens_by_role` with the model policy
(`node "$K" models`): a role weighing heavily on a strong model is the first savings lever (`lean`
profile or `models.roles`). Say the measurement is local, and that an `unknown` role designates
subagents not matched to their launch.

## 3. Conclude

Short report (≤ 30 lines), in the user's language: table of values, 2 to 3 findings, and **1 to 3
concrete actions** tied to a skill ("62 % of PRs exceed 400 lines → split into slices in /kaizen:plan,
`size` blocking in ship"; "0 learnings cited out of 14 → prune-learnings + tags"). No "good/bad"
judgment without a reference: compare to the previous window when possible.

Offer to save the report in `<root>/metrics/YYYY-MM-DD.md` to follow the trend (frontmatter with
`date`, `since`; no personal data).
