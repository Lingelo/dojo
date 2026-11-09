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
6. **Dogfooding.** This work is planned in his format; once task 3 lands, the parser reads this very
   `tasks/todo.md` (checked by its tests and by `doctor`).
7. **No new CLI command.** Decided 2026-11-09: Osmani needs no `kaizen tasks`; the parser exists for
   the gates (5.3) and `doctor`, nothing else. Where he already ships a guard — the floor guard of
   `constraint-driven-development` — Kaizen checks it is installed instead of writing its own.

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
4. `doctor` check `agent_skills`
5. His reviewers recognized, his review recorded by itself
6. Claude Code spike and host fixtures
7. Guide, hosts page, release 5.2.0

Checkpoints after tasks 2, 4 and 7 (see `tasks/todo.md`).

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
- **Kaizen's own scripts, triaged** (decided 2026-11-09: measurement kept, production removed, PR
  follow-up kept). From ~7,500 lines of CLI to about half:

  | Group | Scripts | Decision |
  |---|---|---|
  | Engine | `quality-gate`, `run-bounded`, `secret-gate`, `secrets`, `review-gate`, `review-state`, `review-hooks`, `githooks` | kept |
  | Measurement | `metrics`, `dashboard`, `ledger`, `ledger-hook`, `cycle-agents` | kept; DORA reads merges and release tags instead of deploy tags |
  | PR follow-up | `pr` (watch-pr, address-feedback) | kept, trimmed for `/kaizen:watch` |
  | Replaced by agent-skills | `plancheck`, `planamend`, `constitution`, `risk`, `perf`, `devserver`, `estimate`, `models`, `approvals`, `audit` | deprecated in 5.3, removed in 6.0 (his plan format, `CONSTRAINTS.md`, floor guard, `/webperf`, constraints intake) |
  | Production | `deploy`, `monitor`, `deploydetect`, the deploy part of `review-gate` and `release`, the whole `kaizen-ops` plugin | deprecated in 5.3, removed in 6.0 |
  | Base | `lib`, `kaizen.mjs`, `doctor`, `upgrade`, `release` (notes, SemVer) | trimmed to what the rest uses |

- **5.4–5.5** — handoff, boundaries enforcement, `CONSTITUTION.md` → `CONSTRAINTS.md` in `kaizen
  upgrade`.
- **6.0** — deprecated skills, 20 agents, deprecated scripts and `kaizen-ops` removed; docs rewrite;
  new video.
