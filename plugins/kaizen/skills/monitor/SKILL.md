---
name: monitor
description: Checks or watches the production signals declared by the team (.kaizen/config.json → monitor.signals: native HTTP health-check, or any command printing a number — Prometheus, Datadog, CloudWatch, logs) against the thresholds of the config and the shipped plans, and says what to do if a threshold is breached (rollback, postmortem). Read-only, except a requested or automatic rollback. Records incidents (dated detection, resolution) detected outside the post-deployment window: schedulable check (patrol) or an alert from the team's tool. Use when the user asks "is production healthy?", "watch production for 30 minutes", "check the plan's signals", "set up continuous monitoring", "an alert just fired", /kaizen:monitor [env] [check|watch|patrol|incidents] [minutes].
allowed-tools: Bash(node:*), Bash(git:*), Read, Glob, Grep, AskUserQuestion
argument-hint: "[env] [check | watch [minutes] | patrol | incidents | continuous] [plan:<path>]"
---

# Monitor — production signals, against their thresholds

**Outcome:** the user knows whether the environment is healthy **according to the declared signals and
thresholds**, and, if it is not, what to do now.

Read `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

## 1. What to watch

`node "$K" config` → `monitor.signals`. No declared signal → do not improvise a measurement: explain
how to declare one (`${CLAUDE_PLUGIN_ROOT}/docs/configuration.md`, `monitor` section), propose an HTTP
health-check on the environment's `url` if it exists, and stop.

Thresholds: those of the config, replaced by those of the plans shipped in the environment's last
deployment (rollout section, `` `name` > threshold ``), or of the plan passed as `plan:<path>`. A
signal cited by a plan but not declared (`unknown_plan_signals`) is a monitoring gap: say so.

## 2. Measure

- **`check`** (default): `node "$K" monitor check --env <env>` — one sample of each signal.
- **`watch [minutes]`**: `node "$K" monitor watch --env <env> --minutes <n>` — regular samples
  (`monitor.interval_seconds`), stopping at the first confirmed breach (`monitor.consecutive` samples
  in a row).
- **`patrol`**: `node "$K" monitor patrol --env <env>` — a confirmed check for a scheduled run; a breach
  opens an incident (no duplicate while one is open), exit 1.
- **`incidents`**: `node "$K" monitor incident list --env <env>` — detection, resolution, duration.

Report each signal: value, threshold, threshold source (plan or config), ✅ or ⛔. A failing command or a
non-numeric output is not "green": it is a blind signal, to repair.

## 3. If a threshold is breached

1. Is the last deployment (`node "$K" deploy list --env <env>`) recent and related? Show it.
2. Restoring comes before understanding: propose `/kaizen:deploy rollback <env>` (or the flag to turn
   off that the plan provides). Rollback is the prudent default when nobody can answer (non-interactive
   mode) **or** when `deploy.auto_rollback` is on — either one suffices; otherwise one question.
   Exception: the incident targets a commit (the incident's `sha`) older than the last deployment —
   going back to the previous deployment would not fix it; say so and do not roll back.
3. The breach is an **incident** (`watch` and `patrol` open it; otherwise
   `node "$K" monitor incident open --env <env> --summary "…"`, with `--at` if the real detection is
   earlier). The rollback resolves it; a deployed fix, or a restoration without a deployment, is
   recorded with `node "$K" monitor incident resolve --env <env>`.
4. Then `/kaizen:postmortem`: the timeline (deployment, detection, rollback, resolution) is in
   `deploy list`, `monitor incident list` and `.kaizen/state/monitor.jsonl`.

## 4. Continuous monitoring (`continuous`)

Beyond the post-deployment window, help the team wire one of the two paths, or both (details and
examples: `${CLAUDE_PLUGIN_ROOT}/docs/guides/monitor.md`, "Continuous monitoring"):

- **Periodic check**: `node "$K" monitor patrol --env production` scheduled — Claude Code routine
  (`/schedule`), cron, or a CI `schedule` workflow pushing the tags
  (`git push origin 'refs/tags/incident/*'`). `node "$K" audit fix monitor_patrol` scaffolds it.
- **Incoming alert** (main path if the team already has alerts): Alertmanager, PagerDuty or Datadog
  call an entry point — for example a GitHub `repository_dispatch` workflow — which runs
  `node "$K" monitor alert --env production --file <payload>`; the detection time is the alert's, its
  resolution closes the incident. `node "$K" audit fix monitor_alert` scaffolds it.

Create no workflow or routine file without the user's approval.

## Report

In the user's language:

```
MONITOR — <env> · <date> · <check | watch n min>
✅ health 200 · ✅ error_rate 0.002 (≤ 0.01, plan) · ⛔ p95_ms 1240 (> 800, config)
Incident: <none | open since <time> (source) | resolved>
Next: <nothing | rollback proposed | declare a missing signal | wire continuous monitoring>
```
