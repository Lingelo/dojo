# Features

Everything Kaizen adds, beyond the workflow commands, at a glance: what each feature is for, when it
runs, how to turn it on or off, and where it is described in full. The workflow itself — spec, plan,
build, test, review, ship — is [Kaizen around agent-skills](concepts/the-loop.md); where every file
lives is [State and files](reference/state-and-files.md).

| Feature | Runs | On by default | Off with |
|---|---|---|---|
| [agent-skills under `/kaizen:`](#agent-skills-under-kaizen) | when you type a command | yes | — |
| [Quality gate](#quality-gate) | end of every turn that edited code | yes | `gate.enabled: false` |
| [Review before push](#review-before-push) | every `git push` Claude runs | yes | `review.require_before_push: false` |
| [Secret gate](#secret-gate) | every `git commit` Claude runs, in any repo | yes | `secrets.scan: false` |
| [Learnings brought back](#learnings) | writing `SPEC.md`/`tasks/`, editing a file a learning names | yes | — (no learnings, nothing comes back) |
| [Where you are, and doctor](#where-you-are-and-doctor) | `/kaizen:setup`, `node $K status`, `node $K doctor` | on request | — |
| [Constraints and the floor guard](#constraints-and-the-floor-guard) | `/kaizen:constraints`, then agent-skills' guard | on request | — |
| [Cost ledger](#cost-ledger) | end of every turn | yes | — (never blocks) |
| [Friction log](#friction-log) | every gate stop | yes | — |
| [Metrics](#metrics) | `/kaizen:metrics`, `node $K metrics` | on request | — |
| [PR follow-up](#pr-follow-up) | `/kaizen:watch` | on request | — |
| [Models per phase](#models-per-phase) | `status`, `/kaizen:build`, the quality gate | **no** | `models.enabled: false` |
| [Forked build](#forked-build) | `/kaizen:build-fork` | **no** | `models.build_fork: false` |
| [Bounded checks](#bounded-checks) | every check Kaizen runs | yes | — |
| [Evals](#evals) | `node plugins/kaizen/evals/run.mjs` | maintainers, on request | — |

Every hook is inactive outside a repository with `.kaizen/config.json`, except the secret gate.
`node $K` is `node "${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`: [CLI reference](reference/cli.md).

## agent-skills under `/kaizen:`

Addy Osmani's agent-skills, embedded: its commands as `/kaizen:spec`, `plan`, `build`…, Kaizen's entry
points onto the skills that have no command (`/kaizen:ideate`, `debug`, `adr`, `security`, `doubt`,
`migrate`), its personas as `kaizen:code-reviewer`… each on the model and effort Kaizen gives it. Generated
by `scripts/aliases.mjs`, never edited by hand. → [Kaizen around agent-skills](concepts/the-loop.md#the-commands)

## Quality gate

Claude cannot end a turn with red checks after editing code: the Stop hook runs `verify` while the gate
is on, blocks up to `gate.max_blocks` times, then lets the turn end and says what is red. On by itself
when the session edits a code file, off when green. Slow suites: `gate.targeted`. Off for the repository:
`gate.enabled: false`; for this session: `node $K gate off`. → [The quality gate](concepts/gates.md#the-quality-gate)

## Review before push

An unreviewed branch is not pushed: the PreToolUse hook stops `git push` once, Claude asks for the review
first, and only your confirmation in Claude Code's prompt lets it through unreviewed. The review is
agent-skills' (`/kaizen:review` or the `code-reviewer` persona) and records itself. Off:
`review.require_before_push: false`. → [The review before push](concepts/gates.md#the-review-before-push)

## Secret gate

A `git commit` that adds a key, a token or a private key (~30 patterns) is refused, and so is
`--no-verify`. Runs in every git repository. The same scan for CI: `node $K secrets scan --base
origin/main`. Off: `secrets.scan: false`; fixtures: `secrets.ignore`. → [No secret committed](concepts/gates.md#no-secret-committed)

## Learnings

`/kaizen:learn` keeps one durable lesson per problem in `<docs_root>/learnings/` (`harvest` for a branch,
`prune` for the corpus). They come back without being asked: when `SPEC.md` or `tasks/` is written, and
when a file a learning names in `files:` is edited (PostToolUse hook, once per content or session).
→ [Learnings](concepts/learnings.md) · [the guide](guides/learn.md)

## Where you are, and doctor

`/kaizen:setup` initializes a repository and names the next command (`node $K status`: spec, plan, build,
review, ship or watch, from git and the task checkboxes). `node $K doctor` says which guard rails are on
— plugin declared, agent-skills loaded once, hooks firing, branch reviewed, floor guard wired — with the
fix for each. `node $K install settings` declares Kaizen in `.claude/settings.json` for every clone.
→ [the setup guide](guides/setup.md) · [Doctor](concepts/gates.md#doctor)

## Constraints and the floor guard

`/kaizen:constraints` (agent-skills) writes the project's quality bar, `CONSTRAINTS.md`, and installs
agent-skills' floor guard against a lowered bar (skipped tests, silenced checks, edited thresholds).
Kaizen reads the file and `doctor` checks that the guard runs (`floor_guard`). → [Doctor](concepts/gates.md#doctor)

## Cost ledger

Each turn's new tokens — main session and subagents, per model and token type — are charged to the work
item in progress (the branch's Jira key, else the branch) in `.kaizen/state/ledger.jsonl`, priced at
Anthropic's list prices or `cost.prices`. `node $K cost` lists what each feature or fix cost.
→ [Cost](concepts/metrics.md#cost-work_items-kaizen-cost)

## Friction log

Every time a gate stops the work, and what lifts it (blocked, released, escalated, refused, asked,
confirmed…), is appended to `.kaizen/state/friction.jsonl`: the measure of what the guard rails cost.
→ [Friction](concepts/metrics.md#friction-friction)

## Metrics

`/kaizen:metrics` reads git, GitHub and Kaizen's state: DORA approximated (throughput, instability, lead
time), batch size against `pr.max_lines`, learnings reuse, friction, cost per work item. It answers in
the conversation; nothing is written unless you ask. → [Metrics](concepts/metrics.md) · [the guide](guides/metrics.md)

## PR follow-up

`/kaizen:watch` drives an open PR to "looks ready": feedback answered, CI repaired, the branch updated
only when GitHub says it is behind, waiting between rounds without spending tokens (`node $K pr watch`).
It never merges. Needs `gh`. → [the watch guide](guides/watch.md) · [`pr` commands](reference/cli.md#pull-requests-gh-required)

## Models per phase

Advice on the model and effort per phase — Opus to decide and review, Sonnet to build, effort `high`
only for the plan and the security audit. With `models.enabled`: `status` and `/kaizen:setup` name the
session to open for the next command (`claude --model sonnet --effort medium`), `/kaizen:build` started
on another model than `models.build` shows a warning (it goes on), and the quality gate escalates to an
Opus subagent after `models.escalate_after` blocks. Kaizen never changes your model. Off by default.
→ [Models per phase](concepts/the-loop.md#models-per-phase) · [`models`](reference/configuration.md#models)

## Forked build

`/kaizen:build-fork` runs agent-skills' `/build`, one task, in a forked subagent on Sonnet: the session
can stay on Opus. Never `auto` (a fork cannot wait for your approval), the context is reread on each
call, only the final report comes back. Refused until `models.build_fork: true`.
→ [Models per phase](concepts/the-loop.md#models-per-phase)

## Bounded checks

Every check Kaizen runs — `verify`, the quality gate — is bounded by `gate.timeout_seconds` per command
and `gate.budget_seconds` per Stop, and its whole process tree is killed on timeout (`run-bounded.mjs`),
on Windows too. `node $K detect` finds the commands; `verify` in the configuration overrides them.
→ [`gate`](reference/configuration.md#gate) · [`verify`](reference/cli.md#verify---only-testlintaudit---json)

## Evals

For whoever changes Kaizen: end-to-end scenarios that run a skill in a real `claude -p` session on a
trapped repository and check the result, optionally on a pinned model and effort for A/B runs (`--model`,
`--effort`). Costly, run before a release, not in CI. → [How it is tested](positioning.md#how-it-is-tested)

## What Kaizen does not turn on

agent-skills ships hooks of its own (`agent-skills/hooks/`: SDD cache, simplify-ignore, session start).
Kaizen does not register them — they stay opt-in, as agent-skills documents them
([SDD cache](../agent-skills/hooks/SDD-CACHE.md), [simplify-ignore](../agent-skills/hooks/SIMPLIFY-IGNORE.md)).
