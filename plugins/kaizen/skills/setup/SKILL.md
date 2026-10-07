---
name: setup
description: Installs the Kaizen SDLC in a repo and audits it — project maturity diagnosis (audit: CI, tests, secrets, branch protection, CODEOWNERS, dependencies, deployment, rollback, monitoring, constitution) with a prioritized roadmap and guided fixes; creates .kaizen/config.json and the deliverable folders, detects the stack, the verification commands and the deployment platform, sets profile, models, language and tracker, creates a Kaizen Pack (pack:<name>), health check (check). Use when the user says "install/configure kaizen", "set up the SDLC", "audit the project", "what is this repo missing?", /kaizen:setup.
allowed-tools: Bash(node:*), Bash(git:*), Read, Write, Edit, Glob, AskUserQuestion
argument-hint: "[audit] [pack:<name>] [check]"
---

# Setup — preparing the repo for the Kaizen loop

Read `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

Prerequisites: Node ≥ 18 and a git repository. Otherwise, say what is missing and stop.

## `check` — health check only (no writes)

`node "$K" root`, `node "$K" config`, `node "$K" detect`, `node "$K" learnings validate`,
`node "$K" packs`, `node "$K" constitution check`, `node "$K" gate status`, `node "$K" review status`,
`node "$K" models` (warnings) → report: ✔/⚠ per point, with the proposed fix.
A gate left active without work in progress (`gate status` active) → propose `gate off`.

## `audit` — set up the SDLC, in order

For a project starting with Kaizen, or one that wants to know what it is missing.

1. `node "$K" audit` (add `--no-github` if `gh` is not authenticated). Show the areas and their score,
   then the list **by priority**: P1 first (what protects: CI, tests, secrets, branch protection,
   deployment and rollback), then P2 and P3. Nothing green needs redoing.
2. Offer to handle the points **one by one**, highest priority first, one question at a time
   (**fix** (Recommended) · **later** · **never for this repo**):
   - **scaffold** (`scaffold` not null) → `node "$K" audit fix <id>` (CODEOWNERS: ask for
     `--owner @…` first, never invent it; `monitor_patrol`: also offer `monitor_alert` if the team has
     alerts, and a pinned `--ref <sha>` of the Kaizen repository — same for `secret_scanning`). Show the written file; it stays
     uncommitted, to be reviewed;
   - **deployment** → `node "$K" deploy detect`, show the candidates (commands, rollback, confidence,
     notes), have the user choose, then `node "$K" deploy configure <id>`; nothing recognized →
     installation step 9;
   - **monitoring / health** → declare at least the health-check (environment URL, health route
     found), then `node "$K" monitor check --env <env>`;
   - **branch protection** → give the exact settings (required PR, one approval, required CI): it is a
     repository administration setting, you do not change it;
   - **skill** (`skill` not null: constitution, setup) → propose it, only chain it with approval.
3. Rerun `node "$K" audit` at the end and show the before/after scores. What remains is noted with its
   reason ("later", "never").

## Installation (default)

1. **Initialize** — `node "$K" init` (idempotent: does not rewrite an existing config). Show what was
   created.
2. **Verification** — show the detected commands (`test`, `lint`, `typecheck`). Ask (one question):
   **keep them** (Recommended) · **adjust them** (then write `verify` in `.kaizen/config.json`, e.g.
   `{"test": "pnpm vitest run", "lint": "pnpm eslint ."}`) · **disable the gate** (`gate.enabled:
   false`). Nothing detected → ask for the commands or disable it. Run `node "$K" verify` once to check
   they work; a command already failing on the default branch is reported (the gate would block
   wrongly). Slow suite (over a minute) → propose **targeted** checks for the gate, `gate.targeted`
   with `{files}` (e.g. `{"test": "pnpm vitest related --run {files}", "lint": "pnpm eslint
   {files}"}`); the full verification remains the one of `work` and `ship`.
3. **Language** — `language: auto` follows the conversation; offer to pin it (`en`, `fr`…) if the team
   writes its deliverables in a specific language.
4. **Tracker** — `tracker: auto` (Jira key read from the branch, GitHub issues through `gh`); adjust if
   the team uses something else.
5. **Location** — `docs_root: docs` by default. If `docs/` is already a published documentation site,
   propose another folder (e.g. `.kaizen/docs` or `engineering/`) before any first deliverable.
6. **Findability** — with approval, add to `CLAUDE.md` (existing only; otherwise propose `/init`
   first) a short section:

   ```markdown
   ## Kaizen
   - Before planning or debugging, look for the project's learnings in `docs/learnings/`
     (frontmatter: module, tags, symptoms, applies_when).
   - Plans in `docs/plans/`; loop: /kaizen:brainstorm → plan → work → review → learn.
   ```
7. **Constitution** — no `CONSTITUTION.md` → propose `/kaizen:constitution` (Recommended): without it,
   plan and review only have generic rules. Present → `node "$K" constitution check`.
8. **PR size** — `pr.max_lines` (400 by default): ask whether the team has another limit.
9. **Deployment and monitoring** (optional) — if the team wants Kaizen to drive production releases
   too: `node "$K" deploy detect` recognizes the platform (Vercel, Netlify, Fly.io, Heroku, Kamal,
   Capistrano, Helm, Kustomize, Serverless, SAM, Firebase, GitHub Actions workflows, Makefile, npm
   scripts, Compose, Terraform) and proposes commands, rollback and health-check. Show them with their
   notes, have the user choose, then `node "$K" deploy configure <id>`. Nothing recognized → ask for
   the commands, never invent them. Complete the signals (error rate, latency: a command printing a
   number). `production` is protected by default. Check with `node "$K" monitor check --env <env>`.
10. **Profile** — ask (one question), chosen by the **stakes of the repo**, never by the team's
   experience with Kaizen: **lean** (prototype, spike, internal tool: minimal ceremony, gates kept) ·
   **standard** (a product in production) · **full** (regulated or critical domains: payment, health,
   sensitive data at scale). Mark as Recommended the one the repo suggests (deployment detected, risk
   surfaces, domain); unsure → **standard**. The profile also sets
   **each agent's model** (`node "$K" models`): show it, and offer to adjust a role (`models.roles`)
   or an agent (`models.agents`) if the team has a cost or quality constraint. Write `profile` in
   `.kaizen/config.json`. Team of several people → propose `approvers` in `CONSTITUTION.md` and a
   `CODEOWNERS` line for `CONSTITUTION.md` and `kaizen-packs/`. Remind that a review is required
   before any `git push` of a branch (`review.require_before_push`) and that only the team can choose
   to relax it.
11. **Summary** — open it with the **profile in effect and what it costs**, on its own line, before anything
   else: e.g. "Profile **lean**: code review on sonnet, critical review on sonnet (opus in standard) — change
   it with `profile` in `.kaizen/config.json`". It decides the price and depth of every later review, so it
   is never buried among the assumptions, least of all when it was chosen without asking. Then the health
   check above and the command to run next
   (`/kaizen:brainstorm <idea>` or `/kaizen:ideate`); remind that `/kaizen:help` says at any time what
   to do next.

## `pack:<name>` — create a Kaizen Pack

1. `node "$K" pack new <name>` creates `kaizen-packs/<name>/` (README + `research/` storage folder) and
   declares it in `.kaizen/config.json`. Refuses to write into a non-empty folder.
2. If the user described a first rule, write it: `kaizen-packs/<name>/<slug>.md`

   ```markdown
   ---
   title: Pages receive their data as server props, never through a parallel JSON endpoint
   applies_when:
     - adding a page that needs server data
     - adding or changing an endpoint consumed by the application's pages
   tags: [routes, props, api]
   ---

   <the rule, its reason, and the exception if any — no biography or history>
   ```

   `applies_when` describes **situations**, with the words a feature request would use ("adding a
   page…"), not topic labels ("architecture"). One situation per line; two or three concrete
   conditions beat an abstract one. Two rules of the same pack do not prescribe the same thing.
3. `node "$K" packs` to show the resolved pack and its warnings, if any.

Packs shared between repos: declare a pinned git source (`{"source": "https://github.com/org/packs",
"ref": "v1.2.0", "pack": ["rails"]}`); it is cloned into a cache in the plugin's data
(`node "$K" packs --refresh` to update it).
