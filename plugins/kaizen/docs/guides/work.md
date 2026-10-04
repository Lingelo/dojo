# `/kaizen:work`

> Execute the plan: dedicated branch, one unit at a time, test first, one commit per unit, and a gate
> that prevents finishing while things are red.

## At a glance

| | |
|---|---|
| **What it does** | Prepares the workspace, turns the gate on, runs each unit (red evidence → implementation → verification → commit), then size, plan coverage, simplification, **mandatory review** |
| **When to use it** | A ready plan (`plan check` green); a concrete, bounded request |
| **When not to use it** | Fuzzy requirements (→ [brainstorm](brainstorm.md)); plan not ready (→ [plan](plan.md)); bug without a known cause (→ [debug](debug.md)) |
| **What it produces** | A branch, one conventional commit per unit, recorded evidence, a review report |
| **What next** | Ship with `/kaizen:ship` (recommended), keep it local, or capture first (`/kaizen:learn`) |

## Examples

```text
/kaizen:work                                     # latest plan (confirmed before starting)
/kaizen:work docs/plans/2026-10-02-1430-feat-orders-csv-export-plan.md
/kaizen:work rename the amount field to total_cents in the invoices serializer
```

## How it goes

1. **Triage**:
   - a plan without units sends you to `/kaizen:plan`;
   - a trivial request is done directly (verification included);
   - a bounded request is split into 2 to 6 announced units;
   - a fuzzy request sends you to plan or brainstorm.
2. **Workspace**:
   - files you had already changed never go into a commit without your approval;
   - on the default branch, a `<type>/<topic>` branch is created, prefixed with the Jira key if known;
   - `node $K gate on` turns the gate on;
   - the plan is read in full, with the learnings and rules it cites and the constitution.
3. **For each unit**:
   1. Find the existing tests.
   2. Choose the evidence strategy:
      - an existing test already red;
      - a strengthened test;
      - a new test;
      - a characterization of what exists;
      - or a justified exception.
   3. Write the test, then **observe that it fails for the right reason**.
   4. Implement following the cited pattern.
   5. Rerun the targeted tests and check the cross-cutting impact.
   6. Record the evidence.
   7. Commit **only the unit's files**: `feat(SHOP-412): …`.
4. **Quality**:
   - `node $K verify` (and `--only audit` if dependencies changed);
   - `node $K size`: above the limit, Claude proposes stacked PRs;
   - coverage of each R and AE;
   - simplification;
   - **mandatory `/kaizen:review`**, required by a hook before any `git push`;
   - P0/P1 fixes, then the review is recorded again with its post-fix verdict.
5. **End**: `gate off` and summary, then the offer to ship.

## The gate

While it is active, every end of turn reruns `test`, `lint` and `typecheck`. If one of them is red, the
`Stop` hook refuses the end (code 2) and sends Claude the end of the failing output. After 3 blocks, it
lets through while requiring the failure to be reported to you. It never blocks forever and expires
after 24 h. Settings: [Configuration](../configuration.md#gate--the-stop-hook-quality-gate).

## When it resists

Two failed fixes for the same failure, and Claude stops patching. It names the assumption common to both
attempts and checks it. If it came from the plan and fixing it stays in scope, it fixes it and says so.
Otherwise, it reports a blocker to you.

## Options

| Option | Effect |
|---|---|
| `mode:return` | implementation and local verification only; no review, push or question; structured result (used by `autopilot`) |

## Good to know

- Never `git add -A` or `commit -a`, never a write to the default branch without an explicit request.
- Many independent units: Claude may hand them to subagents in parallel (model of the `implement`
  role), but it stays the integrator (diff inspected, verification rerun, commits made by it).
- Interface touched: check in a browser if the `playwright` plugin is installed.
- A unit applying a learning cites it in its commit (`Applies docs/learnings/…`): that is what
  `/kaizen:metrics` counts as a learning **applied**.
- The gate reruns the checks at every end of turn. Slow suite: configure targeted checks
  (`gate.targeted`, [Configuration](../configuration.md#gate--the-stop-hook-quality-gate)).
- `gate off` records the cycle (duration, tokens of the session and its subagents per role, blocks)
  for `/kaizen:metrics`.

## See also

[plan](plan.md) · [review](review.md) · [ship](ship.md) · [Gate troubleshooting](../troubleshooting.md#the-quality-gate-blocks-the-end-of-the-session)
