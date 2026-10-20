# Kaizen Ops Plugin

**Kaizen's production commands, for teams that deploy with Kaizen.**

Kaizen core runs the development loop — plan, work, review, ship — with its gates. kaizen-ops adds
the production part: watched deployments with typed approval and rollback, production signals and
incidents, blameless postmortems. Enable it only if your team deploys through Kaizen; Kaizen core
stays complete without it.

## The commands (3 skills)

| Command | Role |
|---|---|
| `/kaizen-ops:deploy` | Deploys through **your** commands (`deploy.environments`, recognized by `deploy detect`): preconditions, approval you type for production, `deploy/<env>/…` tag, watch of the plan's signals, **rollback** if a threshold is breached. Feature flags (`deploy flag`). |
| `/kaizen-ops:monitor` | Production signals (native HTTP health-check or any command printing a number) against the thresholds of the config and of shipped plans. Threshold breached → dated incident, rollback, then postmortem. Continuous monitoring beyond the deployment: scheduled check (`patrol`) or the team's alerts (`alert`: Alertmanager, PagerDuty, Datadog, plain JSON). |
| `/kaizen-ops:postmortem` | Blameless postmortem: timeline from git, CI and deployment tags, contributing factors, actions with owners. Then learning, pack rule and constitution amendment. |

Guides: [deploy](docs/guides/deploy.md) · [monitor](docs/guides/monitor.md) ·
[postmortem](docs/guides/postmortem.md) — index in [docs/](docs/README.md).

Until Kaizen 4.0 these commands were part of Kaizen itself (stubs answered "moved" in 4.0.x; removed
in 4.1.0):

- `/kaizen:deploy` → `/kaizen-ops:deploy`
- `/kaizen:monitor` → `/kaizen-ops:monitor`
- `/kaizen:postmortem` → `/kaizen-ops:postmortem`

## How it works

kaizen-ops carries **skills and documentation only**. Everything deterministic — the CLI, the hooks
that refuse a direct deploy of a protected environment or a hand-made deployment tag, the typed
approval code, DORA metrics from deployment tags — stays in Kaizen core, so no gate depends on this
plugin being enabled.

Its skills run `${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs`, a resolver that finds Kaizen core and
forwards every call to core's CLI. It looks, in order:

1. `git config kaizen.cli` — a path to core's `scripts/kaizen.mjs`;
2. the `KAIZEN_CLI` environment variable — same;
3. a `kaizen` folder next to this plugin (this repository, `--plugin-dir`);
4. the newest `kaizen` of the dojo marketplace in the Claude Code plugin cache.

An explicit pointer (1 or 2) that is not Kaizen core is refused rather than replaced. A core older than
the version in [`scripts/requires.json`](scripts/requires.json) is refused with both versions and the
fix. The resolver answers two commands itself: `core-root` (where core's references and docs live)
and `--version`.

## Installation

```json
{ "enabledPlugins": { "kaizen@dojo": true, "kaizen-ops@dojo": true } }
```

Kaizen core is required. Prerequisites are core's: Node ≥ 18, git, `gh` for PRs.

## Tests

```bash
node --test plugins/kaizen-ops/tests/*.test.mjs
```

See [CHANGELOG](CHANGELOG.md) and [LICENSE](../kaizen/LICENSE) (MIT, shared with Kaizen).
