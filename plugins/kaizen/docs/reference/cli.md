# CLI reference (`scripts/kaizen.mjs`)

Every deterministic operation of Kaizen goes through one zero-dependency Node script (Node ≥ 18). Skills
call it instead of reimplementing anything by hand; you can call it too:

```bash
K=plugins/kaizen/scripts/kaizen.mjs        # or the installed plugin's path
node $K help                               # one-line summary of every command
```

Conventions:

- It must run inside a git repository (`git rev-parse --show-toplevel`); otherwise it stops with
  `kaizen: no git repository here`.
- Flags are `--name value` or boolean `--name`. Paths are printed POSIX-style on every OS.
- Output: human-readable text, or JSON for commands that return data (most accept `--json`).
- **Exit codes**: `0` success · `1` a check is red (verify, size, secrets scan, plan check,
  constitution check, learnings validate, review check, deploy/rollback/flag failure, monitor breach, dev probe unreachable,
  `plan latest` without a plan) · `2` usage error or exception (message on stderr, `kaizen: …`).

## Orientation

### `status [--json]`

Where the repo stands in the loop and what to run next — the backend of
[`/kaizen:help`](../guides/help.md). Reports branch, commits ahead of the base, uncommitted files,
initialization and profile, constitution (version, validity), number of plans and the latest one with
its stage and `plan check` errors, number of learnings, gate state, deploy environments and undeployed
commits, open incidents and resolved ones without a postmortem, review state and push decision, and the
ordered `next` list ([decision order](../concepts/the-loop.md#knowing-where-you-are)).

### `root`

JSON of the deliverable paths: `repo`, `docs_root`, `plans`, `learnings`, `ideation`, `debug`,
`config_file` (or null), `concepts` (`CONCEPTS.md` if present).

### `config`

The effective configuration (defaults + `config.json` + `config.local.json`), as JSON. A mistyped
profile falls back to `standard` with a `profile_warning`.

### `init [--docs-root d] [--language l] [--tracker t] [--profile lean|standard|full]`

Creates `.kaizen/config.json` (never rewrites an existing one), `.kaizen/state/` with its own
`.gitignore`, `<docs_root>/plans`, `learnings`, `ideation` (each with a `.gitkeep`), and adds
`.kaizen/config.local.json` to `.gitignore`. Prints what was created, the paths and the detected stack.

### `detect`

Stack and verification commands as JSON: `stacks` (e.g. `node (pnpm)`, `python`), `commands`
(`test`, `lint`, `typecheck`, `audit` — configuration wins, detection fills the gaps), `configured`
(keys coming from the config).

### `audit [--json] [--no-github]` · `audit fix <id> [--owner @x] [--env e] [--ref sha]`

SDLC maturity in five areas with a score each, and the to-do list by priority. `audit fix` writes a
scaffold without ever overwriting a file. See [Audit](audit.md).

### `models [--json] [--agent <name>]`

The model of each role and agent for the current profile and configuration, with the source of each
value and warnings for invalid entries. `--agent kaizen:security-reviewer` prints just that model.
See [Agents and models](../concepts/agents-and-models.md#the-model-policy).

## Checks

### `verify [--only test,lint,…|audit] [--json]`

Runs the verification commands (`detect`) sequentially, each bounded by `gate.timeout_seconds` (its
whole process tree killed on timeout). The dependency audit only runs with `--only audit`. Prints
`✔/✘ name command (seconds)` and the last 40 lines of each failure; `--json` returns
`[{ name, command, ok, exit, seconds, output }]`. Exit 1 if any is red.

### `size [--base <ref>] [--max <n>] [--json]`

Lines changed by the branch against its merge base with the default branch (uncommitted included),
excluding `pr.ignore` globs and binary files, compared to `pr.max_lines` (or `--max`). Over the limit,
lists the 5 largest files. Exit 1 above the limit.

### `secrets scan [--staged | --base <ref>] [--json]`

Looks for ~30 kinds of keys and tokens (cloud, git platforms, registries, AI providers, payments,
messaging, private keys, JWTs, database URLs with a password, generic `api_key = "…"` assignments) in
**added lines only**. Default scope: everything not committed yet (index, tracked changes, untracked
files); `--staged`: the index only; `--base <ref>`: the branch's commits since its merge base with
`<ref>` (for CI, e.g. `--base origin/main`). Placeholders (`example`, `changeme`, `${VAR}`…), lockfiles,
minified and vendored files and the `secrets.ignore` globs are skipped. Prints `file:line — type` with a
redacted preview, never the value; `--json` returns `{ findings: [{ file, line, type, preview }] }`.
Exit 1 if anything is found. The same scan runs in the [secret gate](../concepts/gates-and-hooks.md#the-secret-scan-before-git-commit-pretooluse).

### `gate on [--plan <path>]` · `gate off` · `gate status`

The [Stop-hook quality gate](../concepts/gates-and-hooks.md#the-quality-gate-stop-hook). `on` writes
`gate.json`; `off` removes it, appends the finished cycle to `cycles.jsonl` and prints it; `status`
prints the state (`{ active: false }` when off).

## Plans

### `plan new --type <type> --topic <slug> [--ext md|html]`

Reserves `<docs_root>/plans/YYYY-MM-DD-HHMM-<type>-<topic>-plan.md` atomically (`-plan-2`, `-plan-3`…
if taken) and prints the path. Type and topic are slugified (accents removed, 60 characters max).

### `plan latest` · `plan list`

`latest`: the most recently modified plan (exit 1 if none). `list`: JSON of every plan with `path`,
`title`, `stage` (`requirements` | `implementation-ready`) and `updated`.

### `plan check <path> [--json]`

The structural check of a plan — every error and warning is listed in
[Plans](../concepts/plans.md#everything-plan-check-verifies). JSON:
`{ stage, requirements, acceptance_examples, units, slices, errors, warnings }`. Exit 1 on errors.

## Principles and knowledge

### `constitution [check] [--json]`

Without `check`: the articles (id, title, NON-NEGOTIABLE, check) and the version/ratification dates;
`--json` returns `{ exists, meta, articles, amendments }` (`{ exists: false }` without a file). With
`check`: validation, exit 1 on errors ([rules](../concepts/constitution.md#validation-constitution-check)).

### `learnings search <words…> [--limit 8] [--json]`

Ranked learnings ([scoring](../concepts/learnings.md#search)).

### `learnings validate [files…]` · `learnings list` · `learnings stats`

`validate`: every learning (or the given files) against the schema, exit 1 if one is invalid. `list`:
JSON of path, title, type, module, date. `stats`: counts by `problem_type`, `component`, `module` — the
corpus vocabulary to reuse.

### `packs [--json] [--refresh]` · `pack new <name>`

`packs`: the declared [Kaizen Packs](../packs.md) resolved — local folders, `~/` paths, or git sources
cloned (shallow, at `ref`) into `${CLAUDE_PLUGIN_DATA}/packs/` (`--refresh` re-clones). A folder with
top-level rules is one pack; otherwise each subfolder is one (`pack: [...]` filters). Each rule needs
`title` and `applies_when`; at most 25 rules per pack are listed; problems are warnings. `pack new`
creates `kaizen-packs/<name>/` (README + `research/`) and declares it in `.kaizen/config.json`; it
refuses a non-empty folder.

### `adr new --title "…"` · `adr list`

`new` reserves `<docs_root>/adr/NNNN-<title>.md` (next number, atomic) and prints the path. `list`:
JSON of path, title, status, date.

### `postmortem new --title "…"`

Reserves `<docs_root>/postmortems/YYYY-MM-DD-<title>.md` (`-2`, `-3`… if taken).

## Review

### `review record --verdict ready|concerns|blocked [--run <folder>]`

Records the reviewed tree of the current branch. Refused without evidence of a reviewer since the
previous review, except a light review (branch ≤ 20 lines) or an update after fixes (≤
`review.max_unreviewed_lines` since the reviewed tree). Prints the entry: branch, head, tree, verdict,
depth (`agents` | `light` | `update`), reviewers, models, run, at. `reserves` is accepted for
`concerns`.

### `review waive --reason "…"`

Creates a pending waiver for the branch and prints `{ code, expires_in_minutes: 30, instruction }`. Only
your message `kaizen waive <code>` confirms it.

### `review status` · `review check`

`status`: the recorded review, a pending waiver, and the push decision. `check`: the push decision
alone, exit 1 when a push would be refused. See
[the decision at push time](../concepts/gates-and-hooks.md#the-decision-at-push-time).

### `run-dir <type>`

Creates and prints `.kaizen/state/<type>/<YYYYMMDD-HHMMSS>/`, a local working folder ignored by git
(e.g. `run-dir reviews` for the raw reviewer returns).

## Pull requests (`gh` required)

All accept `--pr <n|url>` and `--repo owner/name`; by default the current branch’s PR in the current
repository. Mechanics in [Pull requests](../concepts/pull-requests.md#driving-the-pr-to-looks-ready).

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

`KAIZEN_GH` replaces `gh` (a binary or a Node script, used by the tests).

## Release and production

### `release notes [--from <tag>] [--to <ref>]`

JSON: `from`, `to`, `commits`, `non_conventional`, `breaking`, `level`, `current`, `next`, `groups`,
`rollout` (shipped plans with their rollout fields and what is missing). See
[Production](../concepts/production.md#release).

### `deploy detect [--json]` · `deploy configure <id> [--force]`

Recognized deployment candidates (commands per environment, rollback, signals, confidence, notes); write
one into the configuration without overwriting an existing environment unless `--force`.

### `deploy request <env> [--ref r]` · `deploy run <env> [--ref r]` · `deploy rollback <env> [--reason …] [--to r]` · `deploy list [--env e]` · `deploy flag on|off <name> [--env e]`

See [Deploy](../concepts/production.md#deploy). `run`, `rollback` and `flag` exit 1 on failure; `run`
refuses a protected environment without a confirmed approval for that commit.

### `monitor check|watch|patrol|alert|incident …`

| Command | Exit 1 when |
|---|---|
| `monitor check [--env e] [--plan p]` | a signal is out of threshold |
| `monitor watch [--env e] [--plan p] [--minutes 15] [--interval 60]` | a confirmed breach (incident opened; rollback if `auto_rollback`), or a signal blind throughout (`status: blind`, nothing opened) |
| `monitor patrol --env e [--plan p] [--interval 60]` | a confirmed breach (incident opened), or a blind signal (`status: blind`, no incident) |
| `monitor alert [--env e] [--file f\|-]` | — (prints the parsed alert and the action) |
| `monitor incident open --env e [--at iso] [--summary …] [--source s]` · `resolve --env e [--at iso] [--summary …]` · `list [--env e]` | — |

`watch` prints one line per sample on stderr (`✔/✘ name=value…`). See
[Monitor](../concepts/production.md#monitor) and [Incidents](../concepts/production.md#incidents).

## Metrics and dev server

### `metrics [--since 90d] [--no-github]`

JSON with `window`, `deployments`, `changes`, `throughput`, `instability`, `batch_size`, `kaizen_loop`,
`cycle_cost`. Every computation: [Metrics](../concepts/metrics.md).

### `dev detect` · `dev probe --url <url> [--timeout-seconds 30]`

`detect`: dev server candidates `{ name, framework, command, cwd, port, url, source }` — Node projects
(Next.js, Nuxt, SvelteKit, Remix, React Router, Astro, Angular, Gatsby, Create React App, Vite,
Storybook, or plain node with the port read from the script or the entry point), Rails, `Procfile.dev`,
Django, Phoenix, Laravel — at the root and in monorepo folders (`apps/`, `packages/`, `web/`, `frontend/`,
`client/`, `services/`); configurations declared in `.vscode/launch.json` take precedence. `probe`
waits until the URL answers (exit 1 if it never does). Used by [`/kaizen:polish`](../guides/polish.md);
launching the server itself is left to Claude, so the session keeps its logs.

## Hook scripts

Not meant to be called by hand (and `review-hooks.mjs` is refused by the PreToolUse hook when called
directly):

| Script | Registered as |
|---|---|
| `secret-gate.mjs` | PreToolUse on Bash |
| `review-gate.mjs` | PreToolUse |
| `quality-gate.mjs` (`--claim`) | Stop (PostToolUse on Bash) |
| `review-hooks.mjs --evidence` / `--confirm` | PostToolUse on Agent/Task / UserPromptSubmit |
| `run-bounded.mjs <ms> <command>` | internal: runs a command and kills its whole process tree on timeout |
