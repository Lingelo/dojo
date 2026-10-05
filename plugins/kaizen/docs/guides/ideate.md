# `/kaizen:ideate`

> "What would be worth building?": many ideas grounded in the repo, all critiqued, 5 to 7 survivors
> explained.

`ideate` comes **before** the brainstorm. It does not refine an idea, it looks for some. Each idea must
have a **verifiable basis** (a line of code, an issue, a learning, an external source, or reasoning
written end to end). An idea without a basis is thrown away, however attractive.

## At a glance

| | |
|---|---|
| **What it does** | Anchoring in the repo, 5 idea generators in parallel (each with an angle), cold verification by an agent that did not see the generation, motivated rejection, ranking |
| **When to use it** | "What could we improve in X?", "surprise me", when preparing a quarter, after a series of bugs in an area |
| **When not to use it** | You already have an idea to refine (→ [brainstorm](brainstorm.md)); you must choose between two options (→ [decide](decide.md)) |
| **What it produces** | `docs/ideation/YYYY-MM-DD-<topic>-ideation.md`: anchoring, axes, ranked ideas, combinations, motivated rejections |
| **What next** | `/kaizen:brainstorm` on the chosen idea |

## Examples

```text
/kaizen:ideate the checkout flow
/kaizen:ideate surprise me
/kaizen:ideate onboarding of new developers top 3
/kaizen:ideate the billing page quick
/kaizen:ideate observability deep
```

## How it goes

1. **Topic**: without a topic, Claude asks ("Surprise me" is a real option); if nobody can answer, it
   goes with "Surprise me" and says so. The requested scope is respected: "the billing page" does not
   spill over onto the whole product.
2. **Anchoring**:
   - repo, recent plans, learnings (areas with many bugs are documented frictions);
   - open issues grouped into themes, if `gh` is available.
3. **Axes**: the topic is split into 3 to 5 orthogonal parts, so as not to concentrate everything on
   one.
4. **Generation**: 5 agents in parallel, with 6 to 8 ideas each. The angles:
   - frictions;
   - inversion, removal or automation;
   - broken assumptions;
   - leverage;
   - analogies from other domains and flipped constraints.
5. **Combinations**: ideas from two angles worth more together than apart.
6. **Critique**: a fresh agent checks each basis, then Claude decides. Each rejection has a reason:
   too vague, not grounded, duplicate, too expensive, outside the scope…
7. **Document** and a 5-to-7-line summary in the chat.

## Options

| Option | Effect |
|---|---|
| `surprise me` | no imposed topic; each angle picks its own |
| `top N` | N survivors (generation does not change) |
| `quick` | 3 to 4 ideas per angle |
| `deep` | more verification per idea |

## Good to know

- The cost (number of agents) is announced before launching.
- An ideation document less than 30 days old on the same topic is **enriched** rather than duplicated.
- `ideate` never plans: it always sends to the brainstorm.

## See also

[brainstorm](brainstorm.md) · [decide](decide.md)
