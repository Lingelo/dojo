---
name: autopilot
description: Kaizen autonomous mode — takes a request all the way without stopping, through the right skills (plan or debug, work, simplification, review with fixes, capture, commit, push, PR, CI watching). A code change ends as an open PR. Use only when the user explicitly asks for end-to-end autonomous work or invokes /kaizen:autopilot — ideally after /kaizen:brainstorm. For step-by-step follow-up, use plan, work, debug.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, TaskCreate, TaskUpdate, TaskList
argument-hint: "[feature, bug, ticket or plan path]"
---

# Autopilot — from request to PR, without stopping

**Outcome:** the request reaches the end state its shape calls for, produced by the Kaizen skill whose
job it is, with everything left unresolved recorded where the user will see it. A code change ends as
an **open PR** whose URL you give, CI settled, after being implemented, simplified, reviewed (eligible
fixes applied, the rest recorded), captured if relevant, committed and pushed. **Merging stays with
the user** unless explicitly authorized.

Read `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

## Interaction

The user is **only** questioned through `/kaizen:brainstorm`, and only if they are present. Everything
else moves on without waiting: what is reversible is done and shown (the user will correct it
afterwards); only an **irreversible** action outside what was granted (merge, force push, data
deletion, deployment) stops the run. Report to the user in their language.

## Visibility

Create one task per step (`TaskCreate`) and keep them up to date. A step is only done after it really
ran; a child skill's return chains the next step **in the same turn**; the turn does not end before
DONE or a motivated stop.

## Routing

Match the request to the skill whose job it is:
- a **plan path**, or a plan written in this session → plan route (step 2 directly);
- a **concrete bug** (symptom, red test, bug ticket) → `kaizen:debug mode:return`;
- an **ambiguous product shape** (several plausible readings) → `kaizen:brainstorm mode:return` if a
  human is present, otherwise `kaizen:plan mode:return` which will record its assumptions;
- an outcome **that is not code** (ideas, explanation) → the skill concerned, and that is all;
- any other code change → `kaizen:plan mode:return`.

**No "trivial change" shortcut.** Even for five lines, the run goes through a work source (a plan,
short if need be), `work` under the gate, `node "$K" verify` and `kaizen:review`. Only simplification
(step 3) is skipped for a small diff, and delivery (9-10) without a remote. Whoever wants a change
without ceremony uses `/kaizen:work` directly, not `autopilot`. **Only exception: `lean` profile**
(`node "$K" config` → `profile`) — a change of ≤ ~30 lines with no risk surface (see `conventions.md`)
goes to `kaizen:work mode:return` with its 2 to 6 announced units, without a written plan; gate,
`verify`, review and delivery stay identical.

When in doubt, the route requiring the most evidence. **Never** an improvised plan on top of an
existing plan, nor a plan picked at random from the plans folder.

## The run (code-changing routes)

1. **Work source** — an implementation-ready plan (check `<!-- kaizen:units -->`), or a `fixed` return
   from `kaizen:debug`. `blocked`, `needs-human`, `settled-decision-invalidated` → **stop**.
2. **Implement** — `kaizen:work mode:return <plan>` (debug route: already done, go to 3). Only
   `status: complete` moves on. The quality gate stays active during the whole run
   (`node "$K" gate on --plan <plan>`, removed at the end).
3. **Simplify** — `simplify` skill if available, otherwise one pass yourself (reuse, clarity,
   efficiency); skipped for a documentation diff or one under ~10 lines. Verify again.
4. **Review** — `kaizen:review mode:agent plan:<plan>` (without `plan:` on the debug route). A finding
   showing that a settled decision **cannot work** (infeasible, wrong target, destructive) stops the
   run before any push.
5. **Apply the fixes** — confirmed P0/P1 and `gated_auto` P2: apply, verify again (`node "$K" verify`),
   commit (`fix(<JIRA>): review fixes`). Nothing stays only in the working tree. Record the review
   again with the post-fix verdict (`node "$K" review record --verdict …`): the push hook requires it.
6. **Record the rest** — every actionable finding not applied, every decision flagged along the way:
   in the PR description ("Open points" section), or in the final report if there is no PR.
7. **Capture** — `kaizen:learn mode:auto` if the run produced durable reasoning the code, tests and
   plan do not carry. "Learning not written" is a success. The learning goes into the PR.
8. **Browser tests** — UI change and a browser tool available (`playwright` plugin, MCP): walk through
   the acceptance examples touched; failure → fix, verify again.

**Delivery precondition** (from 9 on): empty `git remote` → everything stays in local commits, push, PR
and CI are skipped. That is not an error.

9. **Ship** — `kaizen:ship <plan> mode:auto`: checks, size (`node "$K" size`; above the limit, the PR
   justifies it), branch push (never the default branch, never `--force`), PR with description,
   reviewer guide, rollout and rollback, open points. An existing PR for the branch is updated, not
   duplicated.
10. **Drive the PR** — `kaizen:watch-pr <url> mode:pipeline`: review feedback handled, CI repaired (at
    most 2 fixes per cause, no test disabled, no empty commit), branch updated only if GitHub asks for
    it. It returns `looks-ready`, a motivated blocker or its residuals: record them in the PR ("Open
    points") and finish.
11. `node "$K" gate off`, then the final report and `DONE`.

**No deployment.** The run stops at the ready PR; releasing to production goes through
`/kaizen:deploy`, with the approval typed by the user for a protected environment.

## Stops (say why)

Work source impossible to produce · child return other than complete and substantiated · settled
decision invalidated · the project's delivery process not satisfied. A stop pushes nothing that was not
already pushed; it removes the gate (`gate off`) and summarizes the exact state and the possible
resume.

## Final report

```
DONE — <title>
PR: <url> — ✅ looks ready | 🟡 reservation: … | ⛔ blocked: … (watch-pr)
Plan: <path> · Units: 4/4 · Review: 1 P1 fixed, 2 P3 recorded · Learning: <path | none>
Open points: …
```
