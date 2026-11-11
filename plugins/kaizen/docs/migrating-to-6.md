# Migrating to Kaizen 6.0

Kaizen 6.0 converges on Addy Osmani's [agent-skills](https://github.com/addyosmani/agent-skills): its
commands do the work (spec, plan, build, test, review, ship), Kaizen keeps the gates, the learnings, the
PR follow-up and the measurement. Kaizen went from 20 skills and 22 agents to **4 skills, no agent**, and
runs agent-skills' commands under its own prefix. Production (kaizen-ops) is gone.

Why: [Positioning](positioning.md#why-agent-skills).

## Step by step

1. **Install agent-skills** next to Kaizen: `/plugin install agent-skills@dojo` (after
   `/plugin marketplace update dojo`).
2. **Declare both plugins for every clone**: `/kaizen:setup` (or `node $K install settings`) adds
   `agent-skills@dojo` next to `kaizen@dojo` in `.claude/settings.json`. The rest is by hand, below.
3. **Clean the configuration**: remove from `.kaizen/config.json` (and `config.local.json`) the keys no
   longer read — `profile`, `models`, `risk`, `perf`, `packs`, `tracker`, `deploy`, `monitor`,
   `approvals`, `review.confirm_above_cost`. Remove `kaizen-ops@dojo` from `.claude/settings.json`.
4. **Your constitution**: agent-skills' equivalent is `CONSTRAINTS.md` — a floor (what never goes
   below), enforced checks with their numbers, measured metrics, exceptions — with a floor guard against
   skipped tests and silenced checks. Run `/kaizen:constraints` and bring over the articles that are
   **quality bars**; architecture or product principles go to `SPEC.md` (boundaries *Always / Ask first /
   Never*) or `CLAUDE.md`/`AGENTS.md`. Then delete `CONSTITUTION.md`.
5. **Your packs** (`kaizen-packs/`): rules the team wants every agent to follow go to `CLAUDE.md` or
   `AGENTS.md`; a quality bar goes to `CONSTRAINTS.md`. Then delete the folder.
6. **Your plans in `docs/plans/`**: nothing to do. They stay readable, `metrics` still counts the learnings
   they cite and `kaizen cost` still attributes to their `jira:`/`topic:`. New work starts with
   `/kaizen:spec`, which writes `SPEC.md`, then `/kaizen:plan` (`tasks/plan.md`, `tasks/todo.md`).
7. **Your learnings**: unchanged, same format. New: an optional `files:` field (globs) brings a learning
   back when a matching file is edited.
8. **Your git hooks**, if `kaizen install git-hooks` set them up: they are gone in 6.0. Delete
   `.githooks/pre-push` and `.githooks/pre-commit` (keep any line your team added), then
   `git config --unset core.hooksPath` if nothing else is left in `.githooks/`.
9. `node $K doctor` must show no ⚠ you did not choose to keep.

## Commands

| Kaizen 5.x | Kaizen 6.0 |
|---|---|
| `/kaizen:help` | `/kaizen:setup` (says where you stand and what to run next) |
| `/kaizen:setup` | `/kaizen:setup` |
| `/kaizen:constitution` | `/kaizen:constraints` (agent-skills, `CONSTRAINTS.md`) |
| `/kaizen:ideate` | agent-skills' `idea-refine` skill — ask Claude to refine an idea |
| `/kaizen:brainstorm` | `/kaizen:spec` (agent-skills: assumptions, questions, `SPEC.md`) |
| `/kaizen:decide` | agent-skills' `documentation-and-adrs` skill — ask Claude for an ADR |
| `/kaizen:plan` | `/kaizen:plan` — now agent-skills' (`tasks/plan.md`, `tasks/todo.md`) |
| `/kaizen:doc-review` | agent-skills' `doubt-driven-development` skill, or a review of `SPEC.md` by the `code-reviewer` persona |
| `/kaizen:work` | `/kaizen:build` (`auto` for every task) — the quality gate turns on by itself |
| `/kaizen:autopilot` | `/kaizen:spec`, `/kaizen:plan`, `/kaizen:build auto`, `/kaizen:review`, `/kaizen:ship` |
| `/kaizen:debug` | `/kaizen:test` with the symptom (Prove-It), agent-skills' `debugging-and-error-recovery` skill |
| `/kaizen:polish` | agent-skills' `browser-testing-with-devtools` and `frontend-ui-engineering` skills |
| `/kaizen:review` | `/kaizen:review` — now agent-skills' five-axis review, recorded by Kaizen |
| `/kaizen:ship` | `/kaizen:ship` — now agent-skills' go/no-go; push and `gh pr create` on "go" |
| `/kaizen:address-feedback`, `/kaizen:watch-pr` | `/kaizen:watch` (`checkpoint` for one cycle) |
| `/kaizen:release` | agent-skills' `git-workflow-and-versioning` skill, or your release tool |
| `/kaizen:learn` | `/kaizen:learn` (`harvest` as before) |
| `/kaizen:prune-learnings` | `/kaizen:learn prune` |
| `/kaizen:metrics` | `/kaizen:metrics` |
| `/kaizen-ops:deploy`, `monitor`, `postmortem` | your own deployment, monitoring and incident tools |

The agent-skills commands also answer to their own prefix: `/agent-skills:spec` is `/kaizen:spec`.

## CLI

| Removed | Instead |
|---|---|
| `gate on`, `--claim` | the gate turns on by itself when code is edited (`gate status`, `gate off` remain) |
| `review record`, `review estimate`, `run-dir` | the review records itself from agent-skills' output |
| `plan new / latest / list / check / amend / reviewed` | agent-skills' `SPEC.md` and `tasks/` |
| `constitution`, `packs`, `pack new`, `adr`, `profile`, `models`, `perf`, `size`, `release notes`, `dev` | — (see the table above) |
| `audit`, `audit fix claude_settings` | `doctor`; `install settings` |
| `install git-hooks`, `githook`, `audit fix git_hooks` | — (Kaizen's gates are Claude Code hooks) |
| `metrics dashboard` | `metrics`, `cost` |
| `upgrade`, `upgrade --apply` | this guide |
| `review waive`, `confirm <code>`, `kaizen waive <code>` | push again when Claude asks: Claude Code's prompt asks you to confirm |
| `deploy`, `monitor`, `postmortem new` | your tools |

## Behavior

| Was | Now |
|---|---|
| Quality gate turned on by `/kaizen:work` and `/kaizen:autopilot` | on as soon as a session edits code, off when the checks are green |
| `review record` after Kaizen's 11 reviewers, with evidence | agent-skills' review recorded by the hooks: the verdict read from what it wrote |
| `profile` scaling the ceremony, `risk` raising it | none: agent-skills' process is the same for every change; `CONSTRAINTS.md` sets the bar |
| Learnings searched by the skills | learnings brought back by a hook when `SPEC.md`/`tasks/` are written or a `files:` match is edited |
| Cycle cost (`cycles.jsonl`, `cycle_cost`) | cost per work item (`ledger.jsonl`, `kaizen cost`, `work_items`) |
| Deployment-based DORA | DORA approximated from the default branch and GitHub |
| `require_before_push: true` refused the push until `review waive`, confirmed by a typed code or a prompt | one flow for everyone: stopped once, Claude asks, the review first; you push without it only by confirming Claude Code's prompt |

Every change, with its details: [Changelog](../CHANGELOG.md).
