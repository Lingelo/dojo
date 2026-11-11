---
name: metrics
description: Reads the delivery numbers honestly — DORA metrics approximated from git and GitHub (frequency, lead time, rework rate, change failure rate), batch size, whether learnings are read back and applied, how often the gates stopped the work, and what each feature or fix cost in tokens (kaizen cost) — then proposes one to three actions. Use when the user asks "are we improving", "DORA", "how much did this feature cost", "is Kaizen worth it", "metrics", /kaizen:metrics [90d | cost <item>].
allowed-tools: Bash(node:*), Bash(git:*), Bash(gh:*), Read, AskUserQuestion
argument-hint: "[window e.g. 90d] [cost <item>]"
---

# Metrics — are we improving, and at what cost?

## Overview

`node "$K" metrics` computes; this skill reads. Every number comes with its **method**: approximations
from the default branch and GitHub (Kaizen does not deploy), learnings citations, the friction log and
the token ledger kept by the Stop hook. Never invent a number the output does not contain.

Read `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`. `K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

## When to Use

- A periodic look (monthly, end of a quarter) at delivery, quality and the learning loop.
- "What did this feature cost?" — `node "$K" cost <item>` (Jira key, `plan:<topic>`, `branch:<name>`).

## Process

1. **Compute.** `node "$K" metrics --since <window>` (default 90d; `--no-github` without `gh`). To
   compare, also run the previous window of the same length and say it is an approximation.
2. **Read honestly**, each line with its method:

   | Metric | Reading |
   |---|---|
   | Delivery frequency | changes on the default branch per week; higher and regular = small batches |
   | Lead time | PR opened → merged (GitHub), else first commit → merge; long often means review waits |
   | Rework rate | share of fix/revert changes; rising = defects shipped |
   | Change failure rate | changes followed within 7 days by a fix on the same files |
   | Time to restore | not measured: Kaizen records no incident |
   | Batch size | median lines and share above `pr.max_lines` — DORA's first lever |
   | Learnings | cited by a plan (read) or a commit (applied); never cited → `/kaizen:learn prune` |
   | Friction | stops by gate, time stopped on push, share of pushes without a review |
   | Work items | cost per feature or fix, median per kind, share `unattributed` |

   State the visible limits: shallow clone, squash merges without GitHub, fewer than 10 changes.
3. **Act.** One to three actions, each tied to a number ("batch size p90 = 900 lines → split with
   `/kaizen:plan` slices"). Nothing else.

## Common Rationalizations

| Excuse | Reality |
|---|---|
| "The method doesn't matter, the trend does." | An approximation read as a measurement leads to the wrong action. Quote the method. |
| "Ten changes are enough to see a trend." | Below that, say it is not significant. |
| "Skipping the review was fine, we were in a hurry." | A rising skip share is the gate being routed around: name it. |

## Red Flags

- A number not present in the CLI output.
- More than three actions, or actions with no number behind them.
- Code changed by this skill.

## Verification

- [ ] Every number quoted comes from `metrics` or `cost` output, with its method.
- [ ] Limits of the window are stated.
- [ ] At most three actions, each tied to a number.
