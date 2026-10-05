# Configuration

Kaizen is configured per repo, in two JSON files:

| File | Versioned? | Role |
|---|---|---|
| `.kaizen/config.json` | yes | team settings |
| `.kaizen/config.local.json` | no (added to `.gitignore` by `setup`) | personal overrides, key by key |

`config.local.json` wins over `config.json`, **except for `docs_root`**. Where documents live is a team
decision: it is only read from `config.json`.

See the effective configuration: `node $K config`. Create the file: `/kaizen:setup` or `node $K init`
(`--profile lean|standard|full`, `--language en`, `--docs-root <dir>`).

## Full example

```json
{
  "docs_root": "docs",
  "language": "auto",
  "tracker": "auto",
  "profile": "standard",
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
  "review": { "require_before_push": true, "max_unreviewed_lines": 80 },
  "pr": { "max_lines": 400, "ignore": ["*.lock", "pnpm-lock.yaml", "dist/**", "*.snap"] },
  "secrets": { "scan": true, "ignore": ["test/fixtures/**"] },
  "deploy": {
    "environments": {
      "staging":    { "command": "make deploy ENV=staging", "rollback": "make rollback ENV=staging" },
      "production": { "command": "make deploy ENV=production", "rollback": "make rollback ENV=production", "url": "https://shop.example" }
    },
    "watch_minutes": 15
  },
  "monitor": {
    "signals": {
      "health":     { "type": "http", "url": "https://shop.example/health", "expect": 200 },
      "error_rate": { "command": "curl -s https://prom.example/api/v1/query?query=… | jq -r '.data.result[0].value[1]'", "max": 0.01 }
    }
  },
  "models": { "roles": { "research": "haiku" } },
  "packs": [
    { "source": "kaizen-packs/house-rules" },
    { "source": "https://github.com/acme/kaizen-packs", "ref": "v1.2.0", "pack": ["rails"] }
  ]
}
```

## The keys

### `docs_root`

Default: `"docs"`. Root folder of the documents: `plans/`, `learnings/`, `ideation/`, `adr/`,
`postmortems/` and `metrics/` live under it. The path must be relative, stay inside the repo, and not
be `.git`. An invalid value is **refused**, never silently replaced by `docs`. Change it if `docs/` is
already a published documentation site, for example `"engineering"`.

### `language`

Default: `"auto"`, i.e. the language of the conversation. Kaizen's skills are written in English but
always talk to you in your language. `language` decides the language of the **deliverables** (plans,
learnings, ADRs, postmortems, constitution, PR descriptions and replies): set `"en"`, `"fr"` or any
other language to impose it for the whole team. `<!-- kaizen:… -->` markers, frontmatter keys, ids
(R1, AE1, KTD1, U1, S1) and the field names the tools read (`**Covers:**`, `**Check:**`…) are never
translated. Plans and constitutions written in French before Kaizen 3.0 (`**Couvre :**`,
`**Contrôle :**`, `NON NÉGOCIABLE`…) are still read.

The CLI and the hooks print their messages in English.

### `tracker`

Default: `"auto"`. Kaizen reads the Jira key from the branch name (`feat/SHOP-412-…` gives
`SHOP-412`), like the `git` plugin, and reads GitHub issues through `gh`. The key is used in commit
messages (`feat(SHOP-412): …`) and in the plans' frontmatter.

### `profile`

Default: `"standard"`. Scales the cycle's **ceremony**, never the deterministic gates (`Stop`-hook
quality gate, `verify`, `size`, `plan check`, review required before `git push`).

| Profile | For whom | What changes |
|---|---|---|
| `lean` | first adoption, small team, prototype | short plan (threats and rollout only on a risk surface), `doc-review` reduced to `plan check` + coherence, review at the core + security if needed, `autopilot` without a written plan for a change ≤ ~30 lines with no risk |
| `standard` | most teams | the cycle as described in the guides |
| `full` | regulated domains, seasoned team | threats and rollout always, adversarial reviewer always on the plan and from the targeted review |

The recommended path: start in `lean`, then go up once the team has found its rhythm. An unknown value
falls back to `standard` and is reported by `node $K config` (`profile_warning`). The profile also sets
each agent's model (see [`models`](#models--the-right-model-for-each-task)).

### `verify`

Default: `{}`, i.e. **automatic detection**. These are the commands run by `node $K verify`,
`/kaizen:work` and the quality gate. Your values add to the detection and replace it key by key.

| Key | Role | Run by default? |
|---|---|---|
| `test` | tests | yes |
| `lint` | lint | yes |
| `typecheck` | type checking | yes |
| `audit` | dependency audit (network, slow) | **no**: only `verify --only audit` (done by `work` when dependencies change) |
| other name | any check of yours | yes |

Detected stacks:
- Node (npm, pnpm, yarn, bun; the dummy test script of `npm init` is ignored), TypeScript typecheck;
- Python (pytest, ruff, mypy, through uv or poetry; `pip-audit`);
- Go (`go test`, `go vet`, `govulncheck`), Rust (`cargo test`, `clippy`, `cargo audit`);
- Maven, Gradle;
- Ruby (rspec or rake, rubocop, `bundle-audit`);
- PHP (phpunit);
- `make test`.

See what is detected: `node $K detect`.

> A command that **already** fails on the default branch will make the gate block wrongly.
> `/kaizen:setup` runs it once to check.

### `gate` — the `Stop`-hook quality gate

| Key | Default | Role |
|---|---|---|
| `enabled` | `true` | `false` disables the gate for this repo |
| `max_blocks` | `3` | after N consecutive blocks, lets it finish while requiring the failure to be reported |
| `timeout_seconds` | `600` | maximum time per verification command |
| `targeted` | `{}` | **targeted** commands for the gate, with `{files}` replaced by the files touched by the branch (uncommitted and new files included); they replace the commands with the same name at the end of every turn. No file touched → skipped. The full verification remains the one of `work` and `ship` |
| `budget_seconds` | `840` | total time of the checks at the end of each turn, under the hook timeout (900 s); commands that could not start are reported, not counted as red |
| `max_age_hours` | `24` | a gate active for longer (interrupted session) disables itself |

The gate only acts if it was turned on by `/kaizen:work` or `/kaizen:autopilot` (file
`.kaizen/state/gate.json`). The rest of the time, it costs nothing. It belongs to the **session** that
set it (a `PostToolUse` hook records its id right after `gate on`): another Claude Code session open on
the same repo is not blocked. While it is active, the same hook records the cycle's token usage (main
session and subagents, per role), logged by `gate off` for [`metrics`](guides/metrics.md).

### `review` — the review required before `git push`

| Key | Default | Role |
|---|---|---|
| `require_before_push` | `true` | a `PreToolUse` hook refuses `git push` of a branch until a review has recorded the pushed state |
| `max_unreviewed_lines` | `80` | lines changed since the last review that are tolerated (small CI or feedback fixes); beyond, a new review |

Only active in an initialized repo (`.kaizen/config.json`), never on the default branch (guarded by the
`git` plugin), nor for a branch deletion or a tags-only push. `/kaizen:review` records the tree it read
(`node $K review record`), uncommitted changes included.

**Review evidence.** A `PostToolUse` hook on the `Agent` tool logs every Kaizen code reviewer actually
launched. `review record` requires at least one reviewer launched since the branch's previous review.
Two exceptions: the light review (branch diff ≤ 20 lines, reviewed without subagents) and the update
after fixes (≤ `max_unreviewed_lines` since the reviewed tree).

**Waiver confirmed by the user.** `node $K review waive --reason "hotfix approved by X"` only prints a
code. The waiver only takes effect when **you** type `kaizen waive <code>` in the conversation
(`UserPromptSubmit` hook, 30 minutes, single use); Claude cannot confirm it for you. `ship` restates it
in a "Review waived" section of the PR. State: `node $K review status`; check without pushing:
`node $K review check`.

These state files are only written by the CLI and the hooks: a `PreToolUse` hook refuses direct writes
to them and manual calls to the evidence hooks. It is a protection against forgetfulness and drift, not
against an agent set on bypassing the mechanism.

### `pr`

| Key | Default | Role |
|---|---|---|
| `max_lines` | `400` | limit of changed lines (additions + deletions) for a reviewable PR: `node $K size`, plan slices, `ship` |
| `ignore` | lockfiles, `*.min.*`, `*.snap`, `*.generated.*`, `dist/**`, `vendor/**` | files not counted |

The 400-line value follows Google's practices (a short PR is reviewed fast and hides fewer bugs) and
DORA 2025's finding: AI makes PRs bigger, and review becomes the bottleneck.

### `secrets` — the secret scan before `git commit`

| Key | Default | Role |
|---|---|---|
| `scan` | `true` | a `PreToolUse` hook refuses a `git commit` by Claude that adds a key or token, and `--no-verify` |
| `ignore` | `[]` | path globs never scanned (test fixtures, public keys), on top of lockfiles, minified and vendored files |

Details in [Gates and hooks](concepts/gates-and-hooks.md#the-secret-scan-before-git-commit-pretooluse). Adding
a path to `ignore` is the user's decision: Claude proposes it, it does not do it on its own.

### `deploy` — deployment and rollback

Optional. The commands `/kaizen:deploy` releases with: Kaizen knows no platform and never guesses a
command. `node $K deploy detect` recognizes the common platforms and `node $K deploy configure <id>`
writes the proposed commands here (see [deploy](guides/deploy.md)).

| Key | Default | Role |
|---|---|---|
| `environments.<env>.command` | — | deploys; receives `KAIZEN_ENV`, `KAIZEN_REF`, `KAIZEN_SHA` |
| `environments.<env>.rollback` | — | rolls back (to the previous deployment by default) |
| `environments.<env>.url` | — | the environment's address, shown during the watch |
| `environments.<env>.protected` | `true` for `production` | requires a code **you** type (`kaizen deploy <code>`); the raw command is refused by a hook |
| `environments.<env>.timeout_seconds` | `deploy.timeout_seconds` | timeout for this environment's commands |
| `watch_minutes` | `15` | duration of the signal watch after a deployment |
| `auto_rollback` | `false` | automatic rollback as soon as a threshold is breached |
| `timeout_seconds` | `1800` | maximum time of a deploy, rollback or flag command; beyond it, its whole process tree is killed and the deployment fails, without a tag |
| `push_tags` | `true` | pushes the `deploy/<env>/…`, `rollback/<env>/…`, `incident/<env>/…` and `resolve/<env>/…` tags (source of the real DORA metrics) |
| `flags.on` / `flags.off` | — | feature flag commands, with `{flag}` and `{env}` (`kaizen.mjs deploy flag on|off <name>`) |
| `metrics_env` | `production` | environment whose deployments feed `/kaizen:metrics` |

```json
"deploy": {
  "environments": {
    "staging":    { "command": "make deploy ENV=staging", "rollback": "make rollback ENV=staging" },
    "production": { "command": "make deploy ENV=production", "rollback": "make rollback ENV=production", "url": "https://shop.example" }
  },
  "flags": { "on": "unleash toggle {flag} --env {env} --on", "off": "unleash toggle {flag} --env {env} --off" }
}
```

### `monitor` — production signals

Optional. The signals `/kaizen:monitor` and `/kaizen:deploy` compare to their thresholds.

| Key | Default | Role |
|---|---|---|
| `signals.<name>.type: "http"` + `url`, `expect` | `expect: 200` | native health-check, no tool needed |
| `signals.<name>.command` | — | any command whose last printed word is a number (Prometheus, Datadog, CloudWatch, SQL, logs); `{env}` replaced |
| `signals.<name>.max` / `min` | — | thresholds; replaced by those of the shipped plan (`` `name` > threshold `` in its "Rollout and rollback" section) |
| `signals.<name>.env` | all | restricts the signal to one or more environments |
| `interval_seconds` | `60` | interval between two samples |
| `consecutive` | `2` | samples out of threshold in a row to count a breach |

Incidents (detected by `monitor watch`, `monitor patrol` or an alert received by `monitor alert`) are
recorded as `incident/<env>/…` tags, resolved by a rollback or a `resolve/<env>/…` tag. See
[monitor](guides/monitor.md#continuous-monitoring).

### `models` — the right model for each task

Each agent has a **role**, each role a model (`haiku`, `sonnet`, `opus`, or `inherit` = the session's
one). The defaults depend on the profile:

| Role | Agents | `lean` | `standard` | `full` |
|---|---|---|---|---|
| `research` | repo, learnings, git-historian, docs, flow-analyst | haiku | sonnet | sonnet |
| `review` | correctness, testing, performance, reliability, api-contract, maintainability, standards | sonnet | sonnet | opus |
| `review_critical` | security, data-migration, adversarial | sonnet | opus | opus |
| `plan_review` | plan-coherence, plan-feasibility, plan-scope, plan-design | haiku | sonnet | opus |
| `plan_review_critical` | plan-security, plan-adversarial | sonnet | opus | opus |
| `implement` | `work` subagents (independent units) | sonnet | sonnet | inherit |

Principle: bulk reading rarely costs much when wrong; judgments whose errors are expensive (security,
migrations, plan decisions) get the strongest model.

Adjust per role or per agent:

```json
"models": {
  "roles": { "review_critical": "opus", "research": "haiku" },
  "agents": { "performance-reviewer": "opus" }
}
```

`node $K models` shows the effective policy and reports invalid values (`--agent <name>` prints one
agent's model, `--json` the whole policy). The review records the model actually requested for each
reviewer (`review status`), and `/kaizen:metrics` measures the cycle cost: enough to check that a
cheaper model does not degrade quality.

### `packs`

List of declared Kaizen Packs. See [Kaizen Packs](packs.md).

## State files (not versioned)

`.kaizen/state/` contains a `.gitignore` that ignores it entirely:

| File | Role |
|---|---|
| `gate.json` | gate state (active, plan, session, number of blocks, current cycle usage) |
| `cycles.jsonl` | one `work`/`autopilot` cycle per line, written by `gate off`: plan, duration, blocks, tokens of the main session and of subagents per role (read by `metrics` → `cycle_cost`) |
| `deployments.jsonl` | deployments, rollbacks and flags run from this machine (git tags are authoritative) |
| `deploy-approvals.json` | protected deployment approvals pending or confirmed, 30 min |
| `monitor.jsonl` | signal samples (`monitor check` / `watch` / `patrol`), for postmortem timelines |
| `reviews.json` | last recorded review per branch (reviewed tree, verdict, reviewers, models, waiver) |
| `agent-runs.jsonl` | subagents launched during the current cycle (hook on the `Agent` tool): role, model, id — to break `cycle_cost` down; cleared by `gate off` |
| `review-evidence.json` | code reviewers actually launched (hook on the `Agent` tool), 12 h |
| `waivers.json` | waivers waiting for the user's confirmation, 30 min |
| `pr/<owner>-<repo>-<n>.json` | what `watch-pr` already handled (threads, comments, checks) |
| `reviews/<timestamp>/` | raw reviewer returns of a review (`node $K run-dir reviews`) |
| `rollback-worktree/` | throwaway worktree of a generic rollback, removed afterwards |

Deleting `.kaizen/state/` is harmless: the only effect is forgetting the work in progress.

## Environment variables

| Variable | Role |
|---|---|
| `CLAUDE_PLUGIN_DATA` | the plugin's cache folder (clones of git packs). Provided by Claude Code. |
| `KAIZEN_ENV`, `KAIZEN_REF`, `KAIZEN_SHA` | passed to deploy, rollback and flag commands |
| `KAIZEN_GH` | binary to use instead of `gh` (tests) |
