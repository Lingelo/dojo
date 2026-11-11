# `/kaizen:learn` — capture, harvest and prune learnings

```
/kaizen:learn                   # capture the problem just solved
/kaizen:learn the CSV encoding  # with a hint of what to capture
/kaizen:learn harvest           # every lesson of the branch, one learning each
/kaizen:learn prune             # keep the corpus true
```

How learnings work — the format, the durability test, how they come back: [Learnings](../concepts/learnings.md).

## When

- **Capture**: a problem was just solved **and verified**, and its cause was not obvious.
- **Harvest**: a piece of work is finished and taught several things; none should be lost.
- **Prune**: learnings are old, contradicted by the code or duplicated — `/kaizen:metrics` lists the
  ones never cited.

## Capture

Claude applies the durability test first. If the knowledge already lives in a test, a commit message or
a comment, it **writes nothing** and says where it lives. Otherwise it gathers the exact symptoms, what
was tried and failed, the fix and why it works; searches for an existing learning on the same problem
(and updates it rather than adding a duplicate); classifies it with the corpus vocabulary; writes it from
the template; and validates it (`kaizen learnings validate`). It adds `files:` when the lesson is about
specific files: editing them later brings it back.

```
Learning written: docs/learnings/integration-issues/csv-export-excel-bom.md
Track: bug · found by: csv, excel, encoding, bom · comes back when src/exports/** is edited
```

## Harvest

Claude lists the candidates of the branch — fix and revert commits, review findings fixed, dead ends
visible in the conversation — one line each with its evidence, drops those that fail the durability
test, and asks which to write. Each chosen one is a separate capture: never one merged document.

## Prune

Claude checks each candidate against the current code — paths and symbols still there, `retire_when`
met, the same lesson elsewhere — and decides with the evidence: **Keep**, **Update**, **Merge**,
**Replace** or **Delete**. It asks before deleting or merging, and never touches product code. A
`retire_when` met while the workaround is still in the code: it keeps the learning and recommends
removing the workaround.

## Unattended

`mode:auto` asks nothing and ends with exactly `Learning written: <path>` or
`Learning not written: <reason>` — for a scheduled task or a script. Prune in `mode:auto` only updates
and keeps; it reports the rest.

## Without the skill

`node $K learnings search <words…>`, `learnings validate [files…]`, `learnings list [--retire]`,
`learnings stats` ([CLI](../reference/cli.md#learnings)).
