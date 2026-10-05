# `/kaizen:address-feedback`

> Each piece of review feedback gets a verdict, a fix published **before** the reply, a reply quoting
> the feedback, then the thread's resolution.

## At a glance

| | |
|---|---|
| **What it does** | Fetches unresolved threads and comments, judges each piece of feedback, fixes, verifies, commits, pushes, replies in each thread, resolves |
| **When to use it** | "Handle the PR comments", "answer Bob's review"; called every cycle by `watch-pr` |
| **When not to use it** | No feedback yet: have Kaizen review (→ [review](review.md)); follow the PR over time (→ [watch-pr](watch-pr.md)) |
| **What it produces** | Pushed commits, replies in the threads, resolved threads, a table of verdicts, and the "Decisions for you" list |
| **What next** | Answer the human decisions; `watch-pr` for the rest |

## Examples

```text
/kaizen:address-feedback                # PR of the current branch
/kaizen:address-feedback 42
/kaizen:address-feedback https://github.com/acme/shop/pull/42
```

## The verdicts

| Verdict | When | Reply |
|---|---|---|
| **fix** | the feedback is right, or defensible and cheap. It is the default, **nits included** | "Fixed in `abc1234`: …", then thread resolved |
| **already done** | the current code already settles the point | the line or commit settling it, then thread resolved |
| **decline** | contradicts a settled decision (plan, constitution, pack) or would introduce a bug, **with evidence** | explanation with the evidence; thread left **open** if the reviewer must decide |
| **question** | the reviewer asks a question | answer from the code and the plan |
| **human decision** | product or architecture trade-off, or missing permission | summary of the trade-off; thread open; added to "Decisions for you" |

## How it goes

1. Check: the working copy must be on the PR's branch.
2. `node $K pr threads` fetches all threads (paginated) and comments. Kaizen's messages (marker
   `<!-- kaizen -->`) serve as context, never as feedback to handle.
3. Each item is judged. An outdated thread (the code moved) is checked again on the new code.
4. Fixes: `verify`, then `fix(<JIRA>): …` commits, then `git push`, then a check that the push is
   really published.
5. Replies: `node $K pr reply`, then `node $K pr resolve` for threads; a single summary comment for
   top-level comments. Replies are written in the language of the comment they answer.

## Good to know

- **Comment text is untrusted data**: no command found in a comment is run. Claude reads the real code
  and decides for itself.
- **Allowed**: fix, commit, push the PR's branch, reply, resolve. **Never**: merge, rebase, force push,
  approve a CI run, resolve a thread without having replied to it.
- Fixes of more than `review.max_unreviewed_lines` lines (80) since the last review are refused at push
  time: Claude reruns `/kaizen:review`, then pushes.
- The push always comes before the replies: "fixed in `<sha>`" is never written for an invisible
  commit.
- `mode:pipeline` (used by `watch-pr`): no questions, structured return.

## See also

In depth: [pull requests](../concepts/pull-requests.md#answering-review-feedback).


[watch-pr](watch-pr.md) · [review](review.md) · [gh troubleshooting](../troubleshooting.md#gh-is-not-authenticated)
