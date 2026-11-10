# CLI reference (`scripts/kaizen.mjs`)

Every deterministic operation of Kaizen goes through one zero-dependency Node script (Node ≥ 18). The
skills and hooks call it; you can call it too:

```bash
K=plugins/kaizen/scripts/kaizen.mjs        # or the installed plugin's path
node $K                                    # one-line summary of every command
```

Conventions:

- It must run inside a git repository; otherwise it stops with `kaizen: no git repository here`.
- Flags are `--name value` or boolean `--name`. Paths are printed POSIX-style on every OS.
- Output: human-readable text, or JSON for commands that return data (most accept `--json`).
- **Exit codes**: `0` success · `1` a check is red (verify, secrets scan, learnings validate,
  review check, doctor `--strict`) · `2` usage error or exception (message on
  stderr, `kaizen: …`).

## Orientation

### `status [--json]`

Where the repository stands and what to run next — the backend of [`/kaizen:setup`](../guides/setup.md).
Reports branch, commits ahead of the base, uncommitted files, initialization, agent-skills' files
(`SPEC.md`, `tasks/plan.md`, tasks done and left in `tasks/todo.md`, `CONSTRAINTS.md`), number of
learnings, gate state, review state and push decision, and the ordered `next` list
([decision order](../concepts/the-loop.md#knowing-where-you-are)).

### `doctor [--in-skill] [--json] [--strict]`

Are the guard rails on? One line per check with the command that fixes it:
[Doctor](../concepts/gates.md#doctor). `--in-skill` (passed by `/kaizen:setup`) reports missing hooks as
"off" rather than "not verified". Exit 0, or 1 with `--strict` when anything needs attention.

### `upgrade [--apply] [--json]`

The migrations this repository still needs after a Kaizen update, detected from its state (files,
settings, hooks, folders), never from a remembered version: a fresh clone and a repository fixed by hand
get the same answer. Each line gives the version that introduced it, why it applies, the files it
touches and, when it cannot be automated, the steps to run by hand.

| Migration | Since | Applies when | `--apply` |
|---|---|---|---|
| `production-removed` | 6.0.0 | `deploy` or `monitor` in `.kaizen/config.json` / `config.local.json`, or `kaizen-ops@dojo` in `.claude/settings.json` | by hand: remove them, move the commands to your own tools |
| `agent-skills-base` | 6.0.0 | `.claude/settings.json` declares `kaizen@dojo` but not `agent-skills@dojo`, or keys and files of Kaizen 5.x remain (`profile`, `models`, `risk`, `perf`, `packs`, `tracker`, `CONSTITUTION.md`, `kaizen-packs/`) | declares `agent-skills@dojo`; the rest by hand ([Migrating to 6.0](../migrating-to-6.md)) |

`--apply` runs the automatable ones that still apply, writes only what each owns (formatting and team
lines kept) and ends with the files to commit; run twice, it changes nothing. Nothing is pending outside
a Kaizen repository. `kaizen doctor` reports the pending ones (check `upgrade`).

A release that breaks or deprecates something declares its migration here, or why it needs none
(`NO_MIGRATION` in `scripts/upgrade.mjs`): a contract test fails otherwise.

### `root`

The deliverable paths as JSON: `repo`, `docs_root`, `learnings`, `config_file`.

### `config`

The effective configuration (defaults, then `.kaizen/config.json`, then `.kaizen/config.local.json`) as
JSON. Every key: [Configuration](configuration.md).

### `init [--docs-root d] [--language l]`

Creates `.kaizen/config.json` (with the detected verification commands) and `<docs>/learnings/`, and adds
`.kaizen/state/` and `.kaizen/config.local.json` to `.gitignore`. Leaves an existing configuration as is.

### `detect`

Stack and verification commands, as JSON: `test`, `lint`, `typecheck` (and `audit`), read from
`package.json` scripts, `Makefile`, `pyproject.toml`, `Cargo.toml`, `go.mod`, Gradle, Maven and others.
`verify` in the configuration takes precedence.

## Setup

### `install settings`

Declares the dojo marketplace, `kaizen@dojo` and `agent-skills@dojo` in the versioned
`.claude/settings.json`, keeping everything else.

## Checks

### `verify [--only test,lint,…|audit] [--json]`

Runs the verification commands sequentially, each bounded by `gate.timeout_seconds` (its whole process
tree killed on timeout). The dependency audit runs only with `--only audit`. Prints `✔/✘ name command
(seconds)` and the last 40 lines of each failure; `--json` returns
`[{ name, command, ok, exit, seconds, output }]`. Exit 1 if any is red.

### `gate status` · `gate off`

The [quality gate](../concepts/gates.md#the-quality-gate) of this repository. It turns itself **on** when
a session edits code and **off** when the checks are green; `status` prints its state (`{ active: false }`
when off); `off` lifts it by hand — when the failure is outside the task, said to the user.

### `secrets scan [--staged | --base <ref>] [--json]`

Looks for ~30 kinds of keys and tokens (cloud, git platforms, registries, AI providers, payments,
messaging, private keys, JWTs, database URLs with a password, generic `api_key = "…"` assignments) in
**added lines only**. Default scope: everything not committed yet (index, tracked changes, untracked
files); `--staged`: the index only; `--base <ref>`: the branch's commits since its merge base with
`<ref>` (for CI, e.g. `--base origin/main`). Placeholders (`example`, `changeme`, `${VAR}`…), lockfiles,
minified and vendored files and the `secrets.ignore` globs are skipped. Prints `file:line — type` with a
redacted preview, never the value. Exit 1 if anything is found. The same scan runs in the
[secret gate](../concepts/gates.md#no-secret-committed).

## Review

### `review status` · `review check`

`status`: the recorded review (tree, verdict, source — `code-review-and-quality` or `code-reviewer`)
and the push decision. `check`: the push decision alone, exit 1 when a push would be
stopped. The review records itself: there is no command to record one by hand.
[The review before push](../concepts/gates.md#the-review-before-push).

## Learnings

### `learnings search <words…> [--limit 8] [--json]`

Learnings ranked against the words: title and tags weigh 4, module and component 3, symptoms and root
cause 2, body 1 ([Learnings](../concepts/learnings.md#how-they-come-back)).

### `learnings validate [files…]` · `learnings list [--retire]` · `learnings stats`

`validate`: every learning (or the given files) against the schema, exit 1 if one is invalid. `list`:
JSON of path, title, type, module, date, `files` and `retire_when` when declared; `--retire` keeps only
those with `retire_when` (what `/kaizen:learn prune` checks). `stats`: counts by `problem_type`,
`component`, `module` — the corpus vocabulary to reuse.

## Metrics and cost

### `metrics [--since 90d] [--no-github]`

JSON with `window`, `changes`, `throughput`, `instability`, `batch_size`, `kaizen_loop`, `friction`,
`work_items`. Every computation: [Metrics](../concepts/metrics.md).

### `cost [<item> | current] [--since 90d] [--json]`

What each feature or fix cost, end to end, from the ledger the Stop hook keeps
([work items](../concepts/metrics.md#cost-work_items-kaizen-cost)). `cost` lists the items by cost with
their kind, tokens and sessions, then the median per kind; `cost <item>` details one (`priced_share`:
tokens with a known model); `cost current` says what the turns are charged to right now. `--json`:
`{ items, summary }`.

## Pull requests (`gh` required)

All accept `--pr <n|url>` and `--repo owner/name`; by default the current branch's PR in the current
repository. Used by [`/kaizen:watch`](../guides/watch.md).

| Command | Does |
|---|---|
| `pr snapshot [--start] [--budget-seconds s] [--settle-seconds 300]` | full paginated read + analysis → verdict, attention items, checks, quiet time, budget; updates the local state |
| `pr watch [--interval 150] [--settle-seconds s]` | polls without tokens, exits with `KAIZEN_WAKE {…}` (exit 2 on error) |
| `pr mark --thread ID \| --comment ID \| --check NAME --disposition dispatched\|needs-human\|open [--note …]` | records an item as handled |
| `pr threads [--all]` | unresolved (or all) threads with full comments, and top-level comments, `ours` flagged |
| `pr reply --thread ID --body-file F` | replies in a thread, `<!-- kaizen -->` marker added |
| `pr resolve --thread ID` | resolves a thread |
| `pr comment --body-file F` | top-level comment, marker added |
| `pr update-branch` | updates the branch through the GitHub API **only if** GitHub says `BEHIND`, with the expected head SHA |
| `pr overlap --base <ref>` | local git only: PR files the base modified, moved or deleted since the merge base (`touched`), folders the base removed under a path the PR adds (`removed_dirs`), PR patches already in the base (`absorbed`), commits `behind`; `assess: true` when any is set |

`snapshot`'s `verdict`, first match wins — `pr watch` wakes Claude on every verdict from `terminal` to
`looks-ready`, and on the three `blocked-*`/`needs-human` ones only when the verdict changed:

| Verdict | Meaning |
|---|---|
| `terminal` | merged or closed |
| `budget` | the watch budget (`--budget-seconds`) is spent |
| `actionable` | an unhandled thread, comment or failing check on the head commit |
| `behind` · `conflict` | GitHub says the branch is behind the base, or conflicts with it |
| `looks-ready` | mergeable and clean, checks green, nothing pending, quiet for `--settle-seconds` |
| `blocked-failing` | checks finished, the failing ones all handled (dispatched or left to you) |
| `blocked-external` | the only checks pending wait for an approval (a fork's CI) |
| `needs-human` | checks finished, an item marked `needs-human` |
| `waiting` | checks still running |

`KAIZEN_GH` replaces `gh` (a binary or a Node script, used by the tests).

## Hook scripts

Registered by `hooks/hooks.json`, not meant to be called by hand (calling `review-hooks.mjs` directly is
refused):

| Script | Registered as |
|---|---|
| `review-hooks.mjs --heartbeat` | SessionStart: records that Kaizen's hooks fire (`doctor`'s `hooks` check) |
| `secret-gate.mjs` | PreToolUse on Bash: no `git commit` adding a secret |
| `review-gate.mjs` | PreToolUse: no unreviewed `git push` without your confirmation in Claude Code's prompt; no direct write to the review state |
| `post-edit.mjs` | PostToolUse on Write, Edit, MultiEdit, NotebookEdit: quality gate on, learnings brought back |
| `review-hooks.mjs --evidence` | PostToolUse on Agent, Task, Skill: agent-skills' review recorded (persona) or marked (skill) |
| `quality-gate.mjs` | Stop: verification while the gate is on |
| `review-hooks.mjs --stop` | Stop: reads the review agent-skills' skill wrote this turn, and records it |
| `ledger-hook.mjs` | Stop: the turn's tokens charged to the work item |
| `run-bounded.mjs <ms> <command>` | internal: runs a command and kills its whole process tree on timeout |

The other scripts are modules the CLI loads: `lib.mjs`, `review-state.mjs`,
`learnings.mjs`, `agentskills.mjs`, `secrets.mjs`, `doctor.mjs`, `upgrade.mjs`,
`metrics.mjs`, `ledger.mjs`, `pr.mjs`, and `aliases.mjs`, which generates `commands/`
from agent-skills' commands (`--check` fails when they differ).
