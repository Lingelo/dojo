# `/kaizen:metrics`

> Are we really improving? The DORA metrics, approximated from git and GitHub (or measured from real
> deployments), plus Kaizen's own indicator: are the learnings reused?

## At a glance

| | |
|---|---|
| **What it does** | Computes the indicators over a window, says how each one is computed and its limits, draws 2 or 3 findings and 1 to 3 actions |
| **When to use it** | Retrospective, quarterly review, "is Kaizen useful at all?", after changing a practice |
| **When not to use it** | To judge people: these indicators measure a delivery system, not individuals |
| **What it produces** | A short report (30 lines at most), and on request `docs/metrics/YYYY-MM-DD.md` to follow the trend |
| **What next** | The actions point to a skill: `prune-learnings`, slicing, `constitution amend`… |

## Examples

```text
/kaizen:metrics                # last 90 days
/kaizen:metrics 30d
/kaizen:metrics 12w compare    # with the previous window
```

Raw: `node $K metrics --since 90d` (add `--no-github` if `gh` is not authenticated, `--json` for the
machine-readable output).

## The indicators

| Indicator | Method (approximation) | Reading |
|---|---|---|
| Deployment frequency | changes landed on the default branch, per week (real deployments when tagged) | higher and steady = small batches integrating fast |
| Lead time for changes | median PR open → merge (GitHub), otherwise first commit → merge (git); first commit → production with real deployments | a long lead time often comes from review |
| Rework rate | share of fix, hotfix or revert changes | rising = we ship defects |
| Change failure rate | changes followed, within 7 days, by a fix or a revert on the same files (deployment followed by a rollback or an incident with real deployments) | instability |
| Time to restore | median detection → resolution of tracked incidents (otherwise `detected` → `resolved` of postmortems) | ability to recover |
| Batch size | median, 90th percentile, share above `pr.max_lines` | **the first lever** according to DORA |
| **Kaizen loop** | total and new learnings, **read** (cited by a recent plan), **applied** (cited by a commit message), never cited, constitution exceptions, ADRs | the compounding effect |
| **Cycle cost** | `work`/`autopilot` cycles closed by `gate off`: duration, tokens of the main session and subagents, broken down by role, gate blocks (local to the machine) | does the ceremony pay back more than it costs? |

## Reading honestly

- With [`/kaizen:deploy`](deploy.md), the indicators come from **real** production deployments
  (`deploy/…`, `rollback/…` tags and the `incident/…`, `resolve/…` incidents of [monitor](monitor.md)):
  frequency, first commit → production lead time, failure rate (deployment followed by a rollback or an
  incident), time to restore (detection → resolution). Without tracked deployments, they are
  **approximations** from the default branch. Each indicator shows its method.
- Reported limits:
  - shallow clone (`--depth`);
  - squash merges without GitHub access (lead time unavailable);
  - fewer than 10 changes in the window: no trend.
- **Learnings written but never cited**: the loop does not close. See
  [Troubleshooting](../troubleshooting.md#the-learnings-are-not-reused).

## See also

[postmortem](postmortem.md) · [prune-learnings](prune-learnings.md) · [release](release.md) · [deploy](deploy.md)
