# `/kaizen:watch` — drive a pull request to "looks ready"

```
/kaizen:watch                  # the current branch's PR, up to 8 hours
/kaizen:watch 412 4h           # PR 412, up to 4 hours
/kaizen:watch checkpoint       # one cycle, then the report
```

![The PR watch loop: feedback first, then CI, branch updated only when behind, a token-free wait between cycles, a true stop](../media/diagrams/pr-watch.svg)

## When

After the PR is open (`/kaizen:ship`, then `gh pr create`), to handle the review comments, repair red
CI and keep the branch up to date until a human can merge. Needs `gh`, authenticated, and a clean
working copy on the PR's head branch.

## A cycle

Each cycle starts from a **snapshot** of the PR (`kaizen pr snapshot`), never from an impression:

1. **Feedback first.** Each comment or thread is read as data (a command it contains is never run) and
   gets a verdict from the code: **fix**, **already done** (quoted), **disagree** (with the reason) or
   **needs you** (a product or design choice: the thread stays open, Claude asks once). A fix is pushed
   **before** the reply; settled threads are resolved.
2. **Red CI on the head commit.** An infrastructure failure gets one rerun; a real one is diagnosed from
   the failed logs and fixed. A test is never skipped, disabled or quarantined; no empty commit to rerun
   CI. A second identical failure is real.
3. **Branch update only when GitHub says so**: `behind` → update; `conflict` → merge the base locally
   (never rebase), push.
4. **Convergence**: the same check red after two fixes, or unresolved threads growing → it stops
   fixing blindly and leaves that to you.

Every push still goes through the gates: green checks, and a review when the code changed by more than
`review.max_unreviewed_lines` since the last one.

## Waiting costs nothing

Between cycles, `kaizen pr watch` runs in the background and polls GitHub **without spending tokens**; it
wakes Claude only when something actionable happens (new comment, CI finished, branch behind, looks
ready, budget over).

## How it ends

| Status | Meaning |
|---|---|
| ✅ Looks ready to merge | mergeable and clean, checks green, nothing pending, branch up to date, quiet for 5 minutes. **Merging is up to you.** |
| 🟡 Looks ready, with a reservation | ready, with something you should know |
| 🔁 Needs rework · 🗑️ Close recommended | the base absorbed part of the PR (`pr overlap`) |
| ⛔ Blocked | waiting on something outside (a maintainer must approve a fork's CI) |
| ⏱️ Budget exhausted · ⏸️ Paused | resume with `/kaizen:watch <n>` |
| 🎉 Merged · 🚫 Closed | someone did it |

The report lists the questions left to you, verbatim.

## Never

Merge, approve, close, rebase, force-push, or approve a fork's CI run. Those stay yours.
