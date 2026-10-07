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

The four DORA indicators (deployment frequency, lead time, change failure rate, time to restore), plus
rework rate, batch size, the **Kaizen loop** (learnings read and applied, constitution exceptions, ADRs)
and the **cycle cost** of `work`/`autopilot` runs. How each is computed:
[metrics](../concepts/metrics.md).

## Reading honestly

With [`/kaizen:deploy`](deploy.md), the indicators come from **real** deployments and incidents;
without them, they are **approximations** from the default branch, and each indicator shows its method.
Learnings written but never cited mean the loop does not close: see
[Troubleshooting](../troubleshooting.md#the-learnings-are-not-reused).

## See also

In depth: [metrics](../concepts/metrics.md).


[postmortem](postmortem.md) · [prune-learnings](prune-learnings.md) · [release](release.md) · [deploy](deploy.md)
