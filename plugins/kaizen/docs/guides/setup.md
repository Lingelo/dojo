# `/kaizen:setup` — Kaizen in a repository, and where it stands

```
/kaizen:setup          # set up, or say what to run next
/kaizen:setup check    # read-only: report the guard rails, write nothing
```

## When

- The first time in a repository, or in a fresh clone where `kaizen doctor` shows ⚠.
- "Where are we? What do I run now?" — it names the next command.
- After a Kaizen update: `kaizen upgrade` lists what the repository still has to change.

Not for writing a spec, a plan or code: that is `/kaizen:spec`, `/kaizen:plan`, `/kaizen:build`
(agent-skills).

## What it does

1. **Diagnoses**: `kaizen doctor` and `kaizen status`. With `check`, it stops here.
2. **Initializes** `.kaizen/config.json` and `docs/learnings/` when they are missing.
3. **Validates the verification commands**: shows the `test`, `lint`, `typecheck` it detected, asks
   whether they are right and runs them once. These are what the [quality gate](../concepts/gates.md#the-quality-gate)
   runs after every turn that edits code; a slow suite goes to `gate.targeted`.
4. **Declares both plugins** in the versioned `.claude/settings.json` (`kaizen@dojo`,
   `agent-skills@dojo`, the dojo marketplace) — asks first. Every clone and cloud session then gets them.
5. **Offers the git hooks** (`install git-hooks`): no unreviewed push and no committed secret, even
   outside Claude Code.
6. **Makes the learnings findable** for other tools: with your approval, a line in `CLAUDE.md` or
   `AGENTS.md`.
7. **Lists pending migrations** (`kaizen upgrade`) and offers to apply the automatable ones.
8. **Names the next command**, in the [decision order](../concepts/the-loop.md#knowing-where-you-are).

## What you get

```
✔ config        .kaizen/config.json
✔ agent_skills  agent-skills@dojo enabled
⚠ git_hooks     not installed — node "$K" install git-hooks
✔ verify        test: npm test · lint: npm run lint
Next: /kaizen:spec <what to build>
```

Every ⚠ is a guard rail that is off, with its fix: [Doctor](../concepts/gates.md#doctor).

## Files written

`.kaizen/config.json` ([Configuration](../reference/configuration.md)), `docs/learnings/`, and with your
approval `.claude/settings.json`, `.githooks/`, one line in `CLAUDE.md`/`AGENTS.md`. Commit them: the
team shares them.

## Optional next step

`/kaizen:constraints` (agent-skills) writes the project's quality bar, `CONSTRAINTS.md`, and installs its
floor guard. `kaizen doctor` then checks that the guard is wired (`floor_guard`).
