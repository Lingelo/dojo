# Kaizen Ops Plugin

**Kaizen's production commands, for teams that deploy with Kaizen.**

> Not published yet: kaizen-ops is being split out of Kaizen core
> ([plan](../../docs/plans/2026-10-20-1515-refactor-kaizen-core-ops-split-plan.md)). Until Kaizen
> 4.0.0, the production commands live in [Kaizen](../kaizen/README.md) itself.

Kaizen core runs the development loop — plan, work, review, ship — with its gates. kaizen-ops adds
the production part: watched deployments with typed approval and rollback, production signals and
incidents, blameless postmortems. Enable it only if your team deploys through Kaizen; Kaizen core
stays complete without it.

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
