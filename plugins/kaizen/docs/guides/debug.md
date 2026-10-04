# `/kaizen:debug`

> Find the cause, **then** fix: full causal chain with evidence before any fix, one hypothesis at a
> time.

## At a glance

| | |
|---|---|
| **What it does** | Triage → investigation (reproduction, environment, backward tracing, history, learnings) → root cause → test-first fix → handover |
| **When to use it** | "It crashes", "this test fails", "it is slow", "why does X…?", a bug ticket, a red CI |
| **When not to use it** | A feature to build (→ [plan](plan.md)); a production incident to analyze after the fact (→ [postmortem](postmortem.md)) |
| **What it produces** | A debug summary (problem, root cause with `file:line`, tests, fix, prevention, confidence); if you choose it, a fix committed on `fix/…` |
| **What next** | Review of the fix, commit, PR if possible, and `/kaizen:learn` if the cause was surprising |

## Examples

```text
/kaizen:debug TypeError: Cannot read properties of undefined (reading 'total') in /orders/export
/kaizen:debug spec/exports/orders_csv_spec.rb fails since this morning
/kaizen:debug #482
/kaizen:debug the export takes 40 s instead of 2
```

## How it goes

1. **Triage**: the issue is read if a reference is given. Claude restates: "when <trigger>, we observe
   <symptom> instead of <expected>", and searches the **learnings**: a bug already seen shortens
   everything.
2. **Investigation**:
   - the smallest possible reproduction, ideally a red test;
   - environment health: dependencies, cache, environment variables. `git stash` tests whether the bug
     comes from the work in progress;
   - backward tracing from the symptom;
   - `git log -S` and `git bisect run` if "it worked before".
3. **Root cause**: each hypothesis is written with a verifiable prediction, and each experiment changes
   only one variable. After 2 or 3 refuted hypotheses, Claude asks itself **why its mental model is
   wrong** instead of guessing again.
4. **The gate**: Claude first writes the whole diagnosis (causal chain, proposed fix, tests). **Then**
   it asks you:
   - fix now;
   - diagnosis only;
   - rethink the design, if no clean fix exists in the current design.
5. **Fix**:
   1. regression test where existing coverage owns this behavior;
   2. watched red for the right reason;
   3. minimal fix at the cause;
   4. green;
   5. search for the same faulty pattern elsewhere in the repo.
6. **Handover**: summary, review of the fix, commit of **only** the fix files, PR if the tree was clean
   and a remote allows it.

## Options

| Option | Effect |
|---|---|
| `mode:return` | without questions; only applies a **convergent** fix (restoring the intended behavior). A fix that would reverse a deliberate decision is deferred. Used by `autopilot` and `watch-pr`. |

## Good to know

- Three failed fixes → stop. The stated root cause is probably wrong.
- Secrets in logs are replaced by `<REDACTED>` before being shown or written.
- Without a provided ticket, no ticket is created "to be tidy".
- "Flaky" is not a cause: a second identical failure is real.

## See also

[postmortem](postmortem.md) · [learn](learn.md) · [watch-pr](watch-pr.md)
