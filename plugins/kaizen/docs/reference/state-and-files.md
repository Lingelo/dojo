# State and files

Everything Kaizen reads and writes, where it lives, who writes it, and whether it is shared.

> **Where the workflow files live**
>
> | Path | Written by | Where it is decided |
> |---|---|---|
> | `SPEC.md` at the root (or `docs/SPEC.md`, or a file under `spec/`) | `/kaizen:spec` | agent-skills: `/kaizen:spec` writes `SPEC.md` at the root; `/kaizen:build auto` accepts the three. Kaizen reads `SPEC.md` and `docs/SPEC.md` (`scripts/agentskills.mjs`) |
> | `tasks/plan.md` | `/kaizen:plan` | agent-skills, fixed |
> | `tasks/todo.md` | `/kaizen:plan`, checked off by `/kaizen:build` | agent-skills: the default task list, unless `CLAUDE.md`/`AGENTS.md` names an issue tracker — then Kaizen sees no tasks |
> | `CONSTRAINTS.md` | `/kaizen:constraints` | agent-skills, fixed, at the root |
> | ADRs: the folder the project already uses (`docs/adr/*.md`…), else `docs/decisions/` | `/kaizen:adr` | agent-skills; Kaizen does not read them |
> | `<docs_root>/learnings/` | `/kaizen:learn` | **configurable**: [`docs_root`](configuration.md#docs_root), `docs` by default |
> | `<docs_root>/metrics/` | nothing automatic: `/kaizen:metrics` answers in the conversation; the folder is the convention for a report you ask to keep | **configurable**: `docs_root` |
> | `.kaizen/config.json` | `/kaizen:setup`, `init`, you | Kaizen, fixed, versioned |
> | `.kaizen/config.local.json` | you | Kaizen, fixed, git-ignored |
> | `.kaizen/state/` | Kaizen's hooks and CLI | Kaizen, fixed, local and git-ignored |
>
> Only `docs_root` moves anything: agent-skills' files keep their paths, which its commands and skills
> impose, and Kaizen reads them where agent-skills writes them.

![What Kaizen writes in your repo, and who reads it](../media/diagrams/artifacts-map.svg)

## Versioned (shared with the team)

| Path | Written by | Notes |
|---|---|---|
| `<docs>/learnings/<folder>/<slug>.md` | `/kaizen:learn` | one lesson per file, [format](../concepts/learnings.md#the-format); `docs_root` is `docs/` by default |
| `<docs>/metrics/YYYY-MM-DD.md` | Claude, when you ask to keep a `/kaizen:metrics` report | trend reports; a convention, no script writes or reads them |
| `.kaizen/config.json` | `/kaizen:setup`, `init`, you | [configuration](configuration.md) |
| `.claude/settings.json` (two keys) | `install settings`, with approval | the dojo marketplace, `kaizen@dojo` |
| one line in `CLAUDE.md` or `AGENTS.md` | `/kaizen:setup`, with approval | makes the learnings findable by any agent |

**Read, never written, by Kaizen** — agent-skills' files: `SPEC.md` (or `docs/SPEC.md`), `tasks/plan.md`,
`tasks/todo.md`, `CONSTRAINTS.md` (`scripts/agentskills.mjs`, tolerant of any shape). `status` reads the
tasks left, `post-edit.mjs` brings learnings back when they are written, `metrics` counts the learnings
they cite, `doctor` checks `CONSTRAINTS.md`'s floor guard.

No file carries a mutable "status": progress is read from git and from the task checkboxes.

## Personal

| Path | Notes |
|---|---|
| `.kaizen/config.local.json` | your overrides, git-ignored by `init` (`docs_root` is not read from it) |

## Local state (`.kaizen/state/`, git-ignored)

The folder carries its own `.gitignore` (`*`). Deleting it is harmless: Kaizen forgets the work in
progress, the reviews recorded (the next push asks for one) and the cost history.

| File | Written by | Content | Lifetime |
|---|---|---|---|
| `gate.json` | `post-edit.mjs`, Stop hook | active, session, since, blocks, files edited, last failure | until green, `gate off`, `max_blocks` or `gate.max_age_hours` |
| `reviews.json` | review hooks | per branch: head, tree, verdict, source, depth, session, at | replaced per branch |
| `review-pending.json` | PostToolUse on Skill | agent-skills' review skill was loaded this turn: read by the Stop hook | until that Stop |
| `push-offers.json` | review hook | per branch: the commit you were asked about | 30 min, used by the next push of that commit |
| `hooks-seen.json` | SessionStart hook | the last time Kaizen's hooks fired here (`doctor`) | replaced |
| `session-model.json` | `model-hooks.mjs --record` (SessionStart, PostModelSwitch) | per session: model, source (`start:…`, `switch:…`), at — read by the `/kaizen:build` warning | the last 20 sessions |
| `learnings-seen.json` | `post-edit.mjs` | learnings already brought back: per planning file content, per session | kept |
| `friction.jsonl` | every gate that stops the work, and what lifts it | at, gate, kind (`refused`, `asked`, `skip_confirm`, `blocked`, `released`, `escalated`, `no_verify`, `review_recorded`), reason, branch, checks, source | kept |
| `ledger.jsonl` | Stop hook `ledger-hook.mjs` | at, session, item, kind, title, branch, source, usage per model, subagents | kept |
| `ledger-cursor.json` | Stop hook `ledger-hook.mjs` | byte offset and last message ids per transcript already charged | kept |
| `pr/<owner>-<repo>-<n>.json` | `pr snapshot`, `pr mark` | threads, comments, checks handled, started_at, budget, last head | delete to start over |

Writes to `reviews.json`, `review-pending.json`, `push-offers.json` and `hooks-seen.json`, and direct calls of `review-hooks.mjs`, are refused by the PreToolUse hook: only
the hooks write them.

## Outside the repository

| Path | Content |
|---|---|
| Claude Code transcripts (`~/.claude/projects/…`) | read by the Stop hooks: the review agent-skills' skill wrote, and the tokens of each turn (main session and `subagents/agent-*.jsonl`); by `model-hooks.mjs --command`: the last answer's model, when none was recorded |

## Environment variables

| Variable | Read by | Role |
|---|---|---|
| `CLAUDE_PLUGIN_ROOT` | skills, hooks | the plugin's folder (set by Claude Code) |
| `KAIZEN_GH` | `pr`, `metrics` | replacement for `gh` (tests) |
