# `/kaizen:learn`

> Write **one** durable learning in `docs/learnings/`, where the next plan and the next review will read
> it. This is the step that makes the next cycle easier.

## At a glance

| | |
|---|---|
| **What it does** | Applies the durability test, gathers the problem, symptoms, dead ends, solution and prevention, looks for an existing learning to update, classifies with the corpus vocabulary, writes and validates |
| **When to use it** | After **verified** work that produced non-obvious reasoning: an API trap, a surprising cause, a costly dead end, a decision hard to reconstruct |
| **When not to use it** | A routine fix the test and the commit message already explain; a problem not solved yet |
| **What it produces** | `docs/learnings/<category>/<title>.md`, new or updated, validated frontmatter; or "Learning not written: <reason>" |
| **What next** | The learning is read by `learnings-researcher` at every plan, brainstorm, review and debug |

## Examples

```text
/kaizen:learn
/kaizen:learn the UTF-8 BOM for Excel
/kaizen:learn mode:auto                 # no questions (used by work, autopilot, debug)
```

![How learnings are written, read back, measured and pruned](../media/diagrams/learnings-loop.svg)

In depth: [learnings](../concepts/learnings.md).

## The durability test

> If this document disappeared, would a future developer reading the final implementation probably
> make the mistake again, or redo the same investigation?

If the answer is no, nothing is written and Claude says why (a typo fixed in the README: "the diff and
the commit message are enough").

## A learning

A Markdown file in `docs/learnings/` with a validated frontmatter, on one of two tracks: **bug**
(`symptoms`, `root_cause`, `resolution_type` required) or **knowledge** (`applies_when` recommended).
Schema and a full example: [learnings](../concepts/learnings.md#format).

## Good to know

- **One learning per run.** Several learnings means several successive runs.
- **Corpus vocabulary first**: `component`, `root_cause` and the folder reuse the values already used in
  `docs/learnings/` (`node $K learnings stats`), so that searches find them.
- An existing learning that became wrong is **updated**, not duplicated.
- A learning that holds for the whole team can become a **pack rule**: Claude proposes it.
- `retire_when`: only if the learning depends on a state outside the repo (upstream bug, tool version).
- Nothing secret or personal in a learning (`<REDACTED>`).

## See also

[prune-learnings](prune-learnings.md) · [Kaizen Packs](../packs.md) · [metrics](metrics.md)
