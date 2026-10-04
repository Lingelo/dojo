---
name: prune-learnings
description: Maintains the learnings in docs/learnings/ against the current code — detects stale learnings (vanished paths, symbols, behaviors), duplicates, overlaps and contradictions, then applies Keep / Update / Merge / Replace / Delete with evidence, and returns a full report. Use when the user says "clean up the learnings", "audit docs/learnings", after a big refactor, or when a learning turned out wrong: /kaizen:prune-learnings [area]. Never changes product code.
allowed-tools: Bash(node:*), Bash(git:*), Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion
argument-hint: "[area: folder, file, module or keyword] [prune] [mode:auto]"
---

# Prune learnings — keeping the learnings trustworthy

Learnings only compound value if **each one** is reliable: a wrong learning is worse than none, because
`/kaizen:plan` and `/kaizen:review` apply it. This skill audits the corpus against the current code,
applies the actions the evidence justifies, and returns a report.

Read `${CLAUDE_PLUGIN_ROOT}/references/conventions.md` and
`${CLAUDE_PLUGIN_ROOT}/references/learnings-schema.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

**Two limits, whatever the evidence:** this skill **never** changes product code, and **never** changes
a skill, a runbook or an instructions file — when a learning contradicts an instruction, it **reports**
it.

**Modes.** Interactive (default): applies Keep/Update/Merge without asking, **asks** before Replace and
Delete. `mode:auto`: applies Keep/Update/Merge, and for Replace/Delete only adds at the top of the
learning `> ⚠️ Possibly stale (prune-learnings of <date>): <reason>` and lists them under
"Recommended".

## 1. Scope

Candidates: the `.md` files under `<root>/learnings/` (excluding `README.md`). An area hint filters
(folder, module, keyword through `node "$K" learnings search`); a hint matching nothing **never widens**
the scope: say so and stop. Empty corpus: say so and suggest `/kaizen:learn`. Start with
`node "$K" learnings validate` (broken frontmatter = an update to make).

## 2. Investigate

For each learning, against the current tree:
- **Anchors** — do the cited paths, files, functions, commands, options and versions still exist?
  (`Glob`, `Grep`, `git log --follow` for a moved file)
- **Behavior** — are the described cause and solution still true? Is the fix still in the code, or was
  it removed/replaced? Does a test now cover the case?
- **`retire_when`** — is the external condition met (upstream bug fixed, version superseded)?
- **Named instructions** — if a knowledge-track learning names an instructions file (a skill, a runbook,
  `CLAUDE.md`), read it; if it prescribes something else, report both quotes and what the code does —
  without editing the instruction.
- **As a whole** — duplicates, overlaps, learnings superseding each other, **contradictions** (a
  contradiction actively misleads: it comes before individual staleness).

More than 8 learnings: spread the investigation across `general-purpose` agents in parallel (read-only),
by thematic batches, each returning for each learning: anchors verified/broken with evidence, behavior
still true/false/unverifiable with evidence, overlaps spotted.

**Unverifiable is not false.** A learning that can be neither confirmed nor refuted (production
behavior, external service) stays, with a note.

## 3. Classify — one outcome per learning

| Outcome | When |
|---|---|
| **Keep** | accurate and distinct |
| **Update** | the substance holds, details drifted (moved path, changed name, invalid frontmatter, dead link) |
| **Merge** | two or more learnings say the same thing: keep the best one, fold in the others' unique contribution, delete the others |
| **Replace** | the substance became wrong but the area deserves a learning: rewrite from the current code |
| **Delete** | the problem can no longer happen (code deleted, constraint gone) and the learning teaches nothing useful anymore |

Update / Replace boundary: if a reader of the old version would make a **wrong decision**, it is
Replace. No in-place archiving: git history is the archive.

**Pruning ("prune", on explicit confirmation)**: besides accuracy, judge **value**: delete or shorten an
accurate learning whose reasoning is now carried by a test, a comment or the instructions file — each
cut **quotes** that file. Without an explicit request, an accurate learning is never deleted for
redundancy.

## 4. Execute

One action per learning, per its class. Update and replace: current template and schema,
`node "$K" learnings validate` until green. Merge: update other learnings' links to the deleted files.
After a deletion or a move, `Grep` the references to the path (plans, other learnings, README) and fix
them.

## 5. Report (the deliverable)

In the user's language:

```markdown
## Pruning of docs/learnings/<area> — <date>
Examined: N · Kept: a · Updated: b · Merged: c · Replaced: d · Deleted: e

### Applied
- `path` — **Update**: <what changed> (evidence: `file:line`)
### Recommended (not applied)
- `path` — **Delete?** <reason, evidence>
### Contradictions with instructions
- `learning` vs `instruction` — "quote A" / "quote B" — the code follows: …
### Possible regressions
- accurate learning but the code no longer respects it → to check on the product side
```

## 6. Commit and findability

Nothing changed → no commit. Otherwise, stage **only** the files changed by this skill and commit
(`docs(<JIRA>): prune learnings in <area>`) — on a dedicated branch if you are on the default branch
and interactive, otherwise ask. Finally, check that `CLAUDE.md` does lead to `<root>/learnings/` (same
rule as `/kaizen:learn`, with approval).
