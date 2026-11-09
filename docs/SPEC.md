# Spec: Kaizen 6.0, agent-skills as the base

Written in agent-skills' format (`spec-driven-development`): this repository now uses Addy Osmani's
artifacts for its own work. Background and decisions: `docs/ideation/2026-11-09-kaizen-6-ideation.md`
(sections Direction, Convergence, Proposed order). Plan: `tasks/plan.md`. Tasks: `tasks/todo.md`.

## Objective

Kaizen converges on [agent-skills](https://github.com/addyosmani/agent-skills): his skills become the
base, Kaizen becomes the engine that makes them hold (gates, evidence, memory, production, hosts).
6.0 is the first step — and, decided on 2026-11-09 ("on supprime ops"), the release that removes
production from Kaizen (kaizen-ops, `deploy`, `monitor`, `postmortem`): a team enables `agent-skills@dojo` next to Kaizen, works with his commands
(`/spec`, `/plan`, `/build`, `/review`, `/ship`…) and his files (`SPEC.md`, `tasks/`, `CONSTRAINTS.md`),
and keeps Kaizen's gates **without running a Kaizen command for them**.

Who: teams already on Kaizen, and teams on agent-skills who want guarantees. Decided by Angélo LIMA
on 2026-11-09 ("on converge vers Osmani le plus possible en adaptant", option B, then "go A, B et C").

## Tech Stack

- Node ≥ 18, zero npm dependency (Kaizen's CLI and hooks).
- Claude Code plugin format; dojo marketplace (`.claude-plugin/marketplace.json`).
- GitHub Actions for the sync; `gh` in the workflow to open pull requests.
- agent-skills 0.6.15 (MIT), copied unmodified.

## Commands

```bash
node --test .github/scripts/sync-plugin.test.mjs          # sync script (kioku + agent-skills)
node --test plugins/kaizen/tests/*.test.mjs              # Kaizen: unit, CLI, gates, contracts
node --test plugins/kaizen-ops/tests/*.test.mjs          # kaizen-ops
node .github/scripts/sync-plugin.mjs --plugin agent-skills --source addyosmani/agent-skills --ref main
node plugins/kaizen/scripts/kaizen.mjs doctor           # what the engine sees of agent-skills
node plugins/kaizen/scripts/kaizen.mjs doctor
```

## Project Structure

```
.github/scripts/sync-plugin.mjs       copy script (renamed from sync-kioku.mjs), gains --plugin
.github/workflows/sync-agent-skills.yml   new: refresh by pull request
plugins/agent-skills/                new: synced copy, never edited here
plugins/kaizen/scripts/agentskills.mjs    new: reads his four files
plugins/kaizen/scripts/review-state.mjs   his reviewers recognized, his review recorded
plugins/kaizen/scripts/review-hooks.mjs   records it from the PostToolUse hook
plugins/kaizen/scripts/doctor.mjs    `agent_skills` check
plugins/kaizen/docs/guides/agent-skills.md, plugins/kaizen/docs/hosts.md   new docs
docs/SPEC.md, tasks/plan.md, tasks/todo.md   this work, in his format
```

## Code Style

Follow the neighbouring Kaizen scripts: ES modules, zero dependency, small exported functions, a header
comment saying what the file is for and its exit codes, English messages prefixed `[kaizen]`.

```js
// Kaizen reviewer in an Agent tool call — or one of agent-skills' personas.
export function reviewerOf(toolInput = {}) {
  const type = String(toolInput.subagent_type || '');
  const persona = /^(?:agent-skills:)?(code-reviewer|security-auditor|test-engineer|web-performance-auditor)$/.exec(type);
  if (persona) return `agent-skills:${persona[1]}`;
  // … existing Kaizen detection
}
```

## Testing Strategy

- `node:test`, test first for every script change, fixtures in `plugins/kaizen/tests/fixtures/`.
- His files: fixtures shaped like his templates (`planning-and-task-breakdown`,
  `spec-driven-development`, `constraint-driven-development`), including CRLF (Windows).
- Gates: the existing `review.test.mjs` helpers (temporary git repos), with recorded persona outputs.
- Hosts: real payloads recorded from Claude Code (`claude -p`, available in the session);
  Codex and Copilot CLI payloads built from their official hook documentation and marked as such.
- CI on macOS, Linux and Windows (`.github/workflows/kaizen.yml`).

## Boundaries

- **Always:** keep `plugins/agent-skills/` byte-identical to upstream (except `.github/` and the marker
  file); run the test commands above before each commit; keep every new engine path inert when his
  files are absent or his plugin is disabled; write everything in English.
- **Ask first:** changing a Kaizen skill's behavior; touching kioku's sync behavior beyond adding
  parameters; adding a dependency; anything that changes the push gate for repos without agent-skills.
- **Never:** add a CLI command Osmani's workflow does not need (decided 2026-11-09: the engine shrinks,
  it does not grow); edit files under `plugins/agent-skills/` or `plugins/kioku/`; push the agent-skills sync
  directly to `main`; remove or rewrite Kaizen's development skills in 6.0 (their deprecation is 6.1).

## Success Criteria

1. `agent-skills@dojo` is listed in the marketplace and loads in Claude Code; its files match upstream
   at the recorded commit.
2. A newer upstream commit arrives as a pull request whose body lists changed hooks and scripts under
   "Executable changes"; `main` is untouched until merge. kioku's sync is unchanged.
3. Kaizen reads his four files (spec, plan, tasks with their files and verification, constraints)
   without any new command: the parser feeds `doctor` now and the gates in 6.1.
4. `kaizen doctor` reports whether `agent-skills@dojo` is enabled, which of his files exist, whether
   his floor guard is wired when `CONSTRAINTS.md` exists, and an info line when both plugins are on.
5. After `agent-skills:code-reviewer` reviews a 120-line branch with no Critical finding, `git push`
   is allowed without any Kaizen command; with a `Critical:` finding, pushing the same tree is refused
   until the code changes and a new review is clean.
6. `docs/guides/agent-skills.md` explains running both in 6.0; `docs/hosts.md` records, dated, what
   was measured on Claude Code and what is documented-only for Codex and Copilot CLI.
7. All test commands green on the three OSes; Kaizen 6.0.0 released, with production removed and
   `kaizen upgrade` listing a repository's production leftovers (`production-removed`).

## Open Questions

- Does Claude Code name his personas `agent-skills:code-reviewer` or `code-reviewer`? → measured
  during the Claude Code spike; the code accepts both.
- Do his `.sh` hooks run on Windows? → unknown; recorded as a known gap in `docs/hosts.md` if they do
  not, reported upstream.
- Real behavior on Codex and Copilot CLI → not measurable in this session (no accounts); revisit when
  someone has them.
