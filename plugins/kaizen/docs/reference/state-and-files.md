# State and files

Everything Kaizen reads and writes, where it lives, who writes it, and whether it is shared.

![What Kaizen writes in your repo, which skill writes each file and who reads it](../media/diagrams/artifacts-map.svg)

## Versioned deliverables (shared with the team)

Under `docs_root` (`docs/` by default; `.kaizen/docs` or `engineering/` if `docs/` is a published site):

| Path | Written by | Format |
|---|---|---|
| `plans/YYYY-MM-DD-HHMM-<type>-<topic>-plan.md` | brainstorm, plan | [plan](../concepts/plans.md) |
| `learnings/<category>/<slug>.md` | learn, prune-learnings | [learning](../concepts/learnings.md#format) |
| `adr/NNNN-<title>.md` | decide | ADR ([template](../../templates/adr.md)): context, options (including *do nothing*), decision, consequences, review signal |
| `postmortems/YYYY-MM-DD-<title>.md` | postmortem | [template](../../templates/postmortem.md); `detected`/`resolved` feed metrics |
| `ideation/…` | ideate | ranked ideas with their grounding |
| `metrics/YYYY-MM-DD.md` | metrics (on request) | trend reports |

At the repo root:

| Path | Written by | Notes |
|---|---|---|
| `CONSTITUTION.md` | constitution | [format](../concepts/constitution.md#format-kaizen-constitutionv1) |
| `kaizen-packs/<pack>/<rule>.md` | setup (`pack:<name>`), learn (with approval) | [packs](../packs.md); subfolders are storage |
| `.kaizen/config.json` | setup, `init`, `pack new`, `deploy configure` | [configuration](../configuration.md) |
| `.kaizen/config.local.json` | you | personal overrides, git-ignored (except `docs_root`) |
| `CLAUDE.md` (a short Kaizen section) | setup, with approval | makes learnings findable by any agent |
| `.github/workflows/ci.yml`, `kaizen-patrol.yml`, `kaizen-alert.yml`, `pull_request_template.md`, `dependabot.yml`, `CODEOWNERS`, `.gitignore` lines | `audit fix` | never overwritten |

No deliverable carries mutable state: progress is read from git (commits citing units, review state,
tags), never from a "status" field.

## Git tags (shared through the remote)

| Tag | Created by | Annotation (JSON note) |
|---|---|---|
| `deploy/<env>/<YYYYMMDDTHHMMSSZ>` | `deploy run` | env, sha, approval time, shipped plans |
| `rollback/<env>/<stamp>` | `deploy rollback` | env, reason, target |
| `incident/<env>/<stamp>` | `monitor watch`, `patrol`, `alert`, `incident open` | env, source, summary, signals |
| `resolve/<env>/<stamp>` | `monitor incident resolve`, a resolved alert | env, summary |

A suffix `-2`, `-3` is added when two tags share a second. Pushed when a remote exists and
`deploy.push_tags` is true. Hand-made tags with these prefixes are refused by the PreToolUse hook; they
are the source of the real DORA metrics and postmortem timelines. `release notes` never takes them as
the previous version.

## Local state (`.kaizen/state/`, git-ignored)

The folder carries its own `.gitignore` (`*`). Deleting it is harmless: the only effect is forgetting
the work in progress.

| File | Written by | Content | Lifetime |
|---|---|---|---|
| `gate.json` | `gate on`, Stop hook, `--claim` | active, plan, since, session, blocks, blocks_total, last_failure, usage, subagents | until `gate off` or 24 h |
| `cycles.jsonl` | `gate off` | plan, since, ended, minutes, gate_blocks, usage, subagents (per role) | kept |
| `agent-runs.jsonl` | Agent hook during a cycle | at, session, type, role, model, agent_id, prompt start | cleared by `gate off` |
| `reviews.json` | `review record`, waiver confirmation | per branch: head, tree, verdict, depth, reviewers, models, run, at (waiver: reason, confirmed_by) | replaced per branch |
| `review-evidence.json` | Agent hook | reviewer, model, session, at | 12 h |
| `waivers.json` | `review waive` | code, reason, branch, head, tree, at | 30 min |
| `deploy-approvals.json` | `deploy request`, `kaizen deploy <code>` | code, env, sha, at, confirmed, confirmed_at, session | 30 min, consumed by `deploy run` |
| `deployments.jsonl` | `deploy run`, `rollback`, `flag` | kind, env, sha, ref, at, ok, exit, seconds, tag, pushed, plans | kept (tags are authoritative) |
| `monitor.jsonl` | `monitor watch`, `patrol` | at, env, ok, signals (value, ok, ms, detail, threshold source) | kept |
| `pr/<owner>-<repo>-<n>.json` | `pr snapshot`, `pr mark` | threads, comments, checks handled, started_at, budget, last_head | delete to start over |
| `reviews/<YYYYMMDD-HHMMSS>/` | `run-dir reviews`, review | raw reviewer returns, `diff.patch` | kept |
| `rollback-worktree/` | generic rollback (redeploy of a previous commit) | throwaway git worktree | removed after use |

Writes to `reviews.json`, `review-evidence.json`, `waivers.json`, `deploy-approvals.json` and
`deployments.jsonl` are refused by the PreToolUse hook unless they come from the CLI or the hooks.

## Outside the repo

| Path | Content |
|---|---|
| `${CLAUDE_PLUGIN_DATA}/packs/<hash>/` (otherwise `~/.cache/kaizen/packs/`) | shallow clones of git-sourced packs (`packs --refresh` updates) |
| Claude Code transcripts (`~/.claude/projects/…`) | read by the Stop hook to measure the tokens of a cycle (main session and `subagents/agent-*.jsonl`) |

## Environment variables

| Variable | Read by | Role |
|---|---|---|
| `CLAUDE_PLUGIN_ROOT` | skills, hooks | the plugin’s folder (set by Claude Code) |
| `CLAUDE_PLUGIN_DATA` | `packs` | cache folder for git packs (set by Claude Code) |
| `KAIZEN_ENV`, `KAIZEN_REF`, `KAIZEN_SHA` | your deploy, rollback, flag and signal commands | environment, requested ref, resolved commit |
| `KAIZEN_GH` | `pr`, `metrics`, `audit` | replacement for `gh` (tests) |
