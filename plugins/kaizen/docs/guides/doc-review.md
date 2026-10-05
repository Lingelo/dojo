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

| Reviewer | When | Looks for |
|---|---|---|
| `plan-coherence-reviewer` | always | contradictions between sections, drifting vocabulary, broken references, ambiguities, a goal that does not survive its mechanism, traceability |
| `plan-feasibility-reviewer` | always | nonexistent interfaces (it reads the code), missing dependencies, impossible order, illusory rollback, nonexistent verification commands |
| `plan-scope-reviewer` | every ready plan; many requirements | unrequested mechanisms, scope drift, slices too big, weak constitution exceptions |
| `plan-security-reviewer` | auth, sensitive data, payment, endpoints, integrations | missing threats, unspecified authorization, secrets, trust boundaries |
| `plan-adversarial-reviewer` | high-stakes area, new abstraction, plan without a brainstorm, widened scope | wrong premises, unverified assumptions, irreversible commitments, 6-month failure scenario |
| `plan-design-reviewer` | screens, forms, journeys | unspecified states (empty, loading, error), accessibility, responsiveness, consistency with the design system |

The chosen team is announced to you, with the reason for each conditional reviewer. Each reviewer runs
with the model of its role ([`models`](../configuration.md#models--the-right-model-for-each-task)).

## How the findings are handled

1. Deduplicated. Two reviewers saying the same thing raise confidence.
2. Filtered:
   - confidence 75 or 100 kept;
   - confidence 50 only if P0;
   - quote not found in the plan: finding rejected.
3. **Each P0 and P1 is checked again by the orchestrator**, which rereads the passage and the quoted
   code.
4. A finding challenging a decision already made without proving it cannot work is removed.
5. Fixes:
   - `safe_auto` (reference, count, term): applied directly;
   - `gated_auto` that clarifies without changing a decision: applied too;
   - the rest becomes a question for you.

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
