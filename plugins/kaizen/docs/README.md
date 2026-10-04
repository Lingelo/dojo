# Kaizen documentation

Documentation for the plugin's **users**. The instructions Claude follows live in
`skills/<skill>/SKILL.md`; they are authoritative for the exact behavior, but they are not written to be
read by a human.

Kaizen is written in English since 3.0. Claude still talks to you in your language, and the documents it
writes in your repo (plans, learnings, ADRs, PR descriptions) follow `language` in
[Configuration](configuration.md#language).

## Where to start

| I want to… | Read |
|---|---|
| Set up the SDLC on a project | `/kaizen:setup audit` ([guide](guides/setup.md)) |
| Know which command to run, right now | `/kaizen:help` ([guide](guides/help.md)) |
| See Kaizen in one minute | [The presentation video](media/kaizen-presentation.mp4) |
| Understand Kaizen in 5 minutes | [The plugin README](../README.md) |
| Know how Kaizen compares to other SDLCs | [Assessment and positioning](positioning.md) |
| Run a first complete cycle, step by step | [Getting started](getting-started.md) |
| Tune Kaizen for my project | [Configuration](configuration.md) |
| Share team rules across repos | [Kaizen Packs](packs.md) |
| Get unstuck | [Troubleshooting](troubleshooting.md) |
| Look up a CLI command, a hook or an agent | [Plugin README — Reference](../README.md#reference) |
| See what changed between versions | [CHANGELOG](../CHANGELOG.md) |

## The loop

```text
   [/kaizen:constitution]   once per project: the non-negotiable principles
   [/kaizen:ideate]         optional: "what is worth doing?"
        │
        ▼
┌─→ /kaizen:brainstorm      "what should it be?"            (WHAT)
│       ▼
│   /kaizen:plan            "how do we build it?"           (HOW) + /kaizen:doc-review
│       ▼
│   /kaizen:work            "build it"                      (test first, quality gate)
│       ▼
│   /kaizen:review          "is it correct?"
│       ▼
│   /kaizen:ship            "ship a reviewable PR"  →  /kaizen:watch-pr
│       ▼
│   /kaizen:deploy          "release it, watch it"  →  /kaizen:monitor
│       ▼
└── /kaizen:learn           "remember what we learned"  → read by the next plan
```

`/kaizen:autopilot` chains everything after the brainstorm, without stopping (it never deploys).

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

- The paths shown (`docs/plans/`, `docs/learnings/`…) are the **defaults**. If `docs_root` is set, read
  `<docs_root>/plans/`, etc. See [Configuration](configuration.md#docs_root).
- `$K` stands for the plugin's CLI: `node <plugin folder>/scripts/kaizen.mjs`.
- The non-interactive modes (`mode:auto`, `mode:return`, `mode:pipeline`, `mode:agent`) are used when a
  skill is called by another one; you can also use them to avoid questions.
