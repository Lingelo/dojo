# `/kaizen:doc-review`

> Review the plan **before** building: a defect fixed in a plan costs a sentence, in code one more PR.

`doc-review` combines a deterministic check (`plan check`) and specialized reviewers in parallel. What
is mechanical is fixed directly. What requires a decision is presented to you, one question at a time.
An already good plan receives no change.

## At a glance

| | |
|---|---|
| **What it does** | `plan check`, then 2 to 6 reviewers, verification of their findings, fixes in place, decisions put to you |
| **When to use it** | Automatically at the end of every `/kaizen:plan`; manually on a hand-written or old plan |
| **When not to use it** | Reviewing **code** (→ [review](review.md)) |
| **What it produces** | The plan fixed in place, and a report: ✅ / ⚠️ / ⛔ verdict, team, fixes applied, decisions made, remaining points |
| **What next** | `/kaizen:work` if ✅; answer the decisions if ⚠️; back to the plan if ⛔ |

## Examples

```text
/kaizen:doc-review                                    # latest plan
/kaizen:doc-review docs/plans/2026-10-02-1430-feat-orders-csv-export-plan.md
/kaizen:doc-review docs/plans/… mode:auto             # without questions (used by plan and autopilot)
```

## The review team

`plan-coherence-reviewer` and `plan-feasibility-reviewer` always (feasibility reads the code), then
`plan-scope-reviewer`, `plan-security-reviewer`, `plan-adversarial-reviewer` and `plan-design-reviewer`
when the plan calls for them. The chosen team is announced with the reason for each conditional
reviewer. Who looks for what: [agents and models](../concepts/agents-and-models.md#plan-reviewers-kaizendoc-review).

## How the findings are handled

Deduplicated, filtered by confidence, each P0 and P1 checked again by the orchestrator; a finding that
challenges a settled decision without proving it cannot work is removed. Mechanical fixes are applied
directly, the rest becomes a question for you. Details: [plan review](../concepts/review.md#plan-review).

Real example, from an evaluation: on a slug generation plan, the adversarial reviewer found that the
accent normalization does not decompose `œ`, `æ` and `ß`. The plan was fixed with a new acceptance
example: "Cœur de ß" → `coeur-de-ss`.

## Good to know

- ⛔ if a P0 remains or `plan check` still fails.
- The **profile** sets the team: `lean` = `plan check` + coherence only; `full` = adversarial reviewer
  always. See [Configuration](../configuration.md#profile).
- Fixes are made **in the document's format**, without a stacked "corrections" section.
- Reviewer contract: [`references/doc-review-contract.md`](../../references/doc-review-contract.md).

## See also

In depth: [review](../concepts/review.md#plan-review).


[plan](plan.md) · [review](review.md) · [constitution](constitution.md)
