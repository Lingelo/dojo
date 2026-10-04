# `/kaizen:postmortem`

> Learn from an incident without looking for a culprit, and close the loop: learning, pack rule,
> constitution amendment, regression test.

"Human error" is the start of the analysis (what made the error easy and invisible?), never its
conclusion. A postmortem is worth its **tracked actions**, not its prose.

## At a glance

| | |
|---|---|
| **What it does** | Gathers the facts (git, CI, deployments, PRs, provided logs), rebuilds the timeline and the impact, analyzes the contributing factors, sets the actions and their owners, closes the Kaizen loop |
| **When to use it** | After a production incident, a shipped regression, or a near miss |
| **When not to use it** | To fix the current bug (→ [debug](debug.md); `postmortem` calls it for diagnosis if the cause is not established yet) |
| **What it produces** | `docs/postmortems/YYYY-MM-DD-<title>.md`, and usually a learning, a test, possibly an amendment proposal |
| **What next** | The actions are tracked in your ticketing tool; the time to restore feeds `/kaizen:metrics` |

## Examples

```text
/kaizen:postmortem CSV exports outage on November 3, ~2 h, all store managers
/kaizen:postmortem #512
/kaizen:postmortem near miss on the orders table migration
```

## How it goes

1. **Facts first**:
   - your account;
   - `git log` of the default branch over the incident window, CI runs (`gh run list`), merged PRs,
     releases, `deploy/…`, `rollback/…` and `incident/…` tags;
   - the provided logs.

   Claude then asks the missing questions, one at a time: **real** start (often before detection), who
   detected it and how, what was tried.
2. **Timeline (UTC)**, each line sourced: real start, detection, mitigation, resolution. The gap between
   start and detection is often the real topic.
3. **Contributing factors**, plural:
   - the faulty change;
   - what should have stopped it (test, review, plan check, constitution article);
   - what delayed detection (missing alert, unwatched plan signal);
   - what slowed the rollback;
   - the organization.
4. **Seen before?**: an existing learning that did not prevent the recurrence is a major finding.
5. **Actions**: 3 to 7, each with a type, an owner, a due date and tracking. An action without an owner
   does not exist.
6. **Kaizen loop**:
   - learning with `/kaizen:learn`;
   - regression test;
   - pack rule;
   - `/kaizen:constitution amend` if a principle was missing or bypassed.

## The document

The frontmatter (`severity`, `detected`, `resolved`, `services`) feeds `/kaizen:metrics`: the time to
restore runs from `detected` to `resolved`. Sections: Summary · Impact · Timeline · Contributing factors ·
What went well · Near misses · Actions · Kaizen loop. Template:
[`templates/postmortem.md`](../../templates/postmortem.md).

## Good to know

- Incident logs are full of sensitive data: only sanitized excerpts (`<REDACTED>`) are allowed, never a
  customer ID, a token or an email.
- Reserve the file: `node $K postmortem new --title "…"`.

## See also

[debug](debug.md) · [learn](learn.md) · [constitution](constitution.md) · [metrics](metrics.md) · [monitor](monitor.md)
