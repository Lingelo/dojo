# `/kaizen:monitor`

> Know whether an environment is healthy **according to your signals and thresholds**, and what to do
> otherwise.

## At a glance

| | |
|---|---|
| **What it does** | Measures each declared signal (native HTTP health-check, or any command printing a number), compares it to the threshold of the shipped plan or the config, and proposes the rollback if a threshold is breached |
| **When to use it** | "Is production healthy?", watching a sensitive moment, checking a plan's signals, wiring continuous incident detection |
| **When not to use it** | Right after a deployment: [deploy](deploy.md) already watches |
| **What it produces** | A record per signal (value, threshold, source), kept in `.kaizen/state/monitor.jsonl`; on a breach, a dated incident (`incident/<env>/…` tag) |
| **What next** | Nothing, or `/kaizen:deploy rollback` then [postmortem](postmortem.md) |

## Examples

```text
/kaizen:monitor production
/kaizen:monitor production watch 30
/kaizen:monitor staging plan:docs/plans/2026-10-04-feat-orders-csv-export-plan.md
/kaizen:monitor production incidents
/kaizen:monitor production continuous
```

## Declaring signals

In `.kaizen/config.json`, see [Configuration](../configuration.md#monitor--production-signals):

```json
"monitor": {
  "signals": {
    "health":     { "type": "http", "url": "https://shop.example/health", "expect": 200 },
    "error_rate": { "command": "curl -s 'http://prometheus:9090/api/v1/query?query=…' | jq -r '.data.result[0].value[1]'", "max": 0.01 },
    "p95_ms":     { "command": "./scripts/p95.sh {env}", "max": 800 }
  }
}
```

- `type: "http"`: availability, without any tool.
- `command`: any source (Prometheus, Datadog, CloudWatch, an SQL query, a `grep` on logs). The last word
  of the output must be a number.
- `max` / `min`: thresholds. `{env}` is replaced by the environment.

## Plan thresholds

A plan's "Rollout and rollback" section cites the signal by its name:

```markdown
- **Signal**: `error_rate` > 1 % or `p95_ms` > 1000 → rollback
```

This threshold wins over the config's during the watch of the deployment shipping this plan. A signal
cited by a plan but not declared is reported: it is a monitoring gap.

## Incidents

A breach confirmed by `watch` (after a deployment) or `patrol` (scheduled check), or an alert received
by `monitor alert`, opens an **incident**: an `incident/<env>/<detection>` tag on the deployed commit. A
rollback resolves it; otherwise `monitor incident resolve`. While it is open, a new breach does not
create a second one.

```bash
node "$K" monitor incident list --env production                 # detection, resolution, duration
node "$K" monitor incident open --env production --at 2026-10-04T08:12:00Z --summary "slow payments"
node "$K" monitor incident resolve --env production
```

The dated detection feeds the [postmortem](postmortem.md) timeline and the [metrics](metrics.md) DORA:
an incident before the next deployment counts as a failure, and the time to restore runs from detection
to resolution (or to the rollback).

## Continuous monitoring

[deploy](deploy.md)'s watch lasts `deploy.watch_minutes`. So that an incident happening three days later
is detected without manual action, wire one of the two paths, or both: alerts as the main path, the
periodic check as a safety net.

Both workflows below are generated with `node "$K" audit fix monitor_patrol` and
`audit fix monitor_alert` (`--env production`, `--ref <sha of the Kaizen repository>` to pin it).

### Periodic check: `monitor patrol`

`patrol` measures the signals; a red signal is measured again up to `monitor.consecutive` samples before
opening an incident. Exit 1 on a breach: the scheduler reports it.

- **Claude Code routine**: `/schedule` every 30 minutes with "run `/kaizen:monitor production patrol`;
  on a breach, propose the rollback then `/kaizen:postmortem`".
- **Scheduled CI workflow** (shared tags, no machine left on):

```yaml
# .github/workflows/kaizen-patrol.yml
on:
  schedule: [{ cron: '*/30 * * * *' }]
permissions: { contents: write }          # push the incident tag
jobs:
  patrol:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }           # deploy/… and incident/… tags included
      - run: node path/to/kaizen/scripts/kaizen.mjs monitor patrol --env production
```

### Incoming alert: `monitor alert`

The alerts the team already has (Prometheus Alertmanager, PagerDuty, Datadog…) call an entry point that
passes the payload to `monitor alert`. Recognized formats:

| Tool | Opening | Resolution | Time used |
|---|---|---|---|
| Alertmanager | `status: firing` | `status: resolved` | `startsAt` / `endsAt` |
| PagerDuty (v3 webhooks) | `incident.triggered` | `incident.resolved` | `occurred_at` |
| Datadog (webhook template) | `alert_transition: Triggered` | `Recovered` | `date` |
| Plain JSON | `{"status": "firing", "summary": "…", "at": "…"}` | `"status": "resolved"` | `at` |

Example of a serverless entry point: a `repository_dispatch` workflow that the alerting tool (or a small
relay) calls through the GitHub API.

```yaml
# .github/workflows/kaizen-alert.yml
on:
  repository_dispatch: { types: [alert] }
permissions: { contents: write }
jobs:
  alert:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      # Payload passed through the environment, never interpolated into the script: no injection.
      - env: { PAYLOAD: '${{ toJson(github.event.client_payload) }}' }
        run: printf '%s' "$PAYLOAD" | node path/to/kaizen/scripts/kaizen.mjs monitor alert --env production --file -
```

`--env` wins over the alert's `env`/`environment` label. The detection time is the alert's, not the
reception's.

## The CLI underneath

```bash
node $K monitor check [--env e] [--plan p]                       # one sample (exit 1 if out of threshold)
node $K monitor watch [--env e] [--plan p] [--minutes 15] [--interval 60]
node $K monitor patrol --env e [--interval 60]                   # confirmed check → incident (exit 1)
node $K monitor alert [--env e] [--file f|-]                     # alert payload → incident opened/resolved
node $K monitor incident open|resolve --env e [--at iso] [--summary …] | list [--env e]
```

## Good to know

- A breach only counts after `monitor.consecutive` samples in a row out of threshold (2 by default),
  every `monitor.interval_seconds` (60 by default): an isolated spike triggers nothing.
- A failing command or a non-numeric output counts as red: it is a blind signal.
- Restoring comes before understanding: on a breach, the rollback comes first.

## See also

[deploy](deploy.md) · [plan](plan.md) · [postmortem](postmortem.md)
