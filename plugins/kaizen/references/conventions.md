# Kaizen conventions (shared by every skill)

## The loop

```
                 CONSTITUTION.md (non-negotiable principles, enforced as checks)
ideate → brainstorm → plan ─► doc-review → work → review → ship → watch-pr → learn
                       ▲                                                         │
                       └──────────── docs/learnings/ · docs/adr/ ◄───────────────┘
debug → fix → review → learn      polish: user-guided UI touch-ups      prune-learnings: learning upkeep
decide → ADR      postmortem → learnings, packs, amendments      metrics: DORA + reuse      release
```

**Rule hierarchy**: constitution > Kaizen Pack rules > learnings > preferences.

Principle: **each unit of work must make the next one easier.** 80 % of the time in planning and
review, 20 % in execution. A learning written today is read back by the next `/kaizen:plan` and the
next `/kaizen:review`, and that feedback is what makes the effect compound.

## The CLI

Every deterministic operation goes through the CLI, never through a hand-made reimplementation:

```bash
K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"
node "$K" status [--json]          # where the repo stands in the loop + next command (read by help)
node "$K" models [--json] [--agent a]           # model of each agent (profile + config): pass it to the Agent tool
node "$K" audit [--json] | audit fix <id>       # project SDLC maturity, scaffolds (ci, pr_template, dependabot, codeowners, gitignore_env, monitor_patrol, monitor_alert)
node "$K" deploy detect | deploy configure <id> # recognized deployment platform → config
node "$K" root                     # paths: docs_root, plans, learnings, ideation (JSON)
node "$K" config                   # effective configuration
node "$K" init [--profile lean]    # creates .kaizen/config.json and the deliverable folders
node "$K" detect                   # stack + verification commands
node "$K" verify [--only test]     # runs the checks (exit 1 if red)
node "$K" plan new --type feat --topic <slug>   # reserves the plan file (atomic)
node "$K" plan latest | list
node "$K" learnings search <words…> [--json]    # relevant learnings, ranked
node "$K" learnings validate [files…] | list | stats
node "$K" packs [--json]           # rules of the declared Kaizen Packs
node "$K" pack new <name>          # creates and declares a local pack
node "$K" gate on --plan <p> | off | status     # Stop-hook quality gate
node "$K" review record --verdict ready|concerns|blocked [--run <d>]   # reviewed state, required before git push
node "$K" review waive --reason "…" | review status | review check   # waiver (confirmed by the user) / state
node "$K" constitution [check] [--json]         # CONSTITUTION.md articles / validation
node "$K" plan check <path>        # structural check of a plan (R/AE → U traceability, constitution)
node "$K" size [--base <ref>]      # diff size vs pr.max_lines (exit 1 above)
node "$K" verify --only audit      # dependency audit (outside the gate, on request)
node "$K" pr snapshot|watch|mark|threads|reply|resolve|comment|update-branch   # PR tracking
node "$K" dev detect | dev probe --url <u>      # dev server
node "$K" metrics [--since 90d]    # approximated DORA + loop health
node "$K" adr new --title "…" | adr list        # architecture decisions
node "$K" postmortem new --title "…"            # postmortem
node "$K" release notes [--from <tag>]          # release notes + SemVer
node "$K" deploy request|run <env> [--ref r] | rollback <env> | list | flag on|off <name>   # deployment (deploy/<env>/… tag)
node "$K" monitor check|watch [--env e] [--plan p] [--minutes n]   # production signals against their thresholds
node "$K" monitor patrol --env e | alert [--file f] | incident open|resolve|list   # continuous detection, incidents
node "$K" run-dir reviews         # local working folder for a run (ignored by git)
```

If `${CLAUDE_PLUGIN_ROOT}` is not resolved in a Bash command, find the plugin path from this file's
path (the parent folder of `references/`).

## Adoption profile

`node "$K" config` → `profile` scales the **ceremony**, never the deterministic gates: the Stop-hook
quality gate, `verify`, `size`, `plan check` and the review required before `git push` stay active in
every profile.

| Point | `lean` | `standard` (default) | `full` |
|---|---|---|---|
| Plan | short: requirements, units, verification; threats and rollout only if the diff touches a risk surface or production | complete | complete, threats and rollout always |
| `doc-review` | `plan check` + coherence only | coherence, feasibility + conditional ones | every relevant reviewer, adversarial always |
| `review` | core (`correctness`, `standards`) + `security` on a risk surface | depending on the diff | depending on the diff, `adversarial` from the targeted depth |
| `autopilot` | change ≤ ~30 lines with no risk surface: `work` directly without a written plan (verify, review and gates kept) | always a plan | always a plan |
| Capture | proposed only when the durability test is obvious | proposed | always assessed |

A **risk surface**: auth, sessions, permissions, personal or payment data, migrations, public APIs,
dependencies. Starting in `lean` then raising the profile once the team has found its rhythm is the
recommended adoption path: that is the kaizen spirit, small steps.

## Push gate

The `PreToolUse` hook refuses a `git push` of a branch (other than the default branch) until a review
has recorded the pushed state. Every skill that pushes first checks `node "$K" review check`:
- refused → `kaizen:review` (in `mode:agent` within an autonomous flow), P0/P1 fixes, then push;
- `review` records the reviewed state itself (`review record`), and records it again after applying
  its own fixes;
- **`review record` requires evidence**: a hook logs every Kaizen code reviewer actually launched
  through the `Agent` tool. Without a reviewer launched since the previous review, recording is only
  accepted for a light review (branch diff ≤ 20 lines) or an update after fixes
  (≤ `review.max_unreviewed_lines` lines since the reviewed tree);
- beyond `review.max_unreviewed_lines` lines changed since the review (80 by default), a new review is
  required;
- **only the user can waive it**: at their request, `node "$K" review waive --reason "<their
  request>"` prints a code; ask them to type `kaizen waive <code>` themselves (valid 30 min). You
  cannot confirm it for them, and a confirmed waiver appears in the PR ("Review waived" section). In
  non-interactive mode, no waiver: stop and say why;
- the review state files (`.kaizen/state/reviews.json`, `review-evidence.json`, `waivers.json`) are
  only written by the CLI and the hooks. Never bypass or disable it (`review.require_before_push:
  false`) without the user asking.

## Deployment

Kaizen only deploys through `/kaizen:deploy`, with the commands the team declared
(`deploy.environments`), never guessed ones. A protected environment (`production` by default)
requires a code the user types themselves (`kaizen deploy <code>`); its raw command is refused by the
hook, and `deploy/…` / `rollback/…` / `incident/…` / `resolve/…` tags are only created by the CLI.
After each deployment, signals (`monitor.signals`, plan thresholds) are watched; a breached threshold
→ rollback first, postmortem next. `autopilot` never deploys.

## Deliverables root

Read `node "$K" root` before composing a path. By default everything lives under `docs/`:

| Folder | Content | Written by |
|---|---|---|
| `<root>/plans/` | unified plan: requirements then implementation plan, **a single file** that grows | brainstorm, plan |
| `<root>/learnings/` | captured learnings, one per file, validated frontmatter | learn, prune-learnings |
| `<root>/ideation/` | ranked ideas | ideate |
| `<root>/adr/` | numbered architecture decisions (`NNNN-title.md`) | decide |
| `<root>/postmortems/` | incident postmortems | postmortem |
| `<root>/metrics/` | measurement reports (optional) | metrics |
| `CONSTITUTION.md` | non-negotiable, versioned engineering principles | constitution |
| `kaizen-packs/<pack>/` | prescriptive team rules | setup, learn (with approval) |
| `.kaizen/config.json` | versioned configuration (`config.local.json` = personal override, ignored by git) | setup |
| `.kaizen/state/` | local state (gate, reviews, deployments) — auto-ignored by git | CLI |

No deliverable carries mutable state ("in progress", "done"): progress is read from git.

## Language

These instructions are written in English; **the conversation and the deliverables are not bound to
English.**
- **Talk to the user in their language** — the language of their messages. A French-speaking user
  gets French answers, questions and reports, even though this skill is written in English.
- **Deliverables** (plans, learnings, ADRs, postmortems, constitution, PR descriptions, review
  replies) follow `config.language`: `auto` (default) = the language of the conversation, otherwise
  `en`, `fr`… Section titles and fixed labels shown in these instructions (for example "Reviewer
  guide", "Review waived", "looks ready") are translated into that language.
- **Never translated**, because tools rely on them: `<!-- kaizen:<id> -->` markers, frontmatter keys
  and values, ids (R1, AE1, KTD1, U1, S1), CLI commands and flags, `kaizen waive <code>` /
  `kaizen deploy <code>` confirmations, file paths.
- The deterministic tools accept the plan and constitution field names in English and, for older
  repos, in French (`**Check:**`/`**Contrôle :**`, `**Covers:**`/`**Couvre :**`,
  `NON-NEGOTIABLE`/`NON NÉGOCIABLE`, `[NEEDS CLARIFICATION: …]`/`[À CLARIFIER : …]`…).

## Stable ids

- `R1, R2…` requirements · `AE1…` acceptance examples (`covers R2`) · `KTD1…` key technical decisions
  · `U1…` implementation units · `S1…` slices.
- Continuous numbering, never reused. A rule is written in full **only once**, on its id; elsewhere it
  is cited ("per R4").
- Paths always relative to the repo.

## Questions to the user

- **One question per turn**, through `AskUserQuestion` (2 to 4 options, the recommended one first with
  "(Recommended)"). Without that tool: numbered options in the chat.
- Only ask what the code, the config or the conversation does not settle.
- A decision already made in the conversation is **settled**: do not ask it again, record it.
- Non-interactive modes (`mode:auto`, `mode:return`) ask **no** question: they take the conservative
  default and record it. `mode:return` also replaces the final "what next?" menu with its return value and
  stops there: it is the mode to drive a skill from a script, a CI job or another agent one step at a time.
  Without it, a headless run takes the menu's recommended option and goes on to the next skill.

## Subagents

**The right model for each agent.** Before launching agents, read `node "$K" models --json` once and
pass each `Agent` call that agent's `model` parameter (`agents.<name>.model`; `inherit` → pass none).
A `general-purpose` subagent implementing a unit takes `roles.implement.model`. That is the team's
policy (profile, then the config's `models`): do not change it "to go faster"; if an agent fails for
lack of capability, relaunch it once with the next model up and say so in the report.

Plugin agents are invoked with the `Agent` tool, `subagent_type: "kaizen:<name>"`. If that type does
not appear in the list of available agents, use `general-purpose` and paste the content of
`${CLAUDE_PLUGIN_ROOT}/agents/<name>.md` (without the frontmatter) at the top of the prompt.

Launch independent agents **in a single message** (real parallelism). Give each one a self-contained
context: resolved paths, plan excerpt, what is expected back, return format. An agent does not see
the conversation.

## Commits

Same format as the marketplace's `git` plugin: `<type>(<JIRA>): <description>` if a Jira key
(`[A-Z][A-Z0-9]+-\d+`) is in the branch name, otherwise `<type>: <description>`.
- Only stage the unit's files (`git add <files>`), never `git add -A` or `git commit -a`: the user may
  have work in progress.
- Never commit to the default branch without an explicit request: create a branch (`feat/<topic>`,
  `fix/<topic>`, prefixed with the Jira key if known).
- Never `push --force`, never merge without explicit permission.
- A unit or a fix that **applies a learning** cites it in the commit body
  (`Applies docs/learnings/<…>.md`): that is what `/kaizen:metrics` counts as a learning actually
  applied, not just read.

## Kaizen Packs

A pack is a folder of prescriptive rules ("what work in this area **must** follow"), whereas a
learning tells what a past problem taught. One rule = one top-level `.md` in the pack with `title` and
`applies_when` (a list of situations). Subfolders are storage. Packs are **declared** in
`.kaizen/config.json → packs`, never discovered:

```json
"packs": [
  { "source": "kaizen-packs/house-rules" },
  { "source": "~/kaizen-packs/my-style" },
  { "source": "https://github.com/org/packs", "ref": "v1.2.0", "pack": ["rails"] }
]
```

Brainstorm and plan anchor on them, review enforces them. Every constraint coming from a pack is cited
`(pack: <id>, <file>)`. Read the list first (`node "$K" packs --json`: titles and `applies_when`),
compare `applies_when` semantically to the work, and only read the body of the rules that apply.

## Tone of deliverables

Conclusion first, reason next. No filler: an empty or obvious section is omitted. No trace of the
process ("in phase 2 I…") in deliverables. Diagrams complement prose, they never replace it.
