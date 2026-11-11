# Troubleshooting

First reflex: **`/kaizen:setup check`** — a read-only health check of every guard rail
([Doctor](concepts/gates.md#doctor)) and the next command to run. From a terminal: `node $K doctor` and
`node $K status`.

## The quality gate blocks the end of the turn

**Symptom**: at the end of a turn, Claude receives `[kaizen] Quality gate (1/3): the work in progress is
not green` and keeps working.

This is intended: a turn that edited code is not finished while tests, lint or type checks are red. But:

| Situation | What to do |
|---|---|
| The failure does not come from the work in progress (already red on `main`) | Claude runs `node $K gate off` and tells you why; then fix `verify` or the default branch |
| A detected command is wrong | fix it in `.kaizen/config.json` → `verify` (see `node $K detect`) |
| The checks are too slow for every turn | `gate.targeted` with `{files}` ([configuration](reference/configuration.md#gate)) |
| You do not want a gate in this repository | `"gate": { "enabled": false }` |

The gate never blocks more than `gate.max_blocks` times in a row (3): after that it lets the turn end
and Claude must report what is still red. `[kaizen] Quality gate budget exhausted` means some checks
could not run within `gate.budget_seconds`: run `node $K verify` before pushing. A gate left by an
interrupted session expires after `gate.max_age_hours` and never blocks another session.

## `git push` is stopped: "no review recorded"

That is the push gate: in a Kaizen repository, a branch does not leave without a review or your say.

| Situation | What to do |
|---|---|
| No review yet | `/kaizen:review`, then push |
| "N lines changed since the review" | beyond `review.max_unreviewed_lines`: `/kaizen:review` again |
| "the last review found Critical issues" | fix them, then `/kaizen:review` again |
| "the reviewed tree cannot be found (history rewritten?)" | the branch was rebased or amended after the review: review again |
| `/kaizen:review` ran but nothing was recorded | the review must be agent-skills' (`/kaizen:review`, `/agent-skills:review`, or the `code-reviewer` persona); check `node $K review status`, and that `kaizen doctor` shows `hooks` and `agent_skills` ✔ |
| You want to push without a review (hotfix, throwaway branch) | choose "Push without a review" when Claude asks, then confirm in Claude Code's prompt |
| You do not want this rule | `"review": { "require_before_push": false }` |

## `git commit` is refused: "possible secret(s)"

The secret scan found a key or token in the lines about to be committed (`file:line — type`).

- **Real secret**: move it to an environment variable, an untracked `.env` or a secret manager, and
  unstage it. If it was already pushed or shared, **rotate it**: removing it does not revoke it.
- **False positive** (fixture, public key, sample): add the path to `secrets.ignore`, or use an obvious
  placeholder (`example`, `changeme`, `${API_KEY}`).
- **`--no-verify` refused**: run that commit yourself if you mean it.
- Check without committing: `node $K secrets scan` (or `--staged`).

## `/kaizen:spec` or `/kaizen:build` is unknown

Those commands come from agent-skills. Install it next to Kaizen (`/plugin install agent-skills@dojo`) —
`kaizen doctor` reports it (`agent_skills`) and `node $K install settings` declares it for every clone.
After a marketplace update: `/plugin marketplace update dojo`.

## `gh` is not authenticated

**Symptom**: `/kaizen:watch` stops at once with `gh … : Failed to log in` or `GitHub repository not found`.

- `gh auth login`, then `gh auth status`.
- GitHub Enterprise: `gh auth login --hostname <host>`, then `--repo <host>/owner/name` if needed.

## `/kaizen:watch` goes round in circles or never says "ready"

- **A comment stays "to handle"**: it was not marked. `node $K pr snapshot` and look at `attention`; if it
  was really handled: `node $K pr mark --comment <id> --disposition dispatched`.
- **`needs-human` pending**: a decision waits for you (see the report). The PR is never declared ready
  while it is open: intended.
- **`blocked-external`**: CI waits for a maintainer's approval (fork PR). Kaizen never approves it.
- Start over: delete `.kaizen/state/pr/<owner>-<repo>-<n>.json`.

## The learnings are not reused

`/kaizen:metrics` shows `learnings_cited_by_plans: 0` and `learnings_applied_in_commits: 0` while
`docs/learnings/` is full, or a long `learnings_never_cited_sample`.

1. `node $K learnings validate`: an invalid frontmatter makes a learning hard to find.
2. Do the title, `tags` and `symptoms` use the words a request would use? Test with
   `node $K learnings search <words of a typical request>`.
3. Add `files:` globs to the learnings about specific files: editing them brings the learning back.
4. Does `CLAUDE.md` (or `AGENTS.md`) mention `docs/learnings/`? `/kaizen:setup` proposes the line.
5. `/kaizen:learn prune`, starting with `learnings_never_cited_sample`.

## Kaizen in other tools

Kaizen's guarantees are Claude Code hooks. In another agent (Codex, Copilot, Cursor…), agent-skills'
skills work as written and the learnings are plain Markdown any agent can read when `AGENTS.md` points to them. The
quality gate, the automatic review record and the learnings read-back need Claude Code.

## Reporting a problem

Attach the output of `/kaizen:setup check`, the plugin version, and for a CLI problem the `node $K …`
command with its full output. **Remove any secret or personal data** from the logs.
