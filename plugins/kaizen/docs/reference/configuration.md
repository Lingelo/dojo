# Configuration

Kaizen is configured per repository, in two JSON files:

| File | Versioned? | Role |
|---|---|---|
| `.kaizen/config.json` | yes | team settings |
| `.kaizen/config.local.json` | no (git-ignored by `init`) | personal overrides, key by key |

`config.local.json` wins over `config.json`, **except for `docs_root`**: where documents live is a team
decision, only read from `config.json`.

See the effective configuration: `node $K config`. Create the file: `/kaizen:setup` or `node $K init`.
agent-skills has no configuration of its own: its quality bar is `CONSTRAINTS.md` (`/kaizen:constraints`).

## Full example

```json
{
  "docs_root": "docs",
  "language": "auto",
  "verify": {
    "test": "pnpm vitest run",
    "lint": "pnpm eslint .",
    "typecheck": "pnpm tsc --noEmit",
    "audit": "pnpm audit --audit-level high"
  },
  "gate": {
    "enabled": true, "max_blocks": 3, "timeout_seconds": 600, "budget_seconds": 840, "max_age_hours": 24,
    "targeted": { "test": "pnpm vitest related --run {files}", "lint": "pnpm eslint {files}" }
  },
  "review": { "require_before_push": true, "max_unreviewed_lines": 80, "cost_weights": { "opus": 5 } },
  "secrets": { "scan": true, "ignore": ["test/fixtures/**"] },
  "pr": { "max_lines": 400, "ignore": ["*.lock", "pnpm-lock.yaml", "dist/**", "*.snap"] }
}
```

Every key is optional; a missing key takes its default.

## The keys

### `docs_root`

Default: `"docs"`. Root folder of Kaizen's deliverables: `learnings/` and `metrics/` live under it. The
path must be relative, stay inside the repository, and not be `.git`; an invalid value is **refused**,
never silently replaced. Change it if `docs/` is already a published documentation site (`"engineering"`).
agent-skills' files (`SPEC.md`, `tasks/`) do not move with it.

### `language`

Default: `"auto"`, the language of the conversation. Skills are written in English but always talk to
you in your language; `language` sets the language of the **deliverables** Kaizen writes (learnings, PR
replies) — `"en"`, `"fr"` or any other — for the whole team. Frontmatter keys stay in English.

### `verify`

Default: `{}`, i.e. what `node $K detect` finds. The commands the [quality gate](../concepts/gates.md#the-quality-gate)
and `kaizen verify` run, by name: `test`, `lint`, `typecheck`, and `audit` (dependency audit, run only
with `verify --only audit`). Any other name is run too. Set them when detection is wrong; an empty
`verify` with nothing detected leaves the gate nothing to run (`doctor` warns).

### `gate`

The quality gate (Stop hook). It turns itself on when a session edits a code file.

| Key | Default | Role |
|---|---|---|
| `gate.enabled` | `true` | `false` turns the quality gate off for the repository |
| `gate.max_blocks` | `3` | turns blocked in a row before the gate lets the turn end and turns off (Claude must say what is red) |
| `gate.timeout_seconds` | `600` | limit per command; its whole process tree is killed beyond |
| `gate.budget_seconds` | `840` | limit for all the checks of one Stop, under Claude Code's hook timeout |
| `gate.max_age_hours` | `24` | a gate older than this expires |
| `gate.targeted` | `{}` | per check, a command run on the files the branch touches only, `{files}` replaced by them — for slow suites |

### `review`

| Key | Default | Role |
|---|---|---|
| `review.require_before_push` | `true` | `true`: an unreviewed push is stopped once, Claude asks you, and you can push without a review by confirming in Claude Code's prompt (`"ask"`, the 5.x spelling, means the same); `false`: no check |
| `review.max_unreviewed_lines` | `80` | lines changed since the last review beyond which the push needs a new one |
| `review.cost_weights` | `{}` | relative weight of a million tokens per model family for `kaizen cost` and metrics; defaults `haiku` 1, `sonnet` 3, `opus` 5 |

### `secrets`

| Key | Default | Role |
|---|---|---|
| `secrets.scan` | `true` | the secret gate before every `git commit` Claude makes; `false` turns it off |
| `secrets.ignore` | `[]` | path globs never scanned (fixtures with fake keys) |

### `pr`

| Key | Default | Role |
|---|---|---|
| `pr.max_lines` | `400` | batch size threshold reported by `metrics` (`over_limit_share`) |
| `pr.ignore` | lockfiles, `*.min.*`, `*.snap`, `*.generated.*`, `dist/**`, `vendor/**` | files not counted in batch size |

## Removed in 6.0

`profile`, `models`, `risk`, `perf`, `packs`, `tracker`, `deploy`, `monitor`, `approvals` and `review.confirm_above_cost`
are no longer read. `kaizen upgrade` lists the ones left in a repository:
[Migrating to 6.0](../migrating-to-6.md).
