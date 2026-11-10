# `/kaizen:metrics` — delivery, learnings, friction and cost

```
/kaizen:metrics                 # last 90 days
/kaizen:metrics 30d             # another window (30d, 12w, 6m)
/kaizen:metrics 12w compare     # against the previous window of the same length
/kaizen:metrics dashboard       # the HTML cost dashboard
/kaizen:metrics cost SHOP-412   # what one feature or fix cost, end to end
```

Every number and how it is computed: [Metrics](../concepts/metrics.md).

## When

- A periodic look — monthly, at the end of a quarter — at delivery, quality and the learning loop.
- "What did this feature cost?", "Is Kaizen worth it?"
- Before and after changing a practice, to see whether it helped.

## What you get

A report of 30 lines at most: the numbers with their method, the limits of the window, 2 or 3 findings
and 1 to 3 actions, each tied to a number.

```
Delivery (90d, approximated from main + GitHub)
  7.9 changes/week · lead time 6 h (PR opened → merged) · rework 12 % · change failure 4 %
  batch size: median 180 lines, p90 900, 31 % above pr.max_lines (400)
Learnings: 24, reuse 38 % (6 read by a plan, 4 applied in commits), 9 never cited
Friction: 14 pushes stopped (12 no review), unblocked in 18 min median, waiver share 7 %
Cost: feature median 2.1 M tokens (sonnet-weighted), most expensive SHOP-412

→ p90 of 900 lines: split with /kaizen:plan into smaller tasks
→ 9 learnings never cited: /kaizen:learn prune
```

Claude never quotes a number the CLI did not produce, says when the window has fewer than 10 changes,
and changes no code.

## The dashboard

`node $K metrics dashboard [--out file]` writes one self-contained HTML page — by default
`.kaizen/state/cost-dashboard.html`, not versioned — with the cost per work item, the stops, the waivers
and the guard rails. Open it in a browser; no server, no network.

## Cost of one item

`node $K cost <item>` — a Jira key, `branch:<name>`, `plan:<topic>`, or `current` for the work item of
this branch — gives its tokens per model family and in relative units, from the first turn on it
(spec, plan) to the last (PR follow-up). The ledger is local to your machine.
