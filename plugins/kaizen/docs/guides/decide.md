# `/kaizen:decide`

> An evidence-based verdict for a hard or irreversible decision, then an ADR so that the reason
> outlives the conversation.

Adopting a technology, choosing between two architectures, migrating, accepting debt: `decide`
compares real options on evidence from the project (code, learnings, constitution, past ADRs) and dated
external sources. It gives a recommendation with its **confidence level** and the **signal that would
change its mind**.

## At a glance

| | |
|---|---|
| **What it does** | Frames the question, anchors (past decisions, code, external docs), compares 2 to 4 options including "do nothing", attacks its own recommendation, writes the ADR if the decision is costly to undo (otherwise answers simply) |
| **When to use it** | "Should we adopt X?", "A or B?", "do we migrate to…?", a plan KTD too heavy for one line, "document this decision" |
| **When not to use it** | A decision easy to undo (a revert is enough): just ask; looking for ideas (→ [ideate](ideate.md)) |
| **What it produces** | A verdict in the chat, then `docs/adr/NNNN-<title>.md` (status `proposed` or `accepted`) |
| **What next** | The ADR is cited by the plan concerned; Claude proposes a pack rule or an amendment if the decision creates a durable rule |

## Examples

```text
/kaizen:decide Temporal or keep Sidekiq for the billing workflows?
/kaizen:decide move from REST to GraphQL for the mobile API?
/kaizen:decide adr-only we chose Postgres LISTEN/NOTIFY over Redis for notifications
```

## How it goes

1. **Framing**: a decidable question, its **reversibility** (easy, costly, irreversible) and the
   criteria that matter here. The more irreversible, the higher the evidence bar.
2. **Anchoring**, in parallel:
   - past ADRs and learnings (mandatory);
   - the code, through `repo-researcher`;
   - the history, through `git-historian`;
   - external sources, through `docs-researcher`: maturity, maintenance, license, compatibility with
     **your** versions, primary and dated sources.
3. **Comparison**: a criteria × options table, and the prose explaining what the table does not say.
4. **Pre-mortem**: "in a year, this decision turned out wrong: why?".
5. **Verdict**, in this format:

   ```markdown
   **Recommendation: B** — confidence medium
   Why: …   Under which conditions: …   What would change my mind: …
   Cost / next step: a pilot behind a flag on a single workflow
   ```

6. **You decide.** Your decision stands, even if it differs from the recommendation. The ADR records
   both.

## The ADR

```markdown
---
title: Exports go through a job queue
date: 2026-10-02
status: accepted          # proposed | accepted | rejected | superseded
deciders: [angelo]
reversibility: costly
review_by: 2027-04-01
artifact: kaizen-adr/v1
---
# 0003. Exports go through a job queue
## Context · ## Options · ## Decision · ## Consequences · ## Review signal
```

Automatic numbering: `node $K adr new --title "…"`. List: `node $K adr list`. An ADR replacing another
sets the old one to `superseded`. Template: [`templates/adr.md`](../../templates/adr.md).

## Good to know

- **No verdict without evidence.** If a decisive piece of information is missing and cannot be found,
  the answer is "Blocked — missing context", with what it takes to unblock.
- ADRs are read by `learnings-researcher`: an accepted decision constrains the following plans.

## See also

In depth: [plans](../concepts/plans.md#key-technical-decisions).


[plan](plan.md) · [constitution](constitution.md) · [learn](learn.md)
