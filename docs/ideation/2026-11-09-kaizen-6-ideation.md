---
title: Kaizen 6 - Ideation
date: 2026-11-09
topic: kaizen-6
artifact: kaizen-ideation/v1
---

# Kaizen 6 - Ideation

Deep revision of Kaizen in the light of Addy Osmani's
[agent-skills](https://github.com/addyosmani/agent-skills). Requested by Angélo LIMA in session on
2026-11-09 ("on peut même revoir en profondeur", then "en vrai on peut aller en profondeur"), with
two later requirements: document everything and remake the video, and **using Kaizen on other
tools is critical** (idea 7, which frames the whole series).
Generated inline in one session, not through `/kaizen:ideate`'s parallel agents, and the bases quoted
from the repo were checked by hand, not by a cold verifier.

## Anchoring

**What agent-skills is** (README and [launch article](https://addyosmani.com/blog/agent-skills/)):
24 lifecycle skills and one routing meta-skill (`using-agent-skills`), 9 commands mapped on
Define → Plan → Build → Verify → Review → Ship, 4 personas, 7 reference checklists, a portable core
with thin per-host adapters. Its thesis: agents take the shortest path to "done" and skip the invisible
senior-engineer work, so the skills make that work non-optional *in the text*:

- **Process, not prose** — steps with exit criteria, not essays.
- **Anti-rationalization tables** — "pre-written rebuttals to lies the agent hasn't yet told"
  ("too simple for a spec", "I'll add tests later").
- **Verification** — every skill ends with evidence; "seems right" is not enough; "passing tests are
  evidence, not proof".
- **Scope discipline** — "touch only what you're asked to touch", which the article calls the biggest
  factor in whether an agent's PR can be merged.
- **Progressive disclosure** — a small router loads only the current phase; "every token loaded into
  context degrades performance somewhere".
- Skills it has that Kaizen does not: `doubt-driven-development` (fresh-context adversarial check of
  decisions *during* the build), `source-driven-development` (framework choices cite official docs),
  `constraint-driven-development` (a quality bar with default thresholds and a guard against silenced
  checks), `interview-me`, `deprecation-and-migration`, `observability-and-instrumentation`,
  `definition-of-done` as a standing bar.

**What Kaizen is today** (5.1.0, measured on this branch):

- 20 skills, 22 agents, 32 scripts, 24 test files. Skill descriptions loaded in every session:
  **9,711 characters**. 18 of the 20 skills begin by reading `references/conventions.md`
  (**267 lines**), whatever the task.
- Discipline lives **in code**: Stop hook on red checks (`quality-gate.mjs`), push refused without a
  proven review (`review-gate.mjs`), commit refused on a secret (`secret-gate.mjs`), user-approved
  waivers (`approvals.mjs`), every stop logged to `.kaizen/state/friction.jsonl` — including the
  reason of each waiver request (`review-state.mjs:189`, `requestWaiver(root, { reason })`).
- Discipline is **not in the text**: no skill has a rationalization or red-flag section (grep:
  zero hits for "rationaliz" or "excuse" in `skills/`, `agents/`, `references/`).
- The quality gate trusts what the verify commands report: nothing looks at whether a change added
  `it.skip`, `eslint-disable`, `@ts-ignore`, `# noqa`, lowered a coverage threshold or deleted
  tests (`quality-gate.mjs` only knows "skipped" for a check the time budget cut off, line 89).
- Scope is a written rule (`skills/work/references/implementation-loop.md:53`, "The plan's units
  and scope define what gets built"), not something measured: units declare **Files**, nothing
  compares them to the diff.
- `docs/positioning.md` lists "Claude Code only" and "more concepts to learn" as Kaizen's costs,
  and "a single maintainer" as a limit.

**Where it rubs.** Kaizen is the stronger *guarantee* (what the agent cannot do) and the weaker
*intent* (what the agent should want to do), with a large surface for a newcomer and for the context
window. agent-skills is the reverse: strong intent, no enforcement, light surface, any host.

## Axes

1. **Intent** — what the skills tell the agent, and how.
2. **Guarantees** — what code makes impossible or visible.
3. **Surface and context** — commands, descriptions, what is loaded when.
4. **Reach** — which agents and which humans Kaizen can serve (**critical**, idea 7).
5. **Compounding** — how each cycle makes the next one better.

## Ranked ideas

### 1. Rewrite every skill as process: steps, rationalizations, red flags, evidence

*Axis: intent · basis: direct + external · effort M · risk low*

One anatomy for every `SKILL.md`, held by the contract tests: **When / Not for** → **Steps** (each with
an exit criterion) → **Rationalizations** (excuse → rebuttal, 4 to 8 rows, specific to the skill) →
**Red flags** (what the agent notices in itself or the code that means stop) → **Evidence** (what must be
shown before saying done, and which CLI command proves it). Kaizen already has "Done when"; this
completes it. Example rows for `work`:

| Excuse | Rebuttal |
|---|---|
| "This change is too small for a test." | Small changes break the build too. The unit's Evidence field decides, not the size. |
| "The test is flaky, I'll skip it for now." | A skipped test is a removed check. Fix it, or record an exception the user approves. |
| "While I'm here I'll also clean up X." | Not in the unit's Files. Note it for a follow-up; touch only what was asked. |
| "Tests pass, so it works." | Passing tests are evidence, not proof. Run the AE's verification too. |

**Why it matters:** the gates catch the agent *after* it cut the corner. The tables stop many corners
from being cut, which removes friction (fewer refusals, fewer waivers) instead of adding it.
**Basis:** zero rationalization sections in Kaizen today; agent-skills' design principle.
**First step:** write the tables for `work`, `debug`, `review`, `ship` and `plan`; add the anatomy
to the skill contract test, warning only, so the 15 other skills can follow.
**Drawbacks:** about 40 lines more per skill — offset by idea 5.

### 2. Silenced-check guard: a green gate must not be a muted one

*Axis: guarantees · basis: direct + external · effort M · risk medium (false positives)*

A deterministic scan of the diff, in the quality gate (Stop) and in the push gate, for checks that were
switched off instead of satisfied:

- test skips and focus: `it.skip`, `xit`, `describe.only`, `@Disabled`, `@Ignore`,
  `pytest.mark.skip`, `t.Skip(`, `#[ignore]`;
- linter and type silencing: `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `# noqa`,
  `# type: ignore`, `//nolint`, `@SuppressWarnings`, `rubocop:disable`;
- weakened bars: a lowered coverage threshold, a test file deleted, the assertion count of a test file
  going down, `continue-on-error: true` or `|| true` added to CI or to a `verify` command.

A hit is refused like a red check. It is lifted the way Kaizen already lifts things: a unit whose
Evidence is `exception (reason + replacement check)`, or a user-approved waiver through `approvals.mjs`.
Every hit goes to `friction.jsonl`. Pattern list in a module like `secrets.mjs`, extensible in
`.kaizen/config.json` (`guard.silenced.patterns`, `guard.silenced.ignore`).

**Why it matters:** this is the cheapest way for an agent to turn the quality gate green, and today the
gate cannot see it. It is agent-skills' "guard against silenced checks", made into a guarantee.
**Basis:** `quality-gate.mjs` only runs commands and reads exit codes; `secret-gate.mjs` +
`secrets.mjs` are the pattern to copy.
**First step:** `kaizen.mjs guard silenced [--base <ref>]`, report only, run in `review`; make it
block once false positives are measured on Kaizen's own history.

### 3. Evidence ledger: the PR says only what was really run

*Axis: guarantees · basis: direct + reasoned · effort M · risk low*

The PostToolUse Bash hook already sees every command (`quality-gate.mjs --claim`). Record each
verification run — command, exit code, duration, HEAD tree, output hash — in
`.kaizen/state/evidence/<branch>.jsonl`. Each unit's evidence and each AE's proof then points to a
recorded run of the current tree. `ship` writes the PR's "How it was verified" from the ledger, not
from what the agent says it did; an AE claimed without a run is marked "not shown". `review record`
already requires evidence that reviewers ran: this applies the same rule to tests.

**Why it matters:** "verification gates" in agent-skills are a request; here they become a fact the
reviewer can trust, and the stale-evidence case (tests passed on a previous tree) disappears.
**First step:** write the ledger from the existing hook; show it in `kaizen status`.

### 4. Scope drift, measured

*Axis: guarantees · basis: direct + external · effort S · risk low*

When the branch carries a plan, compare the diff's files with the union of the units' **Files**.
Files outside it are listed: by `review` as a finding (P2 by default, P1 if outside the plan *and*
on a risk surface from `risk.mjs`), in the PR description under "Outside the plan", and in `metrics`
as a scope-drift rate per cycle. The fix is never a hand edit: either revert, or `plan amend`
(the user decides), which already exists. Plus the four other conduct rules from the article, written into
`conventions.md` and offered as a constitution starter article: surface assumptions before building,
stop on conflicting requirements, push back when warranted, prefer the boring solution.
Assumptions made during `work` go to the PR description.

**Basis:** units declare Files (`references/plan-contract.md`); nothing compares them to the diff.

### 5. Context budget: route, then disclose

*Axis: surface and context · basis: direct + external · effort M · risk medium*

- Split `conventions.md` (267 lines, read by 18 skills) into a **core** of 60 lines or fewer (loop, CLI,
  language, questions, commits) and topical references read only by the step that needs them (push
  gate, deployment, packs, profiles, subagents).
- A contract test with a **budget**: total description characters, and the lines each skill loads before its
  first step. A change that goes over the budget fails CI.
- `kaizen context` reports what a session actually loaded (from the transcripts the ledger already
  reads).

**Why it matters:** every cycle pays for those 267 lines today, and so does every session for the
9,711 description characters. This was the reason for the kaizen-ops split (4.0) — finish that work.

### 6. Seven lifecycle commands and a router (6.0, breaking)

*Axis: surface and context · basis: external + reasoned · effort L · risk high*

Replace the 20 public commands with the lifecycle, each a thin entry point that loads its modes on
demand:

| Command | Absorbs today's | Modes |
|---|---|---|
| `/kaizen:define` | ideate, brainstorm, constitution | `ideas`, `interview` (one question at a time), `constraints` (quality bar with default thresholds → constitution checks) |
| `/kaizen:plan` | plan, doc-review, decide | `review`, `adr`, `amend` |
| `/kaizen:build` | work, debug, polish, autopilot | `debug`, `polish`, `auto` |
| `/kaizen:review` | review, address-feedback | `feedback` |
| `/kaizen:ship` | ship, watch-pr, release | `watch`, `release` |
| `/kaizen:learn` | learn, prune-learnings, metrics | `prune`, `metrics`, `harvest` |
| `/kaizen` | help, setup | the router: where the repo stands, which phase is next; `setup` |

Old names answer for one major with the new name (as 4.0 → 4.1 did for `deploy`), and a
`lifecycle-commands` migration is registered in `upgrade.mjs` (`since: 6.0.0`, held by
`tests/upgrade.test.mjs`). Agents and the CLI do not change.

**Why it matters:** the "four commands" path (3.10) fixed onboarding on paper; this fixes it in the
command list and the context. **Drawback:** churn for current users, docs and diagrams to rewrite
(diagrams are generated by `docs/media/source/diagrams.mjs`, which helps).

### 7. Portable by design: one Kaizen, every coding agent (critical)

*Axis: reach · basis: direct + external · effort L · risk high · **priority: critical** (Angélo LIMA,
2026-11-09: "l'utiliser sur d'autres outils c'est critique")*

This is no longer one idea among seven: it is **the frame for the others**. Every new guard, skill
rewrite and doc page in this series is written for several hosts from day one, so that nothing has to
be ported twice.

#### What other agents support (November 2026)

| Host | Skills (`SKILL.md`) | Blocking pre-tool hook | Stop hook that forces another turn | Plugins / marketplace | Notes |
|---|---|---|---|---|---|
| Claude Code | yes | `PreToolUse` | `Stop` | Claude format (`.claude-plugin/`) | today's only host |
| Codex (CLI, app, IDE) | yes (`.agents/skills/`) | `PreToolUse` (exit 2, or `permissionDecision: deny`) | `Stop` (`decision: block` + `stop_hook_active`) | own manifest (`.codex-plugin/`) loading `hooks/hooks.json`; reported to accept Claude-format marketplaces | **sets `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PLUGIN_DATA` for compatibility**; project hooks need a trust review |
| GitHub Copilot CLI | yes | `preToolUse`, or `PreToolUse` with Claude tool names and snake_case fields | `agentStop` (`decision: block`, at most 8 in a row) | plugin `hooks.json`; reported to accept Claude-format marketplaces | **reads the repo's `.claude/settings.json` hooks**; command hooks fail closed |
| Copilot cloud agent | yes | `.github/hooks/*.json` only | same | **no plugins** | only repo files reach it |
| Cursor | yes | `preToolUse` | `stop` | Agent Plugins 1.0 | event names in camelCase |
| Gemini CLI | yes | `BeforeTool` | `AfterAgent` | extensions | hooks reportedly bypassed over ACP; trusted folders only |
| OpenCode, others | mostly | not yet | not yet | — | only T0 and T1 apply |

Sources: [Codex hooks](https://learn.chatgpt.com/docs/hooks), [Copilot hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference)
(both official docs); the rest from secondary sources listed at the end, **to verify against each
vendor's docs before the plan**. The [Agent Plugins 1.0](https://blakecrosley.com/fr/blog/agent-plugins-standard)
standard (August 2026: Vercel, Cursor, GitHub, Microsoft, OpenAI, Amazon; Anthropic not among the
maintainers) carries only skills and MCP in its portable core; hooks, agents and commands go into
per-client namespace folders.

**Reading:** the portable part is larger than expected. Skills are standard everywhere. A blocking
pre-tool hook and a Stop hook that forces another turn — the two mechanisms behind Kaizen's gates —
exist in Claude Code, Codex, Copilot CLI and Cursor, with close JSON shapes. What does not travel:
packaging, subagent definitions, transcripts, and the "ask" permission prompt.

#### What ties Kaizen to Claude Code today (measured)

| Coupling | Where | Portable answer |
|---|---|---|
| `${CLAUDE_PLUGIN_ROOT}` to find the CLI | 23 skill/agent/reference files | skills call `kaizen` through one resolver (the kaizen-ops one already exists: `git config kaizen.cli`, `$KAIZEN_CLI`, cache) plus a path relative to the skill folder |
| `AskUserQuestion` | 16 skill files | "ask the user, with the host's question tool if it has one"; options and the safe default stay written |
| `Agent` tool for researchers and reviewers | `review`, `plan`, `doc-review`, `ideate`, evidence hooks on `Agent|Task` | one source per agent in `agents/`, **generated** into each host's format (Codex subagents, Copilot custom agents, Claude agents); hosts without subagents run reviewers in sequence with a fresh prompt each, and the review evidence says so |
| Hook JSON in and out | 6 hook scripts, `permissionDecision: 'ask'` in `review-gate.mjs:41` | one **normalized hook contract** (`kaizen hook <event>` reads `{host, event, tool, input, session}`), and one thin adapter per host for names, fields and outputs, tested against payloads recorded from each real host |
| Claude Code's permission prompt for approvals (`approvals: "ask"`) | `approvals.mjs`, `confirm-asks.json` | already exists as `approvals: "code"` (user types `kaizen waive <code>`, caught by a prompt-submit hook): becomes the default on hosts without an `ask` decision; Copilot cloud agent treats `ask` as deny |
| Transcripts for token usage and the cost ledger | `ledger.mjs`, `cycle-agents.mjs`, `metrics.mjs`, `quality-gate.mjs`, `lib.mjs` | a parser per host; Codex states its transcript format is not stable, so cost is **best effort** and never feeds a gate (it does not today either) |
| Model names per role | `models.mjs`, 7 skill files | roles stay; `models.hosts.<host>` maps each role to that host's models |
| Evals with `claude -p` | `evals/run.mjs` | one runner per host (`codex exec`, `copilot -p`), same scenarios |
| Name, docs, video "For Claude Code" | README, positioning, video | "for coding agents", each guarantee labeled with the hosts that enforce it |

#### Target architecture

```
kaizen/
  core/        zero-dependency CLI, gates, state, contracts      ← unchanged, host-agnostic
  skills/      Agent Skills standard, host-neutral text           ← the same files for every host
  agents/      one source per role                                ← generated per host
  hooks/       normalized contract + adapters/{claude,codex,copilot,cursor,gemini}.mjs
  hosts/       generated packaging: .claude-plugin/, .codex-plugin/, Agent Plugins plugin.json + namespaces
```

- **Guarantee levels**, every guarantee labeled in the docs and in `kaizen doctor`:

  | Level | Enforced by | Covers |
  |---|---|---|
  | **T0 written** | skills, generated `AGENTS.md` digest | every agent |
  | **T1 git + CI** | `pre-commit`/`pre-push` (`templates/githooks/`, already fail-closed), a `kaizen verify-pr` CI step | every agent **and the cloud agents without plugins** (Copilot cloud agent, Cursor background agents), and humans |
  | **T2 session** | host hooks through the adapters | Claude Code, Codex, Copilot CLI, Cursor, Gemini CLI |

  T1 becomes the **floor**: every gate that can be checked on a commit, a push or a PR (secrets,
  silenced checks, review recorded for the tree, scope report, evidence of the tree) is checked there
  too. T2 stays the earliest and strictest; it is no longer the only one.
- **Install per host**: `kaizen install --host codex|copilot|cursor|gemini|claude` writes the
  project-level files (`.codex/hooks.json`, `.github/hooks/kaizen.json`, `.cursor/hooks.json`,
  `.gemini/settings.json`, skills into the host's discovery folder, the `AGENTS.md` section), never
  overwriting a team's own entries — same rules as `audit fix git_hooks`. `kaizen doctor` reports per
  host which levels are active.
- **One source, generated outputs, tested**: a contract test forbids Claude-only tokens in `skills/`
  outside a host namespace; the hook adapters are tested against recorded payload fixtures of each
  host; CI runs the gate tests once per adapter.

**Why it matters:** it removes the first cost listed in `positioning.md` and lets a team mix agents
(a developer on Codex, another on Claude Code, the Copilot cloud agent on issues) under the **same**
constitution, plans, gates and learnings — the repo becomes the source of discipline, not the tool.
**Drawbacks:** five hosts to follow as their hook formats move; one maintainer. Mitigation: the
adapters are thin and tested against recorded payloads, the hosts are supported in tiers (below), and a host that breaks
falls back to T1 without losing a guarantee that T1 covers.

**Host tiers (proposal, to confirm):**
1. **Tier 1, from 5.3:** Claude Code, Codex, Copilot CLI — the closest hook contracts (Codex sets
   `CLAUDE_PLUGIN_ROOT`, Copilot reads `.claude/settings.json`).
2. **Tier 2, from 5.5:** Cursor, Gemini CLI.
3. **T0 + T1 only:** every other agent reading skills or `AGENTS.md`, and every cloud agent.

**First step:** a spike on Codex and Copilot CLI: install today's Kaizen plugin through each one's
Claude-marketplace support, record which hooks fire and with which payloads, and list what breaks. The
measured result replaces the "reported" cells of the table above.

## Combinations

- **Living rationalizations (1 + 2 + 3 + compounding).** agent-skills' tables are static. Kaizen
  already logs the real excuses: waiver reasons in `friction.jsonl`, silenced-check hits, review
  findings on skipped evidence. `/kaizen:learn harvest` turns the ones that come back into rows of the
  repo's own table (`docs/learnings/` type `rationalization`, read by the skill at its Rationalizations
  step). Each refusal makes the next one less likely. This is the core idea of Compound Engineering,
  applied to the agent's own behavior.
- **Doubt at decision time (1 + 3).** During `build`, any `decisions_flagged`, any KTD departure and
  any irreversible step (migration, data write, public API) gets a fresh-context check by
  `adversarial-reviewer`, optionally on another model family (a `doubt` role in `models.mjs`).
  Framework API choices must cite their source (`docs-researcher`); the verdict goes into the evidence
  ledger. This is agent-skills' doubt-driven + source-driven, with traces.
- **Constraints → constitution (1 + 6).** `define constraints` asks for a quality bar with numbered
  defaults (PR size, coverage floor, a11y level, perf budget, allowed silencing) and writes each one as a
  constitution article with a **Check:** — which `plan check`, review and the silenced-check guard
  already enforce.

## Rejected

| Idea | Reason |
|---|---|
| Adopt agent-skills as a dependency and drop Kaizen's skills | replaces the topic; loses the plan contract, gates and learnings |
| Personas instead of 22 role agents | already covered, and more precise (11 code reviewers sharing a contract) |
| Port agent-skills' checklists (security, perf, a11y) as is | duplicate of stronger reviewers and packs; take only the missing rows |
| A `deprecation` skill | too expensive for the value now; a `type: deprecate` plan with expand → migrate → contract units covers it |
| Observability skill | already covered by plan rollout signals + kaizen-ops monitor; kept as one check (signals declared in rollout must exist in the code) under idea 3's review |
| Lower ceremony per profile for the new guards | contradicts the rule that profiles never scale the deterministic gates |
| Count concepts and remove the least used across users | not grounded: usage is only measurable on the maintainer's repos |

## Accepted gaps

- **Concept debt** (approvals `ask`/`code`, push offers, cost estimate, dashboard, deprecated profile
  names): no survivor, because there is no usage data beyond the maintainer's repos. Idea 5's budget
  and idea 6's restructuring are where to cut, with the measured friction and ledger of this
  repository as the evidence.
- **Multi-maintainer**: outside the ideation's scope — but five hosts make it more pressing.
- **Hosts without blocking hooks** (OpenCode today, cloud agents without plugins): only T0 and T1;
  accepted, and said in `docs/hosts.md`.
- **Cost and token metrics** off Claude Code: best effort, as long as hosts do not publish a stable
  transcript format.

## Proposed order

Portability (idea 7) is critical, so it leads: each release moves it forward, and each other idea
lands already portable.

| Release | Portability | Other ideas | Breaking |
|---|---|---|---|
| 5.2 | spike on Codex and Copilot CLI; host-neutral skill text (resolver instead of `${CLAUDE_PLUGIN_ROOT}`, question tool wording) + contract test | idea 1 on the same files (5 skills), conduct rules of idea 4 | no |
| 5.3 | normalized hook contract, adapters Claude + Codex + Copilot CLI with recorded fixtures, `kaizen install --host`, `doctor` per host | idea 2 at T1 **and** T2, idea 3 | no |
| 5.4 | agents generated per host, reviewers in sequence where there are no subagents, `approvals: "code"` default off Claude Code, evals per host | scope drift (idea 4), doubt at decision time | no |
| 5.5 | adapters Cursor + Gemini CLI, `kaizen verify-pr` CI step (T1 floor complete), generated `AGENTS.md` | idea 5, living rationalizations | no |
| 6.0 | packaging per host (Claude format, Codex manifest, Agent Plugins 1.0), "for coding agents" everywhere | idea 6, concept cuts, full doc rewrite, new video | yes, with `upgrade` migration |

Every release carries its own documentation: see the next section.

`docs/positioning.md` gains an agent-skills column with the first release of this series.

## Documentation and video

Requested by Angélo LIMA on 2026-11-09: "faudra tout documenter, et même changer la vidéo". The
documentation is **part of each release, not a follow-up**: a release of this series ships only when
its documentation is updated, held by the contract tests that already exist (the README lists every CLI command and hook,
`docs/README.md` lists every guide, every relative link resolves, `tests/diagrams.test.mjs` holds
each counted claim).

### Per release

| Release | Docs to write or change | Diagrams (`docs/media/source/diagrams.mjs`, then regenerate) |
|---|---|---|
| 5.2 | new concept page `concepts/intent.md` (anatomy, rationalizations, red flags, evidence, conduct rules); the 5 rewritten skill guides; a "writing a skill" section in `concepts/agents-and-models.md` | none |
| 5.3 | new guide `docs/hosts.md` (one section per host: install, levels enforced, known gaps) and `concepts/guarantee-levels.md`; `concepts/gates-and-hooks.md` (silenced-check guard, evidence ledger, hook contract and adapters), `reference/cli.md` (`guard silenced`), `reference/state-and-files.md` (`evidence/<branch>.jsonl`), `configuration.md` (`guard.*`), `troubleshooting.md` (a false positive, how to lift it) | `quality-gate.svg`, `push-gate.svg`, `hooks.svg`; new `evidence-ledger.svg` |
| 5.4 | `concepts/review.md` (scope drift finding, doubt at decision time), `concepts/pull-requests.md` ("Outside the plan", assumptions), `concepts/metrics.md` (scope-drift rate), `concepts/agents-and-models.md` (`doubt` role) | `review-pipeline.svg` |
| 5.5 | `concepts/learnings.md` (rationalization learnings, `harvest`), `reference/cli.md` (`context`), the trimmed `conventions.md` described in `concepts/the-loop.md` | `learnings-loop.svg`; new `living-rationalizations.svg` |
| 6.0 | **full rewrite**: README "Start here" (7 commands), `getting-started.md`, 7 lifecycle guides replacing the 20 per-skill guides (old pages kept as one-line redirects for one major), `docs/README.md` index, `positioning.md`, CHANGELOG with Breaking section, migration guide for `kaizen upgrade` (`lifecycle-commands`), each guarantee labeled T0/T1/T2 in `gates-and-hooks.md`; root `README.md` and `CLAUDE.md` of this repository | `kaizen-loop.svg`, `help-routing.svg`, `autopilot.svg`, `artifacts-map.svg`; new `guarantee-levels.svg` |

A contract test to add in 5.2, so nothing is forgotten later: each Breaking or new CLI command in the
CHANGELOG names the doc page that explains it (same idea as `tests/upgrade.test.mjs` for migrations).

### The presentation video

Today: `media/kaizen/kaizen-presentation.mp4` (80 s, origami crane climbing Mount Fuji, one switchback
per step), source `media/kaizen/source/kaizen-presentation.html` + `timeline.js` + `narration.json`,
rendered by the `motion-studio` plugin with local voice-over (Kokoro), SRT/VTT subtitles and the poster
`kaizen-presentation.jpg`. Linked from the root README, Kaizen's README, `docs/README.md`,
`getting-started.md` and motion-studio's README.

**When:** one re-render at **6.0**, when the story changes (lifecycle commands, intent + guarantee, maybe
"beyond Claude Code"). The 5.x releases do not change what the video says; re-rendering for each would
cost time without changing the message.

**What changes in the story:** today's narration describes the gates (constitution → plan → gate →
review → PR → merge → learnings). The new one tells the double discipline: the agent *wants* to do the
right thing (rationalizations, doubt), *cannot* do the wrong one (gates, muted tests caught, evidence),
and *learns* (even its own excuses). Keep the metaphor: Fuji, one switchback per lifecycle phase, the
summit is `learn`, and the crane starts again from a higher base camp.

Draft `narration.json` (about 85 s, English like the rest of the repo):

| id | Line |
|---|---|
| `hook` | AI writes code faster than ever. |
| `amp` | According to DORA, it speeds up delivery, but also increases instability. |
| `kaizen` | Kaizen gives your coding agent the habits of a senior engineer, and the guarantees to keep them. |
| `define` | Define: your principles become a constitution, each with a check. |
| `plan` | Plan: requirements, tests and rollback, traced and reviewed before any code. |
| `build` | Build: one tested unit at a time. A muted test never counts as a green one. |
| `doubt` | For every shortcut, a written rebuttal. For every risky decision, a second opinion. |
| `review` | Review: specialized agents inspect the change. Without their review, nothing is pushed. |
| `ship` | Ship: the pull request only claims what was really run. |
| `merge` | Merging and going to production stay in your hands. |
| `learn` | Learn: lessons, and even the agent's excuses, are read back by the next cycle. |
| `team` | Claude Code, Codex or Copilot: one constitution, the same gates, shared lessons. |
| `end` | Every unit of work makes the next one easier. Kaizen. For every coding agent. |

Scenes to add in `timeline.js`: a struck-through `it.skip` turning the gate red (build), a ledger
stamping each run with a hanko (ship), an excuse card burned by its rebuttal (doubt). The closing "For Claude Code." becomes "For every coding agent.", over a
shot where several cranes, one per agent, climb the same path. No product logos in the video: the
narration names the tools, the image does not.

Deliverables of the re-render: MP4, poster JPG, SRT and VTT regenerated from `narration.json` (never
hand-edited), the README alt text and duration updated, and a check by `rendering-reviewer` on
before/after captures, as for any rendering change.

## Sources

- [Codex hooks (official)](https://learn.chatgpt.com/docs/hooks)
- [GitHub Copilot hooks reference (official)](https://docs.github.com/en/copilot/reference/hooks-reference)
- [Agent Plugins 1.0](https://blakecrosley.com/fr/blog/agent-plugins-standard) (secondary)
- [Plugins and marketplaces in Claude Code, Codex and Cursor](https://developertoolkit.ai/en/ecosystem/plugins/) (secondary)
- [everyhook: one hook contract, an adapter per agent](https://github.com/nrzz/everyhook) (prior art for the adapters)
- [context-mode multi-client roadmap](https://github.com/mksglu/context-mode/issues/46) (hook event support per client, secondary)
- [The Agent Skills standard](https://agentscamp.com/guides/skills/agent-skills-open-standard) (secondary)
- [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)
- [Agent Skills, addyosmani.com](https://addyosmani.com/blog/agent-skills/)
- [My LLM coding workflow going into 2026](https://addyosmani.com/blog/ai-coding-workflow/)
