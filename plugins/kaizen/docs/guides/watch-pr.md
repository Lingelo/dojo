# `/kaizen:watch-pr`

> Drive an open PR to "looks ready to merge": feedback handled, CI repaired, branch up to date when
> GitHub asks for it. Then stop and let you merge.

## At a glance

| | |
|---|---|
| **What it does** | Successive cycles: review feedback **before** CI, repair of the head commit's CI, branch update on signal, waiting without tokens between two cycles |
| **When to use it** | After `/kaizen:ship`; "watch my PR"; "drive it to the merge" |
| **When not to use it** | A single comment (→ [address-feedback](address-feedback.md)); a single CI failure (→ [debug](debug.md)) |
| **What it produces** | Commits and replies on the PR, and a **true** final state: ✅ looks ready · 🟡 reservation · ⛔ blocked · ⏱️ budget · 🎉 merged · 🚫 closed · ⏸️ paused |
| **What next** | **You merge.** Kaizen never merges. |

## Examples

```text
/kaizen:watch-pr                 # PR of the current branch, watching up to 8 h
/kaizen:watch-pr 42 4h           # 4-hour budget
/kaizen:watch-pr 42 checkpoint   # a single cycle, then the resume command
```

## A cycle (imposed order)

1. **Snapshot** `node $K pr snapshot`: the only source of truth. Threads are read in full (paginated),
   with comments, reviews, the head commit's checks, the merge state and the time since the last
   activity.
2. **PR finished** (merged or closed) → stop.
3. **Feedback before CI** → `address-feedback` once, then each item is **marked** (`pr mark`), so it is
   never handled again as long as nobody answers.
4. **Stale head commit**: if a push just happened, the observed CI is obsolete.
5. **CI**:
   - infrastructure failure: **one** rerun;
   - real failure: logs, then `debug`, `verify` and push.

   Never a disabled test, never an empty commit to rerun.
6. **Update from the base**: only if GitHub says `BEHIND` (update through the API, with the expected
   head commit) or `DIRTY` (local merge of the base, never a rebase).
7. **Convergence**: same check red after 2 fixes, or threads going up → stop fixing blindly.

## Waiting without spending

Between two cycles, Claude starts in the background:

```bash
node $K pr watch --pr 42 --interval 150
```

This watcher polls GitHub every 150 s **without consuming tokens**. It stops by writing a
`KAIZEN_WAKE {"reason": …}` line when there is something to do: `actionable`, `behind`, `conflict`,
`looks-ready`, `blocked-failing`, `blocked-external`, `needs-human`, `terminal`, `budget`. Its stop
wakes Claude, which resumes the cycle.

## When does it say "looks ready"?

All these conditions must be met:
- GitHub says `MERGEABLE` and `CLEAN`;
- checks are finished and green;
- no thread or comment is pending;
- no human decision is outstanding;
- the branch is up to date;
- **the PR stayed quiet for at least 5 minutes**.

Before announcing it, it checks two things:
- **is a review still on its way?** (👀 reaction, "reviewing…", a reviewer who reviewed a previous
  commit but not this one). If so, it waits up to 15 then 30 minutes at most;
- **is the description still true?** Otherwise, `ship refresh-description`.

It **never** says "safe to merge".

## Good to know

- `needs-human` and `blocked-failing` do not end the watch: they only prevent the "ready" verdict. The
  watch goes on for the other feedback.
- `blocked-external` (a fork PR's CI waiting for approval): Kaizen never approves.
- Budget: 8 h of active watching by default, 3-day safety net.
- Local state: `.kaizen/state/pr/<owner>-<repo>-<n>.json`. Deleting it starts over.
- A CI fix of more than `review.max_unreviewed_lines` lines (80) since the last review is refused at
  push time: `watch-pr` then reruns `/kaizen:review` before pushing.
- Prerequisite: an authenticated `gh`. Replies carry the `<!-- kaizen -->` marker.

## See also

[ship](ship.md) · [address-feedback](address-feedback.md) · [debug](debug.md) · [Troubleshooting](../troubleshooting.md#watch-pr-goes-round-in-circles-or-never-says-ready)
