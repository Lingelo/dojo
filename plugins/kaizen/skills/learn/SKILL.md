---
name: learn
description: Keeps the project's memory — captures one solved problem as a durable learning in docs/learnings/ (validated frontmatter, corpus vocabulary, updated rather than duplicated), harvests every lesson of a finished piece of work one at a time, or prunes the learnings that went stale or duplicate. Kaizen's hooks add the matching learnings to Claude's context when agent-skills' SPEC.md or tasks/ are written, so the next spec and plan read them back. Use when the user says "capture this", "remember this", "write a learning", "what did we learn", "clean up the learnings", /kaizen:learn [harvest | prune].
allowed-tools: Bash(node:*), Bash(git:*), Read, Write, Edit, Glob, Grep, AskUserQuestion
argument-hint: "[context] [harvest | prune] [mode:auto]"
---

# Learn — each unit of work makes the next one easier

## Overview

A learning is a lesson a future developer would otherwise pay for again: a surprising root cause, a
framework trap, what did **not** work and why, a decision costly to reconstruct. It lives in
`<docs>/learnings/<folder>/<slug>.md`, one per file, and comes back by itself: when agent-skills'
`SPEC.md` or `tasks/plan.md` is written, Kaizen adds the matching learnings to Claude's context.

Read `${CLAUDE_PLUGIN_ROOT}/references/conventions.md` and
`${CLAUDE_PLUGIN_ROOT}/references/learnings-schema.md`. `K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

Three modes: **capture** (default, one learning), **harvest** (every lesson of a branch, one run each),
**prune** (keep the corpus true). `mode:auto`: no question, and the report ends with exactly
`Learning written: <path>` or `Learning not written: <reason>`.

## When to Use

- A problem was just solved and verified, and its cause was not obvious.
- A piece of work is finished (`harvest`): several lessons, none should be lost.
- Learnings are old, contradicted by the code, or duplicated (`prune`; `/kaizen:metrics` lists the ones
  never cited).

**Not for:** documenting what the code already says, or a typo — the durability test says no.

## Process — capture

1. **Durability test.** The problem is solved **and verified** (green tests, observed behavior).
   Without this document, would someone reading the final code make the mistake again or redo the
   investigation? No → write nothing, say in one sentence where the knowledge already lives (test,
   commit, comment).
2. **Gather** from the session and `git log`/`git diff`: symptoms (exact messages), what was tried and
   failed, the solution, **why** it works, how to avoid it. One question at most if a key element is
   missing.
3. **Look for an existing one.** `node "$K" learnings search <keywords>`, read the candidates: same
   problem and still true → complete it; now wrong → **update** it; partial duplicate → note it for
   `prune`.
4. **Classify.** `node "$K" learnings stats` for the corpus vocabulary; track bug or knowledge through
   `problem_type`, then `component`, `root_cause`, folder. Severity = how serious what it prevents is.
5. **Write** from `${CLAUDE_PLUGIN_ROOT}/templates/learning-bug.md` or `learning-knowledge.md`, in the
   configured language (frontmatter keys unchanged). Every path, symbol and command is checked against
   the current tree. No absolute path, secret or personal data. Keep "What didn't work". Add `files:`
   (globs) when the lesson is about specific files. `retire_when` only for a state outside the repo,
   with a check that runs without changing it (issue URL, `npm view`), checked now.
6. **Validate.** `node "$K" learnings validate <file>` until green.
7. **Report** the path, new or updated, the track, and the words it will be found by.

## Process — harvest

1. List candidates from the branch: fix and revert commits, review findings fixed, what the
   conversation shows was tried and failed. One line each: symptom → cause, with its evidence.
2. Durability test on each; search for existing ones (update candidates).
3. Show the list (new / update / dropped and why), ask which to write (`multiSelect`); `mode:auto`: all
   survivors.
4. Run **capture** once per chosen learning — never one merged document.

## Process — prune

1. `node "$K" learnings list`, `node "$K" learnings list --retire`, and `node "$K" metrics` →
   `kaizen_loop.learnings_never_cited_sample`.
2. For each candidate, check against the current code: paths and symbols still there? `retire_when` met
   (run its check)? Same lesson elsewhere?
3. Decide, with the evidence quoted: **Keep** · **Update** (code moved) · **Merge** (duplicates, keep the
   better one) · **Replace** (lesson now wrong) · **Delete** (the problem cannot happen any more). A
   `retire_when` met while the workaround is still in the code: keep, and recommend removing the
   workaround — never remove it yourself.
4. Ask before deleting or merging (`mode:auto`: only Update and Keep, report the rest). Never touch
   product code.

## Common Rationalizations

| Excuse | Reality |
|---|---|
| "Everything we did today is worth keeping." | A learning nobody needs is noise that hides the one that matters. Apply the durability test. |
| "I'll write one big summary of the session." | A batch mixes vocabularies and is never found. One learning per problem. |
| "The commit message says it all." | Then no learning — say so. If it does not (the dead ends, the why), the learning does. |
| "This old learning is probably still right." | Check the paths and symbols it cites. A wrong learning misleads the next plan. |

## Red Flags

- A learning about a problem not yet verified as solved.
- Paths or symbols that do not exist in the current tree.
- A new file when `learnings search` returned the same problem.
- Product code changed during `prune`.

## Verification

- [ ] `node "$K" learnings validate` is green for every file written.
- [ ] Each claim about the code was checked against the current tree.
- [ ] The report names what was written, updated, dropped — and why.
