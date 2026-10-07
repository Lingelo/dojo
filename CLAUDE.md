# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A **plugin marketplace** for Claude Code — not a traditional application. There is no build system, no package.json, no test runner. Plugins are metadata-driven (JSON + Markdown) and dynamically loaded by Claude Code.

## Architecture

```
.claude-plugin/marketplace.json   ← Plugin registry (name: "dojo")
plugins/<name>/
  ├── .claude-plugin/plugin.json  ← Metadata (name, version, description, author)
  ├── README.md
  ├── skills/<name>/SKILL.md      ← User-invocable skills (/command)
  ├── commands/<name>.md           ← Slash commands
  ├── agents/<name>.md             ← Agent system prompts
  ├── hooks/hooks.json             ← PreToolUse/Stop/Notification hooks
  ├── scripts/                     ← Node.js/Bash implementations
  ├── .mcp.json                    ← MCP server definitions
  └── .templates/                  ← Structured output templates
```

## Plugin Types

| Type | Format | Triggered by |
|------|--------|-------------|
| **Skill** | `SKILL.md` with YAML frontmatter | `/command` (e.g. `/kaizen:plan`, `/motion-video`) |
| **Command** | Markdown with YAML frontmatter | `/command` (e.g. `/my-command`) |
| **Agent** | Markdown system prompt | Automatic matching or explicit invocation |
| **Hook** | `hooks.json` → scripts | Tool events (PreToolUse, Stop, Notification, UserPromptSubmit) |
| **MCP** | `.mcp.json` | External service integration |

## 2 Plugins

- **motion-studio** — `/motion-video` skill: motion design as code. `scripts/render.mjs` renders HTML/CSS/SVG/Canvas compositions frame by frame (virtual clock + WAAPI/SMIL seeking, Playwright CDP capture → ffmpeg) to MP4/WebM/GIF/MOV, with sample-accurate synced sound (`data-sfx` / `__sfx()` cues, procedural SFX + music bed in `sfx.mjs`, beat/energy analysis in `audio.mjs` exposed as `window.__audio`), plus voice-over and subtitles (`voice.mjs` local TTS — Kokoro/Piper/say/SAPI/eSpeak or user recordings — measures real line timings, `captions.mjs` builds/parses SRT/VTT; `render.mjs --voice/--subs` mixes narration with music ducking, burns in captions and writes `.srt/.vtt`, exposed as `window.__captions`). Also `/slides`: presentation decks as one HTML file from `skills/slides/assets/deck.html` (19 layouts as `data-layout`, 3 themes — `ink`, `paper`, `kaizen` (washi/sumi/vermilion, ensō + hanko drawn by the runtime) + BRAND tokens, presenter runtime with steps/notes/overview); `scripts/slides.mjs` scaffolds (`new --layouts`), audits each slide in Chromium (`check`: overflow, collisions, safe area, contrast, density) and exports PDF/PNG/contact sheet; tests `node --test plugins/motion-studio/tests/*.test.mjs`. Self-sufficient: `scripts/setup.mjs` reuses or auto-installs playwright-core, ffmpeg-static and Chrome Headless Shell into `${CLAUDE_PLUGIN_DATA}` (the one plugin with npm deps, declared in its `package.json`).

- **kaizen** (3.2, self-sufficient since the other plugins left; English since #17; French plans/constitutions from 2.x still parsed) — AI-assisted SDLC built on Every's Compound Engineering loop (MIT, see `plugins/kaizen/LICENSE`) plus Spec Kit's constitution. 23 skills invoked `/kaizen:<skill>`: `help` (orientation, reads `kaizen.mjs status`), `deploy` and `monitor` (team-declared deploy/rollback/flag commands and production signals in `.kaizen/config.json`; protected envs need a user-typed `kaizen deploy <code>`; annotated tags `deploy/<env>/…`/`rollback/<env>/…` feed real DORA in `metrics` and postmortem timelines; `scripts/deploy.mjs`, `scripts/monitor.mjs`; `monitor patrol` (scheduled confirmed check) and `monitor alert` (Alertmanager/PagerDuty/Datadog/generic payloads) open dated incidents as `incident/<env>/…` tags (resolved by rollback or `resolve/<env>/…`), feeding DORA failure rate and time to restore; `deploy detect|configure` in `scripts/deploydetect.mjs` recognizes the platform — Vercel, Netlify, Fly, Heroku, Kamal, Capistrano, Helm, Kustomize, Serverless, SAM, Firebase, GitHub Actions, Makefile/npm, Compose, Terraform), `constitution`, `ideate`, `brainstorm`, `decide` (ADR), `plan`, `doc-review`, `work`, `debug`, `polish`, `review`, `ship`, `address-feedback`, `watch-pr`, `release`, `learn`, `prune-learnings`, `postmortem`, `metrics`, `autopilot`, `setup`. 21 read-only agents (5 research, 6 plan reviewers sharing `references/doc-review-contract.md`, 10 code reviewers sharing `references/review-contract.md`). Artifacts live in the target repo: `CONSTITUTION.md` (articles each with a **Check:**, enforced by `plan check`, doc-review and standards-reviewer; hierarchy constitution > packs > learnings; written headless it is a `status: draft` that informs but never blocks until ratified), one unified plan per topic in `docs/plans/` (`kaizen-plan/v1`, `<!-- kaizen:<id> -->` markers incl. constitution/threats/rollout, R/AE/KTD/U IDs, PR-sized slices), learnings `docs/learnings/`, `docs/adr/`, `docs/postmortems/`. `scripts/kaizen.mjs` is a zero-dependency CLI for all deterministic work (verify, plan check, size, learnings, packs, constitution, PR snapshot/watch via `pr.mjs`, dev server, DORA metrics, ADR, release notes); `scripts/quality-gate.mjs` is a Stop hook blocking while verify is red during work/autopilot (scoped to the session that ran `gate on` via a PostToolUse `--claim`, time-budgeted under the hook timeout); `scripts/secret-gate.mjs` is a PreToolUse hook refusing a `git commit` that adds a key or token (~30 patterns in `scripts/secrets.mjs`, also `kaizen.mjs secrets scan` and the `audit fix secret_scanning` PR workflow; refuses `--no-verify`; active in every repo, `secrets.scan`/`secrets.ignore` in config); `.mcp.json` bundles the Playwright MCP server (pinned) used by polish/work/autopilot; `scripts/review-gate.mjs` is a PreToolUse hook refusing `git push` of a branch until `/kaizen:review` recorded the pushed tree (`review record`, which requires evidence that Kaizen code reviewers actually ran — logged by `review-hooks.mjs --evidence`, a PostToolUse hook on Agent — except light reviews ≤ 20 lines or post-fix updates; `review waive --reason` only issues a code the user must type as `kaizen waive <code>`, confirmed by the `review-hooks.mjs --confirm` UserPromptSubmit hook; state in `review-state.mjs`, direct writes blocked). `profile: lean|standard|full` in `.kaizen/config.json` scales ceremony, never the deterministic gates. `scripts/models.mjs` maps every agent to a role and every role to a model per profile (`models.roles` / `models.agents` overrides, `kaizen.mjs models`); skills pass that `model` to each Agent call and review evidence records it. `scripts/audit.mjs` (`kaizen.mjs audit`, `/kaizen:setup audit`) scores SDLC maturity in five areas and scaffolds ci/pr_template/dependabot/codeowners/gitignore_env without overwriting. The Stop hook also records token usage from the transcript, main session plus subagents (`<session>/subagents/agent-*.jsonl`, attributed to a role via launches logged by the Agent hook in `scripts/cycle-agents.mjs`); verify commands run through `scripts/run-bounded.mjs`, which kills the whole process tree on timeout; `gate off` appends the cycle to `.kaizen/state/cycles.jsonl` (`metrics` → `cycle_cost`); `gate.targeted` runs `{files}`-scoped checks. `plan check` warns on rollout without rollback/signal/threshold, `release notes` extracts rollout of shipped plans; constitution `approvers` require an approved amendment per version. Tests: `node --test plugins/kaizen/tests/*.test.mjs` (unit, CLI, gate, PR with fake `gh`, contracts — run after any skill/agent/CLI/doc change; contracts require the README to list every CLI command and hook, `docs/README.md` to list every guide, and every relative doc link to resolve). User docs: `plugins/kaizen/docs/` (getting-started, configuration, packs, troubleshooting, positioning, one guide per skill); end-to-end evals: `node plugins/kaizen/evals/run.mjs` (real `claude -p`, costly); CI in `.github/workflows/kaizen.yml`.

## Adding a New Plugin

1. Create `plugins/<name>/` with `.claude-plugin/plugin.json`
2. Add skills, commands, agents, hooks, or MCP config as needed
3. Register in `.claude-plugin/marketplace.json` (plugins array)
4. Add a `README.md`

## Key Conventions

- **Plugin JSON schema**: `plugin.json` must have `name`, `version`, `description`, `author`
- **SKILL.md frontmatter**: requires `name`, `description`, `allowed-tools` fields
- **Hook exit codes**: 0 = allow, 2 = block (message on stderr)
- **Hooks over deny rules**: gates use PreToolUse hooks, not settings.json deny rules (due to [known bugs](https://github.com/anthropics/claude-code/issues/6699))
- **Git commits**: conventional format `<type>(<JIRA>): <description>` — Jira extracted from branch name
- **Cross-platform**: scripts run on macOS, Linux and Windows (Kaizen CI covers all three)
- **No build step**: everything is interpreted at runtime by Claude Code
- **Language**: everything in the repo is written in English (READMEs, skills, agents, script and hook messages, docs). Skills and agents tell Claude to talk to the user in the user's language; Kaizen deliverables follow `language` in `.kaizen/config.json`. Exception: French-compat parsing/fixtures in Kaizen
