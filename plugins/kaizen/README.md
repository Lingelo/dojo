# Kaizen Plugin

**An AI-assisted SDLC where each unit of work makes the next one easier.**

<a href="docs/media/kaizen-presentation.mp4"><img src="docs/media/kaizen-presentation.jpg" alt="Kaizen presented in 80 seconds: an origami crane climbs a small replica of Mount Fuji, one switchback per step of the cycle" width="100%"></a>

*80-second presentation with voice-over: [watch the video (MP4)](docs/media/kaizen-presentation.mp4)
· [subtitles](docs/media/kaizen-presentation.srt). Reproducible source:
[docs/media/source/](docs/media/source/kaizen-presentation.html), rendered with the `motion-studio` plugin.*

Kaizen structures work with Claude Code from the project's constitution to the merge-ready PR and the
production deployment, then **closes the loop**: what was learned is written where the next cycle will
read it.

DORA 2025 (confirmed by its 2026 ROI report) shows that AI **amplifies**. It raises throughput, but also
instability, except for teams that keep three disciplines:
- clear principles;
- **small batches**;
- real feedback.

Kaizen gives tooling to these three disciplines.

![The Kaizen loop: constitution band, the build row from ideate to learn, the operate row from merge to postmortem, and the project memory read back by the next cycle](docs/media/diagrams/kaizen-loop.svg)

> Strongly inspired by Every's [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin)
> plugin (MIT) for the loop, the artifact contracts, the learnings schema, the review personas and PR
> tracking.
> The **constitution** and its checks come from GitHub's
> [Spec Kit](https://github.com/github/spec-kit). The delivery practices come from
> [DORA 2025](https://dora.dev/research/), the [NIST SSDF](https://csrc.nist.gov/projects/ssdf) and
> [Google's engineering practices](https://google.github.io/eng-practices/).
> Kaizen is a **Claude Code-only** version. It adds hook-enforced gates, a zero-dependency deterministic CLI, tests and
> end-to-end evals. See [LICENSE](LICENSE).

## Language

Kaizen is written in English since 3.0: skills, agents, CLI and hook messages, documentation. Claude
still **talks to you in your language**, and the documents it writes in your repo (plans, learnings,
ADRs, PR descriptions, release notes) follow `language` in `.kaizen/config.json` (`auto` = the language
of the conversation). Plans and constitutions written in French with Kaizen 2.x are still read.

## Documentation

- **[Getting started](docs/getting-started.md)** — a first complete cycle, step by step
- **[Guides per skill](docs/README.md)** — when to use each command, what it produces, its options
- **[How it works](docs/README.md#how-it-works)** — in-depth pages with diagrams: [the loop](docs/concepts/the-loop.md), [plans](docs/concepts/plans.md), [constitution](docs/concepts/constitution.md), [gates and hooks](docs/concepts/gates-and-hooks.md), [review](docs/concepts/review.md), [pull requests](docs/concepts/pull-requests.md), [production](docs/concepts/production.md), [learnings](docs/concepts/learnings.md), [metrics](docs/concepts/metrics.md), [agents and models](docs/concepts/agents-and-models.md)
- **Reference** — [CLI](docs/reference/cli.md) · [state and files](docs/reference/state-and-files.md) · [SDLC audit](docs/reference/audit.md)
- [Assessment and positioning](docs/positioning.md) — what Kaizen covers, its limits, compared to classic SDLCs, Spec Kit, Kiro, BMAD and Compound Engineering
- [Configuration](docs/configuration.md) · [Kaizen Packs](docs/packs.md) · [Troubleshooting](docs/troubleshooting.md) · [Changelog](CHANGELOG.md)

## Installation

```json
{ "enabledPlugins": { "kaizen@dojo": true } }
```

Prerequisites: Node ≥ 18 and git; `gh` for PRs. No npm dependency. In a repo:

```
/kaizen:setup
/kaizen:constitution
```

## The commands (24 skills)

Lost? **`/kaizen:help`** explains Kaizen, looks at where your repo stands and tells you which command to
run next.

### Frame

| Command | Role |
|---|---|
| `/kaizen:constitution` | Creates, amends (`amend`) or audits (`audit`) `CONSTITUTION.md`: 5 to 9 non-negotiable principles, **each with a verifiable check**, and an AI policy (what agents do on their own). An interview that pushes back on vague principles, then a stress test. Versioned (SemVer), governed. |
| `/kaizen:ideate` | 5 angles in parallel, each idea with a verifiable basis, cold critique, 5 to 7 ranked survivors. |
| `/kaizen:brainstorm` | Defines **WHAT** to build through a one-question-at-a-time dialogue. Writes the requirements (R1…) and acceptance examples (AE1…). Unclear areas are marked `[NEEDS CLARIFICATION: …]` instead of being guessed. |
| `/kaizen:decide` | A hard or irreversible decision: options compared on evidence, a verdict with a confidence level and a revisit signal, then an **ADR** (`docs/adr/`). |

### Build

| Command | Role |
|---|---|
| `/kaizen:plan` | Decides **HOW**: parallel research, justified decisions (KTD). The plan also holds: constitution check, **threats (STRIDE)**, **rollout and rollback**, units grouped into **PR-sized slices**. Deterministic `plan check`, then mandatory `doc-review`. |
| `/kaizen:doc-review` | Reviews the plan before coding: deterministic check, then 2 to 6 reviewers (coherence, feasibility, scope, security, adversarial, design). Mechanical fixes applied, decisions put to the author. |
| `/kaizen:work` | Executes unit by unit, test first, one commit per unit. **Quality gate** on, size check, review required before shipping. |
| `/kaizen:debug` | Reproduce, trace, one hypothesis at a time. Full causal chain **before** fixing, test-first fix. |
| `/kaizen:polish` | Detects and starts the dev server. The user says what is wrong, Claude fixes live (Playwright to see). Local commits, never a push. |

### Verify and ship

| Command | Role |
|---|---|
| `/kaizen:review` | Multi-agent review with reviewers chosen from the diff. **Constitution enforced**, confidence filtering, every P0/P1 verified by the orchestrator, conformance to the plan. |
| `/kaizen:ship` | A reviewable PR: checks, size (otherwise stacked PRs), description drawn from the plan, **reviewer guide**, rollback, constitution exceptions. |
| `/kaizen:address-feedback` | Each piece of review feedback gets a verdict, a fix pushed **before** the reply, a reply quoting the feedback, and the thread's resolution. Human decisions stay open. |
| `/kaizen:watch-pr` | Drives a PR to "looks ready": feedback **before** CI, CI repair (never a disabled test). Update from the base only on GitHub's signal, check that no review is still on its way, 8 h budget. **Never merges.** |
| `/kaizen:release` | Release notes from conventional commits, checked SemVer version, CHANGELOG, production checklist. Never tags without approval. |

### Deploy and monitor

| Command | Role |
|---|---|
| `/kaizen:deploy` | Deploys through **your** commands (`deploy.environments`, recognized by `deploy detect`): preconditions, approval you type for production, `deploy/<env>/…` tag, watch of the plan's signals, **rollback** if a threshold is breached. Feature flags (`deploy flag`). |
| `/kaizen:monitor` | Production signals (native HTTP health-check or any command printing a number) against the thresholds of the config and of shipped plans. Threshold breached → dated incident, rollback, then postmortem. Continuous monitoring beyond the deployment: scheduled check (`patrol`) or the team's alerts (`alert`: Alertmanager, PagerDuty, Datadog, plain JSON). |

### Learn and measure

| Command | Role |
|---|---|
| `/kaizen:learn` | Captures **one** durable learning in `docs/learnings/`, if it passes the test "without this document, would we make the mistake again?". |
| `/kaizen:prune-learnings` | Audits the learnings against the current code: keep, update, merge, replace or delete, with evidence. |
| `/kaizen:postmortem` | Blameless postmortem: timeline from git, CI and deployment tags, contributing factors, actions with owners. Then learning, pack rule and constitution amendment. |
| `/kaizen:metrics` | DORA metrics, real from tracked deployments or approximated from git and GitHub (frequency, lead time, rework rate, failure rate, time to restore), batch size, **learnings reuse**, cycle cost. |

### Orchestrate

| Command | Role |
|---|---|
| `/kaizen:autopilot` | Autonomous: plan or debug → work → simplification → review with fixes → learn → ship → watch-pr. Stops at "looks ready". Never deploys. |
| `/kaizen:setup` | Configuration, stack detection, discoverability from `CLAUDE.md`, pack creation (`pack:<name>`), health check (`check`), SDLC maturity audit and scaffolding (`audit`). |
| `/kaizen:tools` | Picks the right tool for a step (Playwright or another MCP server, a CLI, a built-in) from what the repo and session really have: one intent of a fixed vocabulary, deterministic pick (`node $K tools pick`), how to use it, what to do when it is missing. Flags unpinned or unapproved servers. Read-only. |
| `/kaizen:help` | Explains Kaizen and recommends the command to run for your situation and the state of the repo (`node $K status`). Read-only. |

## What guarantees quality

**Constitution → checks.** Each article of `CONSTITUTION.md` carries a **Check:**.
- `plan check` verifies that each article is assessed in the plan.
- `doc-review` and `standards-reviewer` enforce it on the plan, then on the diff.
- A NON-NEGOTIABLE article admits no exception without a versioned amendment.
- Rule hierarchy: **constitution > packs > learnings > preferences**.

**End-to-end traceability.** Each requirement R and each example AE is covered by a unit, each unit has
evidence and an executable verification (checked by `plan check`). The review checks the code's
conformance to the plan, and the PR lists the covered requirements.

**Small batches** (the first lever according to DORA):
- the plan slices into PR-sized slices;
- `size` measures the diff against `pr.max_lines` (400 by default);
- `ship` proposes stacked PRs;
- `metrics` tracks the share of oversized PRs.

**Security built into the cycle (NIST SSDF)**:
- STRIDE threats in the plan, security reviewer for the plan then the code;
- dependency audit (`verify --only audit`);
- secret scan before every commit Claude makes (hook, ~30 kinds of keys and tokens) and `secrets scan` for CI;
- PR comment text treated as untrusted.

**Quality gate through the `Stop` hook.** During `work` and `autopilot`, Claude cannot finish while tests,
lint or typing are red. The hook blocks 3 times at most, then lets through while requiring the failure to
be reported, and turns itself off after 24 h. It belongs to the session that turned it on and runs within
a time budget under the hook's timeout.

**Review enforced by a hook, not by an instruction.** A `PreToolUse` hook refuses `git push` of a branch
until `/kaizen:review` recorded the pushed state (beyond 80 lines changed since, a new review). The record
requires evidence: a hook logs the reviewers actually launched, the agent cannot declare a review that
did not happen. Only the user can waive it, by typing the confirmation code themselves, and the waiver
appears in the PR.

**Staged adoption.** `profile`: `lean` (minimal ceremony, to start), `standard`, `full`. The profile sets
the ceremony (plan size, number of reviewers), never the deterministic gates. Small steps, in the kaizen
spirit.

**From production to the next cycle.** Each plan says how to roll back and which signal to watch, with
its threshold (`plan check` warns otherwise). `release` derives the production checklist from it,
`deploy` and `monitor` watch those thresholds; a breached threshold leads to the rollback and the
postmortem, whose learnings and amendments feed the next cycle.

**Team governance.** With declared `approvers`, each constitution amendment must be approved by one of
them, never by an agent (`constitution check`).

**The compounding effect, measured.** Learnings (`docs/learnings/`), ADRs and postmortems are read by
`learnings-researcher` at every plan, review and debug. `/kaizen:metrics` distinguishes learnings
**read** (cited by a recent plan) from learnings **applied** (cited by a commit landed on the default
branch), and lists the ones nobody ever cited. A learning never reused signals a loop that does not
close. `metrics` also measures the **cost** of each cycle (duration, tokens, gate blocks) to judge
whether the ceremony pays back more than it costs.

**The right model for each task.** Each agent has a role, each role a model per profile: frugal
research, critical reviewers (security, migrations, adversarial) on the strongest model. Adjustable per
role or per agent (`models`), verifiable (`node $K models`, model recorded per reviewer).

**Setting up the SDLC.** `/kaizen:setup audit` scores the project in five areas (foundations, flow,
delivery, operations, Kaizen loop) and fixes in priority order: CI, PR template, Dependabot, CODEOWNERS
generated from your stack, monitoring workflows; deployment platform recognized by `deploy detect`
(Vercel, Netlify, Fly.io, Heroku, Kamal, Capistrano, Helm, Kustomize, Serverless, SAM, Firebase, GitHub
Actions, Makefile/npm, Compose, Terraform).

## Agents (21)

| Role | Agents |
|---|---|
| Research | `repo-researcher`, `learnings-researcher`, `git-historian`, `docs-researcher`, `flow-analyst` |
| Plan review | `plan-coherence-reviewer`, `plan-feasibility-reviewer`, `plan-scope-reviewer`, `plan-security-reviewer`, `plan-adversarial-reviewer`, `plan-design-reviewer` |
| Code review (baseline) | `correctness-reviewer`, `standards-reviewer` (constitution, standards, packs, learnings) |
| Code review (depending on the diff) | `security-reviewer`, `testing-reviewer`, `performance-reviewer`, `reliability-reviewer`, `api-contract-reviewer`, `data-migration-reviewer`, `maintainability-reviewer`, `adversarial-reviewer` |

All agents are read-only.
- Code reviewers share [`references/review-contract.md`](references/review-contract.md): severity P0 to
  P3, confidence anchored at 50, 75 or 100, and the "cite the line" rule.
- Plan reviewers share [`references/doc-review-contract.md`](references/doc-review-contract.md).
- `node $K models` shows the model each agent runs on.

## Files in the target repo

```
CONSTITUTION.md              non-negotiable principles (versioned)
.kaizen/config.json          configuration (config.local.json = personal override, ignored by git)
.kaizen/state/               local state: gate, PR tracking, reviews, deployments, cycles — auto-ignored by git
docs/plans/                  unified plans (requirements → ready plan), one file per topic
docs/learnings/              captured learnings
docs/adr/                    architecture decisions (NNNN-title.md)
docs/postmortems/            postmortems
docs/ideation/  docs/metrics/
kaizen-packs/<pack>/         prescriptive team rules
```

```json
{
  "docs_root": "docs",
  "language": "auto",
  "profile": "standard",
  "tracker": "auto",
  "verify": { "test": "pnpm vitest run", "lint": "pnpm eslint ." },
  "gate": { "enabled": true, "max_blocks": 3, "timeout_seconds": 600, "max_age_hours": 24 },
  "pr": { "max_lines": 400 },
  "deploy": { "environments": { "production": { "command": "make deploy", "rollback": "make rollback" } } },
  "monitor": { "signals": { "health": { "type": "http", "url": "https://shop.example/health", "expect": 200 } } },
  "packs": [
    { "source": "kaizen-packs/house-rules" },
    { "source": "https://github.com/org/packs", "ref": "v1.2.0", "pack": ["rails"] }
  ]
}
```

Every key is described in [Configuration](docs/configuration.md).

## Reference

### CLI

All deterministic work goes through `scripts/kaizen.mjs` (Node ≥ 18, zero dependencies). Skills call it;
you can call it too. `node $K help` prints this summary.

```bash
K=plugins/kaizen/scripts/kaizen.mjs

# Orientation and setup
node $K status [--json]                        # where the repo stands in the loop, and the next command
node $K root                                   # deliverable paths (JSON)
node $K init [--docs-root d] [--language en] [--profile lean|standard|full]   # .kaizen/ and the folders
node $K config                                 # effective configuration (JSON)
node $K detect                                 # stack and verification commands (JSON)
node $K audit [--json] [--no-github]           # SDLC maturity in five areas
node $K audit fix <ci|pr_template|dependabot|codeowners|gitignore_env|secret_scanning|monitor_patrol|monitor_alert> [--owner @x] [--env e] [--ref sha]
node $K models [--json] [--agent a]            # model of each agent per profile and config
node $K tools [--json] | tools intents | tools pick <intent> [--json]   # MCP servers and CLIs, tool for a step

# Principles, plans, learnings
node $K constitution [check] [--json]          # CONSTITUTION.md articles / validation
node $K plan new --type feat --topic x | plan latest | plan list
node $K plan check <path> [--json]             # structure, R/AE → U traceability, constitution, rollout
node $K learnings search <words…> [--limit 8] [--json] | validate [files…] | list | stats
node $K packs [--json] [--refresh]             # rules of the declared Kaizen Packs
node $K pack new <name>                        # creates and declares a local pack
node $K adr new --title "…" | adr list         # architecture decisions (docs/adr)
node $K postmortem new --title "…"             # reserves a postmortem (docs/postmortems)

# Building and verifying
node $K verify [--only test,lint|audit] [--json]   # runs the checks (exit 1 if red)
node $K gate on [--plan p] | off | status      # Stop-hook quality gate
node $K size [--base ref] [--max n] [--json]   # diff size vs pr.max_lines (exit 1 if above)
node $K secrets scan [--staged | --base ref] [--json]   # possible secrets in the changes (exit 1 if any)
node $K dev detect | dev probe --url <u> [--timeout-seconds 30]   # dev server (polish)
node $K run-dir <type>                         # local run folder (e.g. reviews), ignored by git

# Review and PR
node $K review record --verdict ready|concerns|blocked [--run d]   # requires reviewers that actually ran
node $K review waive --reason "…" | review status | review check  # waiver = code typed by the user
node $K pr snapshot|watch|mark|threads|reply|resolve|comment|update-branch [--pr n] [--repo o/r] …

# Release, deployment, monitoring
node $K release notes [--from <tag>] [--to <ref>]  # grouped commits, breaking changes, SemVer, rollout
node $K deploy detect [--json] | deploy configure <id> [--force]
node $K deploy request|run <env> [--ref r]     # approval code / deployment + deploy/<env>/… tag
node $K deploy rollback <env> [--reason …] [--to r] | deploy list [--env e]
node $K deploy flag on|off <name> [--env e]    # deploy.flags commands
node $K monitor check|watch [--env e] [--plan p] [--minutes 15] [--interval 60]
node $K monitor patrol --env e [--interval 60] # confirmed check → incident (exit 1)
node $K monitor alert [--env e] [--file f|-]   # alert payload → incident opened/resolved
node $K monitor incident open|resolve --env e [--at iso] [--summary …] | monitor incident list [--env e]
node $K metrics [--since 90d] [--no-github]    # DORA, batch size, Kaizen loop, cycle cost
```

Exit codes: 0 = OK, 1 = red check (verify, size, plan check, deploy, monitor breach…), 2 = usage error.

### Hooks

Declared in [`hooks/hooks.json`](hooks/hooks.json); they work without any action on your part.

| Event | Script | Role |
|---|---|---|
| `PreToolUse` (Bash) | `scripts/secret-gate.mjs` | Refuses a `git commit` whose changes (index, plus what a `git add` in the same command or `commit -a` brings in) carry a key or token, and `--no-verify`. Active in every git repo; `secrets.scan: false` turns it off |
| `PreToolUse` (Bash, Write, Edit…) | `scripts/review-gate.mjs` | Refuses `git push` of a branch without a recorded review of the pushed tree, a direct deploy command of a protected environment, hand-made `deploy/…`, `rollback/…`, `incident/…` tags, and direct writes to Kaizen's review and deployment state |
| `PostToolUse` (Bash) | `scripts/quality-gate.mjs --claim` | Ties the gate to the session that ran `gate on` |
| `PostToolUse` (Agent/Task) | `scripts/review-hooks.mjs --evidence` | Logs the Kaizen reviewers actually launched (evidence required by `review record`) and the agents of the cycle |
| `Stop` | `scripts/quality-gate.mjs` | Blocks the end of the turn while `verify` is red during `work`/`autopilot`; records the cycle's token usage |
| `UserPromptSubmit` | `scripts/review-hooks.mjs --confirm` | Confirms a review waiver (`kaizen waive <code>`) or a protected deployment (`kaizen deploy <code>`) typed by the user |

### Environment variables

See [Configuration — Environment variables](docs/configuration.md#environment-variables).

## Quality of the plugin itself

```bash
node --test plugins/kaizen/tests/*.test.mjs    # unit, CLI, gate, PR (fake gh), contracts
node plugins/kaizen/evals/run.mjs              # end-to-end evals (claude -p, costly)
```

- **Contract tests.** They check:
  - the frontmatter of each skill and each agent;
  - that each cited file and each `kaizen:<name>` exist;
  - that each documented CLI command exists, and that this reference lists every command and hook;
  - that each plan marker is documented;
  - that this README and the docs index are up to date, and that every relative link and `#anchor`
    resolves.
- **Evals.** They prepare trapped repos and check:
  - that the review finds an injection and a rounding error;
  - that the review enforces the constitution;
  - that an autonomous plan passes `plan check`;
  - that `learn` refuses a worthless learning.
- **CI** (`.github/workflows/kaizen.yml`): Linux, macOS and Windows, Node 18 and 22.

## Integrations

- **Commits**: conventional format (`<type>(<JIRA>): …`, Jira key read from the branch).
- **Secrets**: never in reports (`<REDACTED>`).
- **Browser**: Kaizen ships the Playwright MCP server (`.mcp.json`, pinned version, started with `npx`); `polish`, `work` and `autopilot` use it to see and verify the UI. Which tool for which step (browser, GitHub, tracker, observability, database, design, docs): [`references/tool-choice.md`](references/tool-choice.md), `/kaizen:tools`.
- **Secrets**: scanned by Kaizen itself before every commit (`secret-gate.mjs`), no other plugin needed.
