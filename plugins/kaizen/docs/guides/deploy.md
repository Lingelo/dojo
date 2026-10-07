# `/kaizen:deploy`

> Release a commit to production through **your** deploy commands, with your approval for production,
> then watch its signals and roll back if a threshold is breached.

## At a glance

| | |
|---|---|
| **What it does** | Preconditions (green CI, checklist of the shipped plans, rollback ready, healthy signals) → approval typed by you for a protected environment → deployment → `deploy/<env>/…` tag → signal watch → rollback if a threshold is breached |
| **When to use it** | Releasing a version or the default branch to staging or production; rolling back |
| **When not to use it** | Opening a PR (→ [ship](ship.md)); preparing a release (→ [release](release.md)) |
| **What it produces** | The deployed commit, a shared git tag, a record of the signals during the watch window; on a problem, a `rollback/<env>/…` tag and the postmortem timeline |
| **What next** | Nothing if all is well; otherwise [postmortem](postmortem.md) |

## Examples

```text
/kaizen:deploy staging
/kaizen:deploy production v2.3.0
/kaizen:deploy rollback production 5xx errors after v2.3.0
/kaizen:deploy flag off export_csv production
```

## Configure

Kaizen imposes no platform: it runs **your** commands, declared per environment in `.kaizen/config.json`
(`command`, `rollback`, `url`, `protected`; `production` is protected by default). To avoid writing them
by hand:

```text
node $K deploy detect              # recognizes how the project deploys: commands, rollback, confidence, notes
node $K deploy configure fly       # writes the chosen candidate (without overwriting an existing environment)
```

Recognized setups and the full configuration: [production](../concepts/production.md#configuration) ·
[Configuration](../configuration.md#deploy--deployment-and-rollback).

![A watched deployment from preconditions to rollback and postmortem](../media/diagrams/deploy-flow.svg)

In depth: [production](../concepts/production.md#deploy).

## How it goes

1. **Preconditions**:
   - merged commit, green CI;
   - what goes out since the last deployment: commits and shipped plans, with their rollback and
     signal. A plan without a rollback or signal blocks a protected deployment;
   - declared rollback;
   - signals already healthy: no deploying on top of an incident.
2. **Approval** (protected environment): Claude shows a code, you type `kaizen deploy <code>` yourself.
   Valid 30 minutes, for this commit only. Claude cannot approve for you, and in autonomous mode there
   is no protected deployment.
3. **Deployment**: the command runs (killed beyond `deploy.timeout_seconds`), then an annotated
   `deploy/<env>/<timestamp>` tag is created on the commit and pushed.
4. **Watch** for `watch_minutes` (see [monitor](monitor.md)): the thresholds come from the shipped plans
   (`` `error_rate` > 1 % `` in their "Rollout and rollback" section) and from the config.
5. **Threshold breached**: rollback first (automatic if `deploy.auto_rollback`), an incident opened and
   resolved by the rollback, a check, then a postmortem proposed.

## Good to know

- Running a protected environment's deploy command directly is **refused** by a hook: it would bypass
  the approval, the tag and the watch.
- `deploy/…`, `rollback/…`, `incident/…` and `resolve/…` tags are only created by Kaizen. They feed the
  **real** DORA metrics of [metrics](metrics.md) (frequency, commit → production lead time, failure
  rate, time to restore) and the postmortem timelines.
- A rollback needs no approval: it restores, and it is urgent.
- `autopilot` never deploys.

## See also

[monitor](monitor.md) · [release](release.md) · [postmortem](postmortem.md) · [metrics](metrics.md)
