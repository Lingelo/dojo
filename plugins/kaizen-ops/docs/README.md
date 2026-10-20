# Kaizen Ops documentation

The guides of kaizen-ops' commands. Everything they rely on — the CLI, the configuration, the
production concepts, the gates — is documented with [Kaizen core](../../kaizen/docs/README.md).

## The guides

- [deploy](guides/deploy.md) — release to production, watch, roll back
- [monitor](guides/monitor.md) — production signals against their thresholds, incidents
- [postmortem](guides/postmortem.md) — learn from an incident

## In Kaizen core

- [Production](../../kaizen/docs/concepts/production.md) — release notes and SemVer, deployment and
  approval, platform detection, signals, watch/patrol/alert, incidents, postmortems
- [Configuration](../../kaizen/docs/configuration.md) — `deploy` and `monitor` keys
- [CLI](../../kaizen/docs/reference/cli.md) — `deploy`, `monitor` and `postmortem` subcommands
