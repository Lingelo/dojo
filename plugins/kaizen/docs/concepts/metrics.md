# Metrics: what is measured, and how

[`/kaizen:metrics`](../guides/metrics.md) answers "are we really improving?" with the DORA indicators,
Kaizen’s own loop indicator and the cost of its cycles. This page documents **exactly** how each number
is computed by `node $K metrics [--since 90d] [--no-github]` (`scripts/metrics.mjs`), so you know what
to trust. Every indicator carries its method in the output.

These indicators measure a **delivery system**, never people.

## Window

`--since` takes `30d`, `12w` or `6m` (a month counts 30 days); default `90d`. Changes are read on the
default branch (`origin/<branch>` if it exists), first-parent history, up to 1,000 commits.

## Real or approximated

If the window contains `deploy/<env>/…` tags for the metrics environment (`deploy.metrics_env`,
default `production`), the DORA indicators come from **real deployments**. Otherwise they are
**approximations** from the default branch. The output says which (`deployment_frequency_method`,
`lead_time_method`, `change_failure_method`).

## Throughput

| Indicator | With real deployments | Approximation |
|---|---|---|
| Deployment frequency (per week) | deployments in the window / weeks | changes (first-parent commits) on the default branch / weeks |
| Lead time for changes (median, hours) | for each deployment, from every commit since the previous deployment (author date) to the deployment | median *PR opened → merged* from GitHub (`gh pr list --state merged`, up to 300), otherwise *first commit of the merged branch → merge* from git, otherwise unavailable (squash merges without GitHub access) |
| Rework rate | — | share of changes whose subject starts with `fix`, `hotfix`, `revert` (or `Revert "`) |

## Instability

| Indicator | With real deployments | Approximation |
|---|---|---|
| Change failure rate | deployments followed, before the next deployment, by a rollback or an incident | non-fix changes followed within 7 days by a fix or revert touching one of the same files |
| Time to restore (median, hours) | from the incident detection (or the deployment, with a rollback but no incident) to the first rollback or resolve | — (the postmortems’ `detected` → `resolved` appears in the loop section) |

Deployment counters (deployments, rollbacks, incidents in the window) are returned under `deployments`.

## Batch size

Median and 90th percentile of lines changed (additions + deletions) per change — from GitHub PRs when
available, otherwise from the git diffstat of each change — and the share above `pr.max_lines`
(`over_limit_share`). DORA 2025 calls small batches the first lever; this is where AI-sized PRs show.

## Kaizen loop

| Indicator | Computed as |
|---|---|
| `learnings_total`, `learnings_new` | learnings in `docs/learnings/`, and those dated in the window |
| `plans_new` | plans dated in the window |
| `learnings_cited_by_new_plans` | distinct `learnings/….md` paths cited by those plans — **read** |
| `learnings_applied_in_commits` | distinct paths cited in commit messages on the default branch in the window — **applied** |
| `learning_reuse_rate` | (read ∪ applied) / total learnings |
| `learnings_never_cited` (+ a sample of 10) | learnings older than the window cited in no plan, ADR, postmortem or commit message (last 5,000) |
| `constitution_exceptions` | ⚠️ marks in the constitution sections of recent plans |
| `postmortems`, `recovery_hours_median` | postmortems, and median `detected` → `resolved` of those detected in the window |
| `adrs` | ADRs in `docs/adr/` |

A learning written but never cited means the loop does not close: see
[Troubleshooting](../troubleshooting.md#the-learnings-are-not-reused) and
[prune-learnings](../guides/prune-learnings.md).

## Cycle cost

From `.kaizen/state/cycles.jsonl` (written by `gate off` at the end of each work/autopilot cycle on
**this machine**):

| Indicator | Meaning |
|---|---|
| `cycles` | cycles closed in the window |
| `minutes_median` | duration from `gate on` to `gate off` |
| `tokens_median`, `output_tokens_median` | main session + subagents (input, output, cache read and cache creation tokens) |
| `main_tokens_median`, `subagent_tokens_median`, `subagents_median` | the split |
| `subagent_share` | subagent tokens / all tokens, over cycles recorded with subagents |
| `tokens_by_role` | tokens per role of the model policy (`research`, `review`, `review_critical`, `plan_review`, `plan_review_critical`, `implement`, `other`, `unknown`) |
| `gate_blocks_total`, `cycles_with_gate_block_share` | how often the quality gate had to stop a turn |

How subagents are attributed: during a cycle, the PostToolUse hook on the `Agent` tool logs each launch
(type, role, requested model, agent id from the tool response, start of the prompt). At every Stop, the
hook reads the subagent transcripts next to the session transcript and matches each one to its launch
by agent id, otherwise by the start of its first prompt; unmatched transcripts count as `unknown`.

The question it answers: **does the ceremony pay back more than it costs?** Compare cycle cost with
batch size, rework and failure rate before and after changing a practice, a profile or a model.

## Reading honestly

- Reported limits: shallow clones (`--depth`), squash merges without GitHub access, fewer than 10
  changes in the window (no trend).
- `--no-github` skips the `gh` calls (lead time and batch size fall back to git).
- The report keeps to 30 lines: 2 or 3 findings, 1 to 3 actions pointing to a skill
  (`prune-learnings`, slicing, `constitution amend`…). `/kaizen:metrics 12w compare` compares with the
  previous window; on request, a dated report is saved in `docs/metrics/` to follow the trend.
