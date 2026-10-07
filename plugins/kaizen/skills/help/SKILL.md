---
name: help
description: Kaizen orientation guide — explains what Kaizen is (the loop, the gates, the deliverables, the profiles) and recommends the command to use for the situation described and the repo's actual state (setup done?, constitution?, plan in progress?, gate active?, review recorded?), with the exact invocation and what it will produce. Read-only. Use when the user asks "which command should I use?", "where do I start?", "what is kaizen?", "I want to fix a bug / ship / measure, what do I run?", "where am I?", /kaizen:help [question or situation].
allowed-tools: Bash(node:*), Bash(git:*), Read, Glob, Grep
argument-hint: "[empty = overview + where the repo stands | question | situation]"
---

# Help — knowing what to use

**Outcome:** the user knows what Kaizen is and **which command to run now**, with the exact
invocation, why that one, and what it will produce. Read-only: no writes, no command run on their
behalf. Answer in the user's language.

`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

## 1. Diagnose

`node "$K" status --json` (outside a git repo: say so, and only answer on the substance). It gives
initialization, profile, constitution, latest plan and its stage, the gate, the branch's review state,
open incidents or incidents without a postmortem, and `next`: the next step inferred from the state.
Use it as a fact, not as an order: the situation the user describes wins.

## 2. Answer according to the invocation

**Without an argument** — in under 30 lines:
1. Kaizen in three sentences: an AI-assisted development cycle, from the project's constitution to a
   watched production release; **deterministic** gates (green tests before finishing, recorded review
   before any push, PR size); a learning loop (learnings, ADRs, postmortems) read back by the next
   cycle. Merging stays with the human.
2. The loop diagram (below).
3. **Where this repo stands**: 3 to 5 lines from `status`.
4. **Next**: the recommended command, with its reason, and at most two alternatives.

**With a question or a situation** — match it to the table below. Answer with the command (exact
invocation, useful arguments), one sentence on what it does and produces, and what comes after. If two
commands fit, say what tells them apart. If the situation is truly ambiguous, a single question. For a
command's details, read its guide `${CLAUDE_PLUGIN_ROOT}/docs/guides/<command>.md` and cite it, without
copying it.

**"What is / how does X work"** (a gate, a deliverable, a notion) — explain from
`${CLAUDE_PLUGIN_ROOT}/README.md`, `${CLAUDE_PLUGIN_ROOT}/docs/configuration.md` or
`${CLAUDE_PLUGIN_ROOT}/docs/troubleshooting.md`, citing the page to read next.

## The loop

```
                 CONSTITUTION.md — principles, each with a verifiable check
ideate → brainstorm → plan ─► doc-review → work → review → ship → watch-pr → learn
                       ▲                                                         │
                       └──────────── docs/learnings/ · docs/adr/ ◄───────────────┘
debug → fix → review → learn       polish: user-guided UI touch-ups
release → deploy → monitor ─(threshold breached)→ rollback → postmortem → learnings, amendments
decide → ADR     metrics (real DORA, cost)
autopilot: from request to ready PR, autonomously
```

## Which command for which situation

| Situation | Command | Why that one |
|---|---|---|
| Kaizen never used in this repo | `/kaizen:setup` | config, verification commands, detected deployment, profile (`lean` to start) |
| Set up the SDLC, find out what the project lacks | `/kaizen:setup audit` | maturity per area (CI, tests, secrets, review, deployment, monitoring) and guided fixes by priority |
| Choose or adjust the agents' model | `node $K models`, then `models` in `.kaizen/config.json` | one model per role depending on the profile: frugal research, critical judgments on the strongest |
| Lay down the project's rules | `/kaizen:constitution` | 5 to 9 principles, each with a check that plan and review enforce |
| Does not know what to do next | `/kaizen:ideate` | ideas grounded in the code, critiqued, ranked |
| A feature idea, still fuzzy | `/kaizen:brainstorm <idea>` | defines **what**: R requirements, AE acceptance examples |
| The requirements are clear | `/kaizen:plan` | decides **how**: units, threats, rollout, PR slices |
| A plan to review before coding | `/kaizen:doc-review <plan>` | plan reviewers (called by `plan`) |
| A ready plan, or a small precise change | `/kaizen:work [plan]` | test first, one commit per unit, gate, review |
| A bug with an unknown cause | `/kaizen:debug <symptom>` | reproduction, causal chain, test-first fix |
| Visual touch-ups to an interface | `/kaizen:polish` | dev server, feedback applied live |
| Which tool for a step (browser, GitHub, tracker, logs, database, design), which MCP servers are available | `/kaizen:tools [intent or situation]` | the tool picked from what is installed, how to use it, what to do if missing |
| Get code reviewed (branch or PR) | `/kaizen:review [PR number]` | reviewers chosen by the diff; records the review required at push |
| Open the PR | `/kaizen:ship` | checks, size, description from the plan |
| Review comments on the PR | `/kaizen:address-feedback` | verdict, fix pushed, reply, thread resolved |
| Drive a PR to "ready" | `/kaizen:watch-pr <url>` | feedback, CI, branch update; never merges |
| Chain everything without intervening | `/kaizen:autopilot <request>` | from request to ready PR (ideally after a brainstorm) |
| A decision that is hard to undo | `/kaizen:decide <question>` | options compared on evidence, then an ADR |
| A non-obvious problem was just solved | `/kaizen:learn` | a learning the next plan and the next review will read |
| Many or stale learnings | `/kaizen:prune-learnings` | keep, update, merge, delete |
| A production incident | `/kaizen:postmortem` | blameless: timeline, factors, actions, learnings |
| Prepare a release | `/kaizen:release` | notes, SemVer, CHANGELOG, production checklist |
| Deploy to production, or roll back | `/kaizen:deploy <env> [ref]`, `/kaizen:deploy rollback <env>` | the team's commands, typed approval for production, tag, watch, rollback |
| Is production healthy? | `/kaizen:monitor [env] [watch n]` | declared signals against the config's and plans' thresholds |
| Detect incidents continuously, an alert just fired | `/kaizen:monitor production continuous`, `/kaizen:monitor production incidents` | scheduled check (`patrol`) or the team's alerts wired in, dated incidents |
| Know whether things improve | `/kaizen:metrics` | approximated DORA, learning reuse, cycle cost |
| Push refused, gate blocking, skill not triggering | — | `docs/troubleshooting.md`, then `/kaizen:setup check` |

Tie-breakers:
- **work or autopilot**: `work` moves forward with the user; `autopilot` goes alone up to the PR.
- **debug or work**: unknown cause → `debug`; obvious fix → `work`.
- **brainstorm or plan**: not sure yet exactly what → `brainstorm`; known → `plan`.
- **Profile**: too much ceremony for the team → `lean` profile (`.kaizen/config.json`), which lightens
  plan and review without touching the gates.

## What help does not do

It does not run the recommended command and writes nothing: it orients. If the user says "go ahead",
invoke the recommended command, not help.
