# `/kaizen:help`

> Know what Kaizen is and **which command to run now**, from your situation and the repo's real state.

## At a glance

| | |
|---|---|
| **What it does** | Diagnoses the repo (`node $K status`), explains Kaizen, and recommends the right command with its exact invocation |
| **When to use it** | "Where do I start?", "which command for…?", "where am I?", "what is the push gate?" |
| **When not to use it** | You already know which command to run: run it directly |
| **What it produces** | An answer in the conversation. No writes, no command run on your behalf |
| **What next** | The recommended command |

## Examples

```text
/kaizen:help                                  # overview + where the repo stands + what to do next
/kaizen:help I have a rounding bug on totals
/kaizen:help I want to ship my branch
/kaizen:help what is the push gate?
```

## The diagnosis

`node $K status` (or `--json`) summarizes the repo's state in the loop and infers the next step:

```text
Kaizen — feat/SHOP-12-export (+3 commit(s))
  ✔ initialized · profile lean
  ✔ constitution v1.1.0
  · 4 plan(s) — latest: docs/plans/2026-10-04-feat-export-plan.md (implementation-ready) · 7 learning(s)
  ✘ push: no review recorded for this branch

Next:
  → /kaizen:review — branch feat/SHOP-12-export: changes not reviewed yet
```

Order of the inference:
1. Open production incident → `monitor` (restore first), then `postmortem`.
2. Incident resolved recently without a postmortem → `postmortem`.
3. Kaizen not initialized → `setup`.
4. No constitution → `constitution`.
5. Work in progress under the gate → resume `work`.
6. Branch with changes:
   - pending waiver → confirm it;
   - not reviewed → `review`;
   - reviewed and committed → `ship`.
7. Default branch with commits not yet deployed (deployment configured) → `deploy`.
8. Requirements without a plan → `plan`. Ready plan → `work`.
9. Otherwise → `brainstorm` (or `ideate`, `debug`).

## See also

[Plugin README](../../README.md) · [Getting started](../getting-started.md) · [Troubleshooting](../troubleshooting.md)
