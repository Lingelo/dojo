# `/kaizen:brainstorm`

> Define **what** to build, through a one-question-at-a-time dialogue grounded in the code and past
> learnings.

The brainstorm answers "what should it be?" and writes **no code**. It produces the first version of
the **unified plan**: a single file that starts with the requirements, then that `/kaizen:plan`
enriches in place with the "how".

## At a glance

| | |
|---|---|
| **What it does** | Reads the context (code, learnings, packs, constitution), asks the questions that matter, proposes 2 or 3 approaches, writes the requirements |
| **When to use it** | An idea or request still fuzzy; a contested scope; several possible readings |
| **When not to use it** | Bug with a symptom (→ [debug](debug.md)); "give me ideas" (→ [ideate](ideate.md)); already specified work (→ [plan](plan.md)) |
| **What it produces** | Small work: a conclusion in the chat. Otherwise `docs/plans/YYYY-MM-DD-HHMM-<type>-<topic>-plan.md` with a goal capsule and a product contract (R1…, AE1…) |
| **What next** | Menu: plan (recommended), chain everything (`autopilot`), refine, stop |

## Examples

```text
/kaizen:brainstorm CSV export of orders for store managers
/kaizen:brainstorm make payment reminders safer
/kaizen:brainstorm                     # Claude asks what you want to explore
```

![Anatomy of a plan: brainstorm writes the goal and product contract, plan adds the rest in place](../media/diagrams/plan-anatomy.svg)

In depth: [plans](../concepts/plans.md).

## How it goes

1. **Resume**: a recent plan on the same topic is offered for resumption rather than duplicated.
2. **Size**:
   - **light**: a few questions, conclusion in the chat;
   - **standard**: dialogue, approaches and file;
   - **deep**: multiple actors or risk, with a journey analysis on top.
3. **Anchoring**, without disturbing you: the area's code, `CONCEPTS.md`, learnings, packs,
   constitution, and research agents if needed. A contradiction with what exists is shown to you
   **before** going on.
4. **Dialogue**: one question per turn, with Claude's recommendation first. A decision already made in
   the conversation is not asked again. It also runs a pressure test: is it the right problem? is
   there a simpler version? a blind spot (security, existing data, accessibility)?
5. **Approaches**: 2 or 3 truly different ones, with costs and risks. You choose, then Claude writes a
   framing summary to validate.
6. **Writing** the product contract:
   - requirements grouped by concern;
   - acceptance examples for every conditional behavior;
   - decisions annotated "decided in session";
   - fuzzy points marked `[NEEDS CLARIFICATION: question — proposed default]`.
7. **Checks**: `plan check` at the requirements stage, then "ready for planning": complete,
   consistent, focused, actionable.

## What the file contains

```markdown
<!-- kaizen:goal -->
## Goal capsule
**Goal:** a store manager gets in one click a file readable in Excel…

<!-- kaizen:product -->
## Product contract
### Requirements
- R1. The export contains exactly the orders matching the active filters.
### Acceptance examples
- AE1. (covers R1) Given a "shipped" filter, when I export, then…
```

The full contract is in [`references/plan-contract.md`](../../references/plan-contract.md). The plan is
written in the language of the conversation, or the one set in
[`language`](../configuration.md#language).

## Good to know

- A requirement only commits to what you asked for or chose. A safeguard nobody asked for goes into
  "Out of scope" or an open question.
- If the request mixes several topics, Claude proposes handling one. The others become context in the
  "How this work fits together" section.
- `mode:return` (used by `autopilot`): same dialogue, but a structured result instead of the final
  menu.

## See also

[plan](plan.md) · [ideate](ideate.md) · [autopilot](autopilot.md)
