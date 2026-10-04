# Troubleshooting

First reflex: **`/kaizen:help <what is happening>`** to know where you stand and what to run (it relies
on `node $K status`). Then **`/kaizen:setup check`**, a read-only health check: config, verification
commands, invalid learnings, packs, constitution, gate left active.

## The quality gate blocks the end of the session

**Symptom**: at the end of a turn, Claude receives `[kaizen] Quality gate (1/3): the work in progress is
not green` and keeps working.

This is intended during `/kaizen:work` and `/kaizen:autopilot`: as long as tests, lint or type checks
are red, the work is not finished. But:

| Situation | What to do |
|---|---|
| The failure does not come from the work in progress (already red on `main`) | `node $K gate off`, then fix the command in `verify` or the default branch |
| A detected command is wrong | fix it in `.kaizen/config.json` → `verify` (see `node $K detect`) |
| The gate stayed active after an interrupted session | `node $K gate status`, then `gate off`. In any case, it expires on its own after 24 h (`gate.max_age_hours`). |
| The checks are too slow for every turn | targeted checks: `gate.targeted` with `{files}` ([configuration](configuration.md#gate--the-stop-hook-quality-gate)) |
| You do not want a gate in this repo | `"gate": { "enabled": false }` |

The gate never blocks more than `gate.max_blocks` times in a row (3 by default). After that, it lets
the session finish while requiring Claude to report what is still red. `[kaizen] Quality gate budget
exhausted` means some checks could not start within `gate.budget_seconds`: run `node $K verify` before
shipping.

## `git push` is refused: "Push refused … no review recorded"

That is the review hook: in a Kaizen repo, a branch does not leave without a review.

| Situation | What to do |
|---|---|
| No review yet | `/kaizen:review` (it records the reviewed state), then push |
| "N lines changed since the review" | the changes since the review exceed `review.max_unreviewed_lines`: a new `/kaizen:review` |
| "the last review returned ⛔" | fix the blocking findings, then rerun the review |
| You want to push without a review (hotfix, throwaway branch) | ask Claude: it runs `node $K review waive --reason "…"` and gives you a code; type `kaizen waive <code>` yourself |
| "no Kaizen reviewer launched" at `review record` time | the review did not launch its reviewers (or they ran more than 12 h ago in another session): rerun `/kaizen:review` |
| "the reviewed tree cannot be found (history rewritten?)" | the branch was rebased or amended after the review: rerun `/kaizen:review` |
| You do not want this rule in this repo | `"review": { "require_before_push": false }` |

## Deployment refused

| Message | What to do |
|---|---|
| "Direct deployment of production refused" | go through `/kaizen:deploy production`: it asks for your approval, creates the tag and watches |
| "production is protected: approval required" | type the displayed code yourself: `kaizen deploy <code>` (30 min, for this commit) |
| "unknown environment" | declare it in `.kaizen/config.json` → `deploy.environments` ([configuration](configuration.md#deploy--deployment-and-rollback)), or `node $K deploy detect` |
| "deploy/…, rollback/…, incident/… and resolve/… tags are only created by kaizen.mjs" | do not create these tags by hand: they carry the DORA metrics and the incident timelines |
| "Command killed after N s: state of … is uncertain" | the deploy command exceeded `deploy.timeout_seconds`: check the environment (`node $K monitor check --env <env>`) before retrying |

## `plan check` is red

`node $K plan check <plan>` lists every problem. The most frequent ones:

| Message | Cause | Fix |
|---|---|---|
| `R4 is not covered by any unit` | a requirement without a unit implementing it | add `R4` to a unit's **Covers:**, or a unit |
| `AE2 is not covered by any unit` | an acceptance example without a test scenario | cite it in the **Covers:** of the unit testing it |
| `[NEEDS CLARIFICATION: …] marker(s) left` | an unresolved question in a ready plan | answer it, and replace the marker with the decision |
| `non-continuous numbering` | R or U renumbered by hand | renumber without gaps (R1, R2, R3…) |
| `article IV (…) not assessed` | a constitution article missing from the table | add the `IV.` line with a verdict and a justification |
| `status field forbidden` | a `status:` in the frontmatter | remove it: progress is read from git |
| `kaizen:rollout: **Signal** without a threshold` | the rollout says what to watch but not when to roll back | add the threshold: `` `error_rate` > 1 % → rollback `` |

The simplest: `/kaizen:doc-review <plan>`, which fixes on its own what is mechanical.

## `gh` is not authenticated

**Symptom**: `ship`, `address-feedback` or `watch-pr` fail with `gh … : Failed to log in` or `GitHub
repository not found`.

- Run `gh auth login`, then check with `gh auth status`.
- GitHub Enterprise: `gh auth login --hostname <host>`, then pass `--repo <host>/owner/name` if needed.
- Without `gh`, `ship` gives the PR creation URL and its body to paste; PR watching is not possible.

## `watch-pr` goes round in circles or never says "ready"

- **A comment stays "to handle"**: it was not marked after handling. Run `node $K pr snapshot` and
  look at `attention`. If an item was really handled:
  `node $K pr mark --comment <id> --disposition dispatched`.
- **`needs-human` pending**: a decision is waiting for you (see the report). As long as it stays open,
  the PR is never declared ready: this is intended.
- **`blocked-external`**: CI waits for a maintainer's approval (fork PR). Kaizen never approves it.
- **Announced review (👀) without a result**: `watch-pr` waits 30 minutes at most, then reports what it
  could not confirm.
- Start over: delete `.kaizen/state/pr/<owner>-<repo>-<n>.json`.

## The learnings are not reused

`/kaizen:metrics` shows `learnings_cited_by_new_plans: 0` or `learnings_applied_in_commits: 0` while
`docs/learnings/` is full, or a long `learnings_never_cited_sample` list.

1. `node $K learnings validate`: an invalid frontmatter makes a learning hard to find.
2. Do the words of the title, the `tags` and the `symptoms` match those your requests would use? Test
   with `node $K learnings search <words of a typical request>`.
3. Does `CLAUDE.md` mention `docs/learnings/`? `/kaizen:setup` proposes the line.
4. `/kaizen:prune-learnings` to fix stale or duplicate learnings, starting with
   `learnings_never_cited_sample`: a learning nobody cites closes no loop.

## A skill does not trigger

- Skills are called with the prefix: `/kaizen:plan`, not `/plan`.
- `/plugin` → is the plugin enabled? Is it the right version (3.0.0 or later for the English
  version)?
- After a marketplace update: `/plugin marketplace update angelo-plugins`.

## Upgrading from Kaizen 2.x

Kaizen 3.0 speaks English (instructions, CLI and hook messages). Nothing breaks in your repos:
- plans, constitutions and learnings written in French keep working (`**Couvre :**`, `**Contrôle :**`,
  `NON NÉGOCIABLE`, `[À CLARIFIER : …]` are still read);
- the review verdict `reserves` is now `concerns` (`reserves` is still accepted);
- set `"language": "fr"` in `.kaizen/config.json` if your team wants its deliverables in French
  regardless of the conversation's language.

## Reporting a problem

Attach the output of `/kaizen:setup check`, the plugin version, and for a CLI problem the
`node $K …` command with its full output. **Remove any secret or personal data** from the logs.
