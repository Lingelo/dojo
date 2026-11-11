# Metrics: what is measured, and how

[`/kaizen:metrics`](../guides/metrics.md) answers "are we really improving?". This page documents
**exactly** how each number is computed by `node $K metrics [--since 90d] [--no-github]`
(`scripts/metrics.mjs`), so you know what to trust. Every indicator carries its method in the output.

These indicators measure a **delivery system**, never people.

## The output

```
window       since, days, from, default_branch
changes      changes on the default branch in the window
throughput   deployment_frequency_per_week, lead_time_hours_median, rework_rate (+ each *_method)
instability  change_failure_rate, time_to_restore_hours_median (+ each *_method)
batch_size   lines_median, lines_p90, over_limit_share, max_lines, source
kaizen_loop  learnings_total, learnings_new, plans_touched, learnings_cited_by_plans,
             learnings_applied_in_commits, learning_reuse_rate, learning_reuse_method,
             learnings_never_cited, learnings_never_cited_sample
friction     events, push, reviews_recorded, quality, secrets, other_refusals, method   (null: no event)
work_items   items, by_kind, top, unattributed_share, method                           (null: no ledger)
```

A section with nothing to read is `null`, an indicator that cannot be computed is `null` with its
`*_method` saying why — never `0`.

## Window

`--since` takes `30d`, `12w` or `6m` (a month counts 30 days); default `90d`. Changes are read on the
default branch (`origin/<branch>` if it exists), first-parent history, up to 1,000 commits.

## Delivery (DORA, approximated)

Kaizen does not deploy: the DORA indicators are **approximations** from the default branch and GitHub.
Each comes with its `*_method`.

| Indicator | Approximation |
|---|---|
| `deployment_frequency_per_week` | changes (first-parent commits) on the default branch / weeks |
| `lead_time_hours_median` | median *PR opened → merged* from GitHub (`gh pr list --state merged`, up to 300), otherwise *first commit of the merged branch → merge* from git, otherwise unavailable (squash merges without GitHub access) |
| `rework_rate` | share of changes whose subject starts with `fix`, `hotfix`, `revert` (or `Revert "`) |
| `change_failure_rate` | non-fix changes followed within 7 days by a fix or revert touching one of the same files |
| `time_to_restore_hours_median` | unavailable: Kaizen records no deployment nor incident |

## Batch size

Median and 90th percentile of lines changed (additions + deletions) per change (`lines_median`,
`lines_p90`) — from GitHub PRs when available, otherwise from the git diffstat (`source`) — and the share
above `pr.max_lines` (`over_limit_share`, the limit itself in `max_lines`).
DORA 2025 calls small batches the first lever; this is where AI-sized PRs show.

## Kaizen loop (`kaizen_loop`)

| Indicator | Computed as |
|---|---|
| `learnings_total`, `learnings_new` | learnings in `docs/learnings/`, and those dated in the window |
| `plans_touched` | plans changed in the window: `SPEC.md`, `docs/SPEC.md`, `tasks/plan.md`, `tasks/todo.md` |
| `learnings_cited_by_plans` | distinct `learnings/….md` paths those plans cite — **read** |
| `learnings_applied_in_commits` | distinct paths cited by commit messages on the default branch in the window — **applied** |
| `learning_reuse_rate` | (read ∪ applied) / total learnings |
| `learnings_never_cited` (+ `learnings_never_cited_sample`, 10 paths) | learnings older than the window cited by no plan nor commit message (last 5,000): candidates for `/kaizen:learn prune` |

A learning written but never cited means the loop does not close:
[Troubleshooting](../troubleshooting.md#the-learnings-are-not-reused).

## Friction (`friction`)

Every time a guard rail stops the work — push stopped, quality gate block, secret refused, state write
refused — the hook appends an event to `.kaizen/state/friction.jsonl`, and so does what lifts it (review
recorded, push confirmed by you). Logging never changes a decision.

| Indicator | Meaning |
|---|---|
| `push.stopped`, `push.by_reason` | pushes stopped for a review (Claude asked you), and why |
| `push.pushed_without_review` | the ones you chose to push without a review, in Claude Code's prompt |
| `push.unblocked_median_minutes`, `push.still_waiting` | first stop on a branch → next review on it; branches still waiting in the window |
| `push.skip_share` | pushes without a review / (reviews + those): a rising share means the review is felt as a tax |
| `reviews_recorded` | reviews Kaizen recorded |
| `quality.blocked`, `quality.released`, `quality.by_check` | turns the quality gate stopped, gates released after `max_blocks`, the checks that block most |
| `secrets.refused`, `secrets.no_verify` | commits refused for a secret, `--no-verify` attempts |
| `other_refusals` | direct writes to Kaizen's review state refused (`state`) |
| `events` | every event of the window, all gates together |

The question it answers: **are the gates catching real problems, or taxing the work?**

## Cost (`work_items`, `kaizen cost`)

A second Stop hook (`ledger-hook.mjs`) charges every turn's new tokens — main session and subagents,
read from the transcripts by byte offset so a turn is never counted twice — to its **work item**, first
match wins:

1. the Jira key of the branch (`feat/PROJ-123-…` → `PROJ-123`);
2. otherwise `branch:<name>`;
3. on the default branch, `unattributed` — never a guess.

Its kind (feature, fix, refactor…) comes from the branch prefix, its title from `SPEC.md`.

Each line of `.kaizen/state/ledger.jsonl` keeps the tokens per model family (`opus`, `sonnet`, `haiku`),
priced in the relative units of `review.cost_weights` (default haiku 1, sonnet 3, opus 5).
`metrics` reports, in `work_items`: the number of `items`, the median cost per kind in `by_kind`
(feature, fix, refactor… from the branch prefix), the five most expensive in `top` (item, kind, title,
cost, tokens, sessions) and the share of tokens nobody could attribute (`unattributed_share`); `node $K cost <item>` gives one item, end to end — spec, plan, build, review, PR
follow-up.

The ledger is **local to the machine**: two developers each see their own share.

## Reading honestly

- Reported limits: shallow clones (`--depth`), squash merges without GitHub access, fewer than 10
  changes in the window (no trend).
- `--no-github` skips the `gh` calls (lead time and batch size fall back to git).
- `/kaizen:metrics` keeps the report to 30 lines: 2 or 3 findings, 1 to 3 actions pointing to a command.
  `/kaizen:metrics 12w compare` compares with the previous window.
