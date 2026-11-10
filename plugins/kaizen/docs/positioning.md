# Kaizen — positioning

*As of November 10, 2026, Kaizen 6.0.0 with agent-skills 0.6.15.*

Since 6.0 Kaizen is not a method of its own. The method is Addy Osmani's
[agent-skills](https://github.com/addyosmani/agent-skills) — spec, plan, build, test, review, ship,
written as processes with exit criteria — shipped unmodified next to Kaizen in the dojo marketplace.
Kaizen is the engine around it: what agent-skills **asks** the agent to do, Kaizen's hooks **check**.

## Why agent-skills

Kaizen 2.x to 5.x combined Every's [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin)
loop with GitHub [Spec Kit](https://github.com/github/spec-kit)'s constitution: 20 skills, 22 agents,
profiles, packs, a plan format with traceability IDs. Complete, and heavy to learn. agent-skills covers
the same development loop with less ceremony: plain Markdown files (`SPEC.md`, `tasks/`), one skill per
concern, an anti-rationalization table in each, and it already runs in many agents. Kaizen 6.0 dropped
what duplicated it and kept only what agent-skills does not do: enforcement, memory, PR follow-up and
measurement.

## What each does

| Concern | agent-skills | Kaizen |
| --- | --- | --- |
| Spec, plan, tasks | `/spec`, `/plan`, `SPEC.md`, `tasks/` | reads them; brings the matching learnings back when they are written |
| Implementation, tests | `/build`, `/test`, TDD, Prove-It | quality gate: no end of turn on red checks |
| Review | `/review` (five axes), `code-reviewer` persona | records it by itself; no unreviewed push without your say |
| Quality bar | `/constraints`, `CONSTRAINTS.md`, floor guard | `doctor` checks the floor guard is wired |
| Secrets | `security-and-hardening` skill | no commit carrying a secret |
| Launch | `/ship` go/no-go | — |
| PR after it is opened | — | `/kaizen:watch`: feedback, CI, branch, to "looks ready" |
| Memory between cycles | — | `/kaizen:learn`, read back by hooks |
| Measurement | — | `/kaizen:metrics`: DORA approximated, learnings reuse, friction, cost per feature |

## Compared with AI-assisted SDLCs

| Criterion | Spec Kit | Compound Engineering | agent-skills alone | agent-skills + Kaizen |
| --- | --- | --- | --- | --- |
| Shape | toolkit, extensions, workflows | plugin, ~36 skills | plugin, skills + commands + personas | the same + 4 skills and 8 hook registrations |
| Discipline | instructions, opt-in quality-gate extensions | instructions | instructions with anti-rationalization | instructions **and** hooks that block |
| Review | convergence step | multi-agent | five axes, personas | the same, recorded, required before push |
| Learning loop | no | yes, its core | no | yes, read back automatically |
| PR follow-up | no | `ce-babysit-pr` | no | `/kaizen:watch` |
| Measurement | no | no | no | DORA approximated, friction, cost |
| Agents | many | 14 environments | many | agent-skills everywhere; Kaizen's gates in Claude Code |

## Limits

- **Not a team method.** No ceremonies, estimation, portfolio planning or cross-team coordination.
- **No deployment, no observability.** Kaizen stops at the merge-ready PR; merging, deploying and
  watching production belong to your tools.
- **Guard rails against forgetfulness, not against a malicious agent.** An intermediate script is
  enough to bypass a hook.
- **Gates in Claude Code only.** Other agents get agent-skills' skills and the learnings as Markdown; the quality gate, the review record and the read-back need Claude Code's hooks.
- **Two sources.** agent-skills is maintained upstream; dojo syncs it by pull request, reviewed before
  it reaches users.

## How it is tested

Every script, hook and gate is covered by `node --test plugins/kaizen/tests/*.test.mjs` (unit, CLI,
gates, PR flow against a fake `gh`, documentation and diagram contracts), run in CI on Linux, macOS and
Windows. End-to-end evaluations drive the skills through a real `claude -p` session
(`node plugins/kaizen/evals/run.mjs`).

## Sources

- [agent-skills — Addy Osmani](https://github.com/addyosmani/agent-skills) (MIT)
- [Compound Engineering — Every](https://github.com/EveryInc/compound-engineering-plugin) (MIT; Kaizen's learnings schema and PR follow-up derive from it)
- [GitHub Spec Kit](https://github.com/github/spec-kit)
- [DORA — State of AI-assisted Software Development 2025](https://dora.dev/research/2025/dora-report/)
