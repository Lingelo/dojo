# postmortem — moved to kaizen-ops

Since Kaizen 4.0, `/kaizen:postmortem` is **`/kaizen-ops:postmortem`**, in the
[kaizen-ops](../../../kaizen-ops/README.md) plugin: see its
[postmortem guide](../../../kaizen-ops/docs/guides/postmortem.md). Enable it with
`"kaizen-ops@dojo": true` in `.claude/settings.json`; `kaizen doctor` reports when a repository that
declares deployments or production signals does not.

The CLI behind it (`node $K monitor incident …`), the gates and the configuration stay in Kaizen
core. `/kaizen:postmortem` only answers where the command went until Kaizen 4.1.0 removes it.
