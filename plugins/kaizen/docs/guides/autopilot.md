# `/kaizen:autopilot`

> From the request to a PR that "looks ready", autonomously: the right skill at every step, nothing that
> stops without a reason, nothing irreversible without your approval.

## At a glance

| | |
|---|---|
| **What it does** | Routes the request, produces a work source (plan or fix), then chains work → simplification → review with fixes → learn → browser tests → ship → watch-pr |
| **When to use it** | You explicitly want end-to-end work without step-by-step follow-up, ideally **after a brainstorm** |
| **When not to use it** | You want to validate each step (→ `plan`, `work`, `ship` separately); the request is still vague and you are not there to answer |
| **What it produces** | An open PR, reviewed and followed to a true state, and the `DONE` report |
| **What next** | **You merge.** |

## Examples

```text
/kaizen:brainstorm orders CSV export
/kaizen:autopilot                                     # on the plan the brainstorm just wrote
/kaizen:autopilot docs/plans/…-plan.md
/kaizen:autopilot the orders_csv_spec test fails since the Rails upgrade
```

## Routing

| The request is… | Route |
|---|---|
| a plan path, or a plan written in the session | straight to implementation |
| a concrete bug (symptom, red test, ticket) | `debug mode:return` |
| an ambiguous product shape | `brainstorm` if you are there, otherwise `plan mode:return` (assumptions recorded) |
| a result that is not code (ideas, explanation) | the relevant skill, and that is all |
| any other code change | `plan mode:return` |

No shortcut for a "small" change: plan, gate, `verify` and review always run. Only simplification (small
diff) and shipping (no remote) can be skipped.
**Exception, `lean` profile**: a change of about 30 lines, with no risky surface (auth, sensitive data,
migration, public API, dependency), goes straight into `work` without a written plan. Gate, `verify`,
review and shipping stay the same. See [Configuration](../configuration.md#profile).

## The run

1. **Work source**: a ready plan (passing `plan check` and `doc-review`), or a fix from `debug`.
2. `work mode:return`, with the **gate active for the whole run**.
3. Simplification.
4. `review mode:agent`. A finding showing that a settled decision cannot work stops everything, before
   any push.
5. P0/P1 fixes and `gated_auto` P2 fixes, verified and committed.
6. The rest is recorded in the PR ("Open points").
7. `learn mode:auto`, if the run produced a durable learning.
8. Browser tests if the UI is touched and a tool is available.
9. `ship mode:auto`.
10. `watch-pr mode:pipeline`: at most 2 fixes per cause, no disabled test.
11. `gate off`, report, `DONE`.

```text
DONE — Orders CSV export
PR: https://github.com/acme/shop/pull/42 — ✅ looks ready
Plan: docs/plans/…-plan.md · Units: 3/3 · Review: 1 P1 fixed, 2 P3 recorded · Learning: docs/learnings/…
```

## Good to know

- **Questions**: only through the brainstorm, and only if you are present. The rest moves on: what is
  reversible is done, then shown.
- **No review waiver**: autopilot cannot push without a recorded review, and the waiver requires you to
  type a code yourself. Without you, the run stops and says why.
- **What stops the run**:
  - an irreversible action outside what was granted (merge, force push, data deletion, deployment);
  - a work source impossible to produce;
  - an incomplete child return;
  - a settled decision invalidated.

  A stop pushes nothing new and explains how to resume.
- Without a remote: everything stays in local commits.
- The quality of `autopilot` depends on the quality of the plan. Run it after a brainstorm rather than
  on a single sentence.

## See also

[brainstorm](brainstorm.md) · [plan](plan.md) · [work](work.md) · [watch-pr](watch-pr.md)
