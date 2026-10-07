# Kaizen documentation

Documentation for the plugin's **users**. The instructions Claude follows live in
`skills/<skill>/SKILL.md`; they are authoritative for the exact behavior, but they are not written to be
read by a human.

Each thing is described once: a **guide** says when and how to use a command (examples, options, what
to watch for), a **concept** page explains how a mechanism works (rules, formats, tables), the
**reference** lists every command, file and configuration key. A guide links to the concept page
instead of repeating it.

Kaizen is written in English since 3.0. Claude still talks to you in your language, and the documents it
writes in your repo (plans, learnings, ADRs, PR descriptions) follow `language` in
[Configuration](configuration.md#language).

## Where to start

| I want to… | Read |
|---|---|
| Set up the SDLC on a project | `/kaizen:setup audit` ([guide](guides/setup.md)) |
| Know which command to run, right now | `/kaizen:help` ([guide](guides/help.md)) |
| See Kaizen in one minute | [The presentation video](../../../media/kaizen/kaizen-presentation.mp4) |
| Understand Kaizen in 5 minutes | [The plugin README](../README.md) |
| Know how Kaizen compares to other SDLCs | [Assessment and positioning](positioning.md) |
| Run a first complete cycle, step by step | [Getting started](getting-started.md) |
| Tune Kaizen for my project | [Configuration](configuration.md) |
| Share team rules across repos | [Kaizen Packs](packs.md) |
| Get unstuck | [Troubleshooting](troubleshooting.md) |
| Understand a mechanism in depth | [How it works](#how-it-works) |
| Look up a CLI command, a file or an audit check | [Reference](#reference) |
| See what changed between versions | [CHANGELOG](../CHANGELOG.md) |

## The loop

![The Kaizen loop: constitution band, the build row from ideate to learn, the operate row from merge to postmortem, and the project memory read back by the next cycle](media/diagrams/kaizen-loop.svg)

`/kaizen:autopilot` chains everything after the brainstorm, without stopping (it never merges and never
deploys). The whole loop is explained in [The Kaizen loop](concepts/the-loop.md).

## How it works

In-depth pages: what each mechanism does exactly, with its rules, limits and diagrams.

| Page | Covers |
|---|---|
| [The Kaizen loop](concepts/the-loop.md) | steps, who decides what, what runs automatically, `/kaizen:help` routing, autopilot, profiles, language |
| [Plans](concepts/plans.md) | `kaizen-plan/v1`: frontmatter, sections and markers, R/AE/KTD/U/S ids, slices, rollout, every `plan check` rule |
| [The constitution](concepts/constitution.md) | format, parsing, validation, where it is enforced, NON-NEGOTIABLE, amendments and governance |
| [Gates and hooks](concepts/gates-and-hooks.md) | the six hooks, the secret scan before `git commit`, the Stop-hook quality gate, the review required before `git push`, waivers, tamper protection, `verify` |
| [The review system](concepts/review.md) | code review depth, reviewer selection, the reviewer contract, synthesis, verdicts; plan review |
| [Pull requests](concepts/pull-requests.md) | PR description, answering feedback, the snapshot, watcher verdicts, one watch-pr cycle |
| [Production](concepts/production.md) | release notes and SemVer, deployment and approval, platform detection, signals, watch/patrol/alert, incidents, postmortems |
| [Learnings](concepts/learnings.md) | durability test, schema, validation, search scoring, read vs applied, pruning, packs |
| [Metrics](concepts/metrics.md) | every DORA, loop and cycle-cost indicator and how it is computed |
| [Agents and models](concepts/agents-and-models.md) | the 21 agents, when each runs, the model policy per profile |

## Reference

| Page | Covers |
|---|---|
| [CLI](reference/cli.md) | every `kaizen.mjs` command, flag, output and exit code |
| [State and files](reference/state-and-files.md) | deliverables, git tags, `.kaizen/state/`, caches, environment variables |
| [SDLC audit](reference/audit.md) | every audit check, priorities, scoring, scaffolds |
| [Configuration](configuration.md) | every key of `.kaizen/config.json` |
| [Kaizen Packs](packs.md) | prescriptive team rules shared across repos |

## The guides, skill by skill

**Frame**
- [constitution](guides/constitution.md) — the project's non-negotiable engineering principles
- [ideate](guides/ideate.md) — grounded ideas, critiqued and ranked
- [brainstorm](guides/brainstorm.md) — define what to build
- [decide](guides/decide.md) — settle a hard decision and write it as an ADR

**Build**
- [plan](guides/plan.md) — decide how to build
- [doc-review](guides/doc-review.md) — review the plan before coding
- [work](guides/work.md) — execute the plan
- [debug](guides/debug.md) — find the cause, then fix
- [polish](guides/polish.md) — polish the UI with the user

**Verify and ship**
- [review](guides/review.md) — multi-agent code review
- [ship](guides/ship.md) — open a reviewable PR
- [address-feedback](guides/address-feedback.md) — handle review feedback
- [watch-pr](guides/watch-pr.md) — drive a PR to "ready"
- [release](guides/release.md) — prepare a version
- [deploy](guides/deploy.md) — release to production, watch, roll back
- [monitor](guides/monitor.md) — production signals against their thresholds, incidents

**Learn and measure**
- [learn](guides/learn.md) — capture a learning
- [prune-learnings](guides/prune-learnings.md) — maintain the learnings
- [postmortem](guides/postmortem.md) — learn from an incident
- [metrics](guides/metrics.md) — measure delivery and the compounding effect

**Orchestrate**
- [autopilot](guides/autopilot.md) — chain everything autonomously
- [setup](guides/setup.md) — install and check Kaizen in a repo
- [help](guides/help.md) — know which command to run now

## Conventions of these pages

- The diagrams are SVG files generated by [`media/source/diagrams.mjs`](media/source/diagrams.mjs)
  (`node docs/media/source/diagrams.mjs` from the plugin folder); they follow the reader's light or dark
  theme.
- The paths shown (`docs/plans/`, `docs/learnings/`…) are the **defaults**. If `docs_root` is set, read
  `<docs_root>/plans/`, etc. See [Configuration](configuration.md#docs_root).
- `$K` stands for the plugin's CLI: `node <plugin folder>/scripts/kaizen.mjs`.
- The non-interactive modes (`mode:auto`, `mode:return`, `mode:pipeline`, `mode:agent`) are used when a
  skill is called by another one; you can also use them to avoid questions.
