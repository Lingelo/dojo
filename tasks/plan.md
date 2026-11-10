# Plan: Kaizen 6.0, agent-skills as the base

> **Amended 2026-11-10 — reduced to the maximum.** The steps spread over 6.0 to 6.3 below were done in 6.0: Kaizen keeps 4 skills (`setup`, `learn`, `metrics`, `watch`), no agent, and runs agent-skills' commands as `/kaizen:<name>`. See `docs/SPEC.md` ("Amended 2026-11-10") and `tasks/todo.md` (Task 5b).

Spec: `docs/SPEC.md`. Tasks: `tasks/todo.md`. Format: agent-skills' `planning-and-task-breakdown`.

## Design decisions

1. **One sync script, two parameters.** `sync-kioku.mjs` becomes `sync-plugin.mjs` and gains `--plugin <name>`
   (default `kioku`); push or pull request is the workflow's choice, so the script needs no mode. No generic framework: two uses do not justify an abstraction (his rule), and the
   safety checks (staged swap, escaping symbolic links, `plugin.json` name) stay in one place.
2. **agent-skills arrives by pull request, kioku by push.** kioku is the maintainer's own code;
   agent-skills is third-party code whose hooks run on users' machines. The PR body lists changed
   hooks and scripts as "Executable changes".
3. **One read-only parser** (`agentskills.mjs`) for `SPEC.md`/`docs/SPEC.md`, `tasks/plan.md`,
   `tasks/todo.md`, `CONSTRAINTS.md`, tolerant to missing sections: his templates evolve.
4. **His review records itself** from the PostToolUse hook that already logs reviewers: worktree tree
   at that moment, depth `agent-skills`, verdict `blocked` if the persona's text has a `Critical:`
   line, else `ready`. No run folder: his personas write none, so `missingOutputs` ignores them. The
   agent never has to run `kaizen review record` after his review — that weight is what the
   convergence removes.
5. **Inert by default.** Without his files or his plugin, every Kaizen output is unchanged (tests
   snapshot today's `status`).
6. **Dogfooding.** This work is planned in his format; once task 3 lands, the parser reads this very
   `tasks/todo.md` (checked by its tests and by `doctor`).
7. **No new CLI command.** Decided 2026-11-09: Osmani needs no `kaizen tasks`; the parser exists for
   the gates (6.1) and `doctor`, nothing else. Where he already ships a guard — the floor guard of
   `constraint-driven-development` — Kaizen checks it is installed instead of writing its own.

## Risks

| Risk | Mitigation |
|---|---|
| An upstream change adds a harmful hook or script | sync by PR only, executable changes listed, merged by a human |
| A symbolic link in upstream escapes the copy | existing refusal in the sync script, kept for both plugins |
| The agent launches his reviewer with a trivial prompt to get a review recorded | accepted for 6.0: same evidence level as Kaizen's reviewers today; reviewer and verdict visible in `review status` and the PR; revisited with the evidence ledger in 6.1 |
| Both plugins trigger on the same request (`review my change`) | measured in the Claude Code spike; the guide says which command to use; resolved by deprecations in 6.1 |
| His `.sh` hooks on Windows | measured if possible, otherwise a known gap in `docs/hosts.md` |
| Codex and Copilot not measurable here | fixtures from their official docs, marked "documented, not measured" |

## Rollout and rollback

Opt-in: nobody has `agent-skills@dojo` enabled yet, and the engine's new paths act only on his files
or personas. Rollback: one revert of the copy and the marketplace entry; Kaizen 6.0.1 for the engine. Production removal is not rolled back: a team that deploys keeps its own tools.
Nothing irreversible: the engine writes no user file.

## Open questions

See `docs/SPEC.md` § Open Questions.

## Task list

1. Sync script takes a plugin name
2. Workflow, first copy, marketplace entry
3. Parser for his files
4. `doctor` check `agent_skills`
4b. Remove production (kaizen-ops and core: decided 2026-11-09)
5. His reviewers recognized, his review recorded by itself
6. Claude Code spike and host fixtures
7. Guide, hosts page, release 6.0.0

Checkpoints after tasks 2, 4 and 7 (see `tasks/todo.md`).

## After 6.0

What the ideation spread over 6.1 to 7.0 (overlapping skills, the 22 agents, the scripts replaced by
agent-skills, production, the docs rewrite, the new video) was done in 6.0 — the list of what went is
in `plugins/kaizen/CHANGELOG.md` and `plugins/kaizen/docs/migrating-to-6.md`. Still open, each its own
spec when it starts:

- **Handoff** between sessions, from agent-skills' `tasks/` files.
- **Boundaries enforcement**: the "Always / Ask first / Never" of `SPEC.md` checked by a hook, not only
  read.
- **Other hosts**: the read-back of learnings for agents that are not Claude Code (an `AGENTS.md`
  section pointing to `docs/learnings/`).
