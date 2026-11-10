# Kaizen documentation

Documentation for the plugin's **users**. The instructions Claude follows live in
`skills/<skill>/SKILL.md` and `commands/<command>.md`; they are authoritative for the exact behavior, but
they are not written to be read by a human.

Each thing is described once: a **guide** says when and how to use a skill, a **concept** page explains a
mechanism, the **reference** lists every command, key and file. A guide links to the concept page
instead of repeating it.

Kaizen is the engine around [agent-skills](https://github.com/addyosmani/agent-skills): the workflow
commands (`/kaizen:spec`, `/kaizen:plan`, `/kaizen:build`…) are agent-skills', documented in
`plugins/agent-skills/` (its README and `docs/`). This documentation covers what Kaizen adds.

## Where to start

| I want to… | Read |
|---|---|
| Install Kaizen and ship a first feature | [Getting started](getting-started.md) |
| Know which command to run, right now | `/kaizen:setup` ([guide](guides/setup.md)) |
| See Kaizen in one minute | [The presentation video](../../../media/kaizen/kaizen-presentation.mp4) |
| Understand what Kaizen adds to agent-skills | [Kaizen around agent-skills](concepts/the-loop.md) |
| Come from Kaizen 5.x | [Migrating to 6.0](migrating-to-6.md) |
| Tune Kaizen for my project | [Configuration](reference/configuration.md) |
| Get unstuck | [Troubleshooting](troubleshooting.md) |
| Compare Kaizen with other AI SDLCs | [Positioning](positioning.md) |

## Guides

- [setup](guides/setup.md) — Kaizen in a repository, and where it stands
- [learn](guides/learn.md) — capture, harvest and prune learnings
- [metrics](guides/metrics.md) — delivery, learnings reuse, friction and cost
- [watch](guides/watch.md) — drive a pull request to "looks ready"

## How it works

- [Kaizen around agent-skills](concepts/the-loop.md) — who does what, the commands, the loop
- [Gates and hooks](concepts/gates.md) — quality gate, review before push, secrets, doctor
- [Learnings](concepts/learnings.md) — the format, the durability test, how they come back
- [Metrics](concepts/metrics.md) — every number and how it is computed

## Reference

- [CLI](reference/cli.md) — every `kaizen.mjs` command
- [Configuration](reference/configuration.md) — every key of `.kaizen/config.json`
- [State and files](reference/state-and-files.md) — what Kaizen writes, where, and for how long

## Also

- [Migrating to 6.0](migrating-to-6.md) — what changed from Kaizen 5.x, step by step
- [Troubleshooting](troubleshooting.md)
- [Positioning](positioning.md)
- [Changelog](../CHANGELOG.md)
