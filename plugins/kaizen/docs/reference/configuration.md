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
  "pr": { "max_lines": 400, "ignore": ["*.lock", "pnpm-lock.yaml", "dist/**", "*.snap"] },
  "models": {
    "enabled": true, "design": "opus", "build": "sonnet", "review": "opus",
    "effort": { "plan": "high", "debug": "high", "build": "medium", "review": "high" }, "escalate_after": 2
  }
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
| `review.require_before_push` | `true` | `true`: an unreviewed push is stopped once, Claude asks you, and you can push without a review by confirming in Claude Code's prompt; `false`: no check |
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

### `models`

Which model each phase of the cycle runs on — advice, never imposed: the session model stays yours
(`claude --model`, `/model`). Why one session per phase, and what to measure before turning it on:
[Models per phase](../concepts/the-loop.md#models-per-phase). The personas' models (`kaizen:code-reviewer`
and `kaizen:security-auditor` on Opus, effort `high`; `kaizen:test-engineer` and
`kaizen:web-performance-auditor` on Sonnet) are in their definitions and do not depend on this key.

| Key | Default | Role |
|---|---|---|
| `models.enabled` | `false` | the switch: `true` turns on the recommendations below and the quality gate's escalation; `false` leaves Kaizen silent about models |
| `models.design` | `"opus"` | model to open `/kaizen:ideate`, `spec`, `plan`, `adr`, `doubt`, `migrate`, `debug`, `constraints` on |
| `models.build` | `"sonnet"` | model to open `/kaizen:build`, `test`, `code-simplify`, `webperf`, `watch`, `learn`, `metrics` on |
| `models.review` | `"opus"` | model to open `/kaizen:review`, `security`, `ship` on |
| `models.effort` | `{ "plan": "high", "debug": "high", "build": "medium", "review": "high" }` | effort level by command name (`plan`, `debug`…) or by phase (`design`, `build`, `review`), the command first; none → the model's default |
| `models.escalate_after` | `2` | from this quality gate block on, the report asks Claude for a subagent on Opus to find the root cause (or `/advisor opus`), and the first one is logged as `escalated` in `friction.jsonl` |

Values are Claude Code model aliases (`opus`, `sonnet`) or full model IDs (`claude-sonnet-5-5`), and
effort levels `low`, `medium`, `high`, `xhigh`, `max`. With `enabled`, `node $K status` (and
`/kaizen:setup`) adds, under the next command, the session to open for it:
`in a fresh session: claude --model sonnet --effort medium`.
