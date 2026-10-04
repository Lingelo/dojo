---
name: learn
description: Captures a solved problem as a durable learning in docs/learnings/ (validated frontmatter, corpus vocabulary, update rather than duplicate) so the next /kaizen:plan and the next /kaizen:review read it back — the step that makes each cycle make the next one easier. Use after verified work that produced non-obvious reasoning (a trap, a surprising cause, a decision costly to rediscover): "document this", "remember the lesson", /kaizen:learn. Not for a routine fix the code already explains.
allowed-tools: Bash(node:*), Bash(git:*), Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion
argument-hint: "[short context] [mode:auto]"
---

# Learn — capturing the learning

**Outcome:** **one** qualified learning written (or updated) under `<root>/learnings/`, checked against
the current code, validated by the CLI, and findable by the next agent. If no learning qualifies:
nothing is written and the report says why.

**One learning per run.** A session that produced several = several successive runs, never a batch (a
batch mixes vocabularies and produces catch-all documents).

Read `${CLAUDE_PLUGIN_ROOT}/references/conventions.md` and
`${CLAUDE_PLUGIN_ROOT}/references/learnings-schema.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

**`mode:auto`** (set by `/kaizen:autopilot` or `/kaizen:work`): no questions; no change to the project's
instructions; end with exactly `Learning written: <path>` or `Learning not written: <reason>`.

## 1. Preconditions — the durability test

The problem is **solved and verified** (green tests, observed behavior). Then apply the counterfactual
from `learnings-schema.md`: without this document, would a future developer reading the final code make
the mistake again or redo the same investigation? Judge from the session, without asking. An explicit
invocation asks for the judgment now, it does not lower the bar.

Typically qualifying: a surprising root cause, an API or framework trap, what **did not** work and why,
an architecture decision costly to reconstruct, a convention set after discussion. Not qualifying: a
typo, a fix the test and the commit message fully explain, an explanation of what the code already
says.

Test failed → write nothing; say in one or two sentences why, and where the knowledge already lives
(test, comment, commit).

## 2. Gather

From the session (and the branch's `git log`/`git diff`): problem and impact, exact symptoms (error
messages), what was tried and failed, the solution, **why** it works, how to avoid recurrence.
Interactively, if a key element is missing (e.g. the exact error message), a single question.

## 3. Look for what exists

`node "$K" learnings search <keywords>` then read the candidates. An existing learning on the **same**
problem:
- still accurate → complete it (new symptom, new variant) rather than creating one;
- now inaccurate or incomplete → **update it**: leaving it would mislead;
- a partial duplicate elsewhere → mention it in the report for `/kaizen:prune-learnings`.

## 4. Classify

`node "$K" learnings stats` for the corpus vocabulary. Choose the track (bug / knowledge) through
`problem_type`, then `component`, `root_cause`, folder per the "corpus first" rule. Severity = how
serious what the learning prevents is, not how hard the investigation was.

## 5. Write

- Template: `${CLAUDE_PLUGIN_ROOT}/templates/learning-bug.md` or `learning-knowledge.md`, in the
  configured language (frontmatter keys unchanged).
- Path: `<root>/learnings/<folder>/<title-slug>.md`.
- Every claim about the code is **checked against the current tree**: existing paths, quoted symbols
  present, exact commands. No absolute path, no secret, no personal data (replace with `<REDACTED>`).
- The "What didn't work" section is often the most valuable: do not skip it if the session hit dead
  ends.
- `retire_when` only if the learning depends on a state **outside the repo** (open upstream bug, tool
  version) — with how to check it.
- Validate: `node "$K" learnings validate <file>`; fix until green.

## 6. Promote (interactive only)

If the learning is actually a **prescriptive rule** valid for the whole team ("every CSV export starts
with a BOM"), offer to also add it to a declared Kaizen Pack (`node "$K" packs`) or create one
(`node "$K" pack new <name>`): a rule file with `title`, `applies_when`, `tags`, and a body citing the
learning. Packs are read by plan and review; the learning keeps the story.

## 7. Vocabulary

If the learning names a domain concept used under several names in the code or the conversation and
`CONCEPTS.md` exists, add or refine the entry (canonical name, one-sentence definition, aliases to
avoid). Do not create `CONCEPTS.md` here.

## 8. Be findable (interactive, with approval)

Check that the project's instructions (`CLAUDE.md`) lead an agent to `<root>/learnings/` before working
in a documented area. Otherwise, offer to add the smallest useful sentence, for example:

> Before planning or debugging, look for the project's learnings: `docs/learnings/` (frontmatter:
> module, tags, symptoms, applies_when).

Only edit an existing instructions file, never a new one.

## 9. Report

```
Learning written: docs/learnings/runtime-errors/csv-export-excel-accents.md  (new | updated)
- track: bug · problem_type: runtime_error · module: exports
- validated ✔ · findable by: csv, excel, encoding, bom
- read by: the next /kaizen:plan and /kaizen:review touching exports
```

Only commit if the user asks or if the caller (`work`, `autopilot`) handles the commit; in that case,
only the files written by this skill.
