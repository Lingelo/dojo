# Plan: Kaizen 5.2, agent-skills as the base

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
6. **Dogfooding.** This work is planned in his format; once task 3 lands, `kaizen status` reads this
   very `tasks/todo.md`.

## Risks

| Risk | Mitigation |
|---|---|
| An upstream change adds a harmful hook or script | sync by PR only, executable changes listed, merged by a human |
| A symbolic link in upstream escapes the copy | existing refusal in the sync script, kept for both plugins |
| The agent launches his reviewer with a trivial prompt to get a review recorded | accepted for 5.2: same evidence level as Kaizen's reviewers today; reviewer and verdict visible in `review status` and the PR; revisited with the evidence ledger in 5.3 |
| Both plugins trigger on the same request (`review my change`) | measured in the Claude Code spike; the guide says which command to use; resolved by deprecations in 5.3 |
| His `.sh` hooks on Windows | measured if possible, otherwise a known gap in `docs/hosts.md` |
| Codex and Copilot not measurable here | fixtures from their official docs, marked "documented, not measured" |

## Rollout and rollback

Opt-in: nobody has `agent-skills@dojo` enabled yet, and the engine's new paths act only on his files
or personas. Rollback: one revert of the copy and the marketplace entry; Kaizen 5.2.1 for the engine.
Nothing irreversible: the engine writes no user file.

## Open questions

See `docs/SPEC.md` § Open Questions.

## Task list

1. Sync script takes a plugin name
2. Workflow, first copy, marketplace entry
3. Parser for his files
4. `kaizen tasks` and an agent-skills-aware `status`
5. `doctor` check `agent_skills`
6. His reviewers recognized, his review recorded by itself
7. Claude Code spike and host fixtures
8. Guide, hosts page, release 5.2.0

Checkpoints after tasks 2, 5 and 8 (see `tasks/todo.md`).

## Next releases (from the ideation, accelerated on 2026-11-09)

- **5.3** — Kaizen's overlapping skills deprecated, each answering with its agent-skills replacement
  (`ideate`, `brainstorm` → `/spec`, `idea-refine`, `interview-me`; `constitution` → `/constraints`;
  `plan`, `doc-review`, `decide` → `/plan`, `doubt-driven-development`, `documentation-and-adrs`; `work`,
  `autopilot` → `/build`; `debug` → `debugging-and-error-recovery`; `review` → `/review`; `polish` →
  `frontend-ui-engineering`); Kaizen-only skills (`learn`, `metrics`, `watch-pr`, `help`/`setup`)
  rewritten in his anatomy; engine guards on his files (silenced checks from `CONSTRAINTS.md`, evidence
  ledger, scope from "Files likely touched"); hook adapters from the recorded fixtures.
  **Learnings kept, read back by the engine**: agent-skills' skills do not read `docs/learnings/`, so
  the read-back moves from Kaizen's skills to hooks — when `SPEC.md` or `tasks/plan.md` is written, the
  matching learnings (`kaizen learnings search` on its terms) are added to the agent's context; when a
  file is edited, the learnings whose new optional `files:` globs match it are added too; the
  generated `AGENTS.md` section points other hosts to `docs/learnings/`. `/kaizen:learn` keeps writing
  them (schema lightened) and harvests repeated refusals into rationalization learnings.
- **5.4–5.5** — handoff, boundaries enforcement, `CONSTITUTION.md` → `CONSTRAINTS.md` in `kaizen
  upgrade`, kaizen-ops launch ladder.
- **6.0** — deprecated skills and 20 agents removed, docs rewrite, new video.
