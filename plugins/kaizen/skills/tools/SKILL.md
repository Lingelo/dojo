---
name: tools
description: Picks the right tool for a step — an MCP server (Playwright and other browsers, GitHub, Jira/Linear, Sentry/Datadog, databases, Figma, docs servers like Context7), a CLI or a built-in — from what this repo and session really have. Inventories the declared MCP servers (project .mcp.json, local and user scopes, the Playwright server Kaizen ships) and CLIs, classifies the step into one intent of a fixed vocabulary, lets the CLI pick (ordered preferences, first available wins), and asks instead of guessing. Flags unpinned or unapproved servers. Read-only. Use when the user asks "which tool should I use to…", "Playwright MCP or a Playwright test?", "which MCP servers do I have?", "why can't Claude open the browser?", /kaizen:tools [intent or situation].
allowed-tools: Bash(node:*), Read, Glob, Grep, AskUserQuestion
argument-hint: "[empty = inventory | intent (see-page, ui-check, logged-in, read-web, library-docs, call-api, github, ticket, observability, database, design) | situation]"
---

# Tools — the right tool for the step

**Outcome:** the user knows **which tool to use for their step**, why that one, how to use it well, and
what to do when it is missing. Read-only: no server added, approved or removed, no configuration
written. Answer in the user's language.

Read `${CLAUDE_PLUGIN_ROOT}/references/tool-choice.md` (principles, intents, Playwright MCP usage).
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

## 1. Inventory

`node "$K" tools --json` → declared servers (name, scope, status, category, pinned), CLIs on the PATH,
whether the repo has a Playwright test suite, warnings. Then **reconcile with this session**: the
`mcp__<server>__*` tools you actually have (deferred ones included) are the truth.
- declared and loaded → available;
- declared but not loaded (needs approval, failed to start, disabled) → missing, with the reason;
- loaded but not declared here (claude.ai connector, another plugin) → available, category from its
  name and tools.

## 2. Answer according to the invocation

**Without an argument** — in under 25 lines: the servers by category (browser, github, tracker,
observability, database, design, docs, other) with what each is good for **in this repo**, the useful
CLIs, the warnings from `tools` (unpinned version, waiting for approval, duplicate), and the three
intents the user is most likely to need here.

**With an intent or a situation**:
1. **Classify** the step into exactly one intent of the vocabulary (`node "$K" tools intents`). Two
   intents fit equally — typically `see-page` (now) vs `ui-check` (must keep holding) — → one
   question with both options and what each produces. Do not pick for the user.
2. `node "$K" tools pick <intent> --json` → pick, alternatives, missing, fallback. Correct it with the
   reconciliation of step 1: a server loaded but not declared can be the pick; one declared but not
   loaded cannot.
3. Answer: **the tool** (exact server or command), **how** to use it for this step (the first calls,
   from the reference), **why** this one over the alternatives in one sentence, and **if missing**,
   what would make it available (approve in `/mcp`, `gh auth login`, add the server — the user's call).
   Pick `ask` → say what to ask the user, never improvise a riskier tool.

## 3. Limits

- Never add, approve, enable or remove an MCP server, never edit `.mcp.json` or settings: propose the
  exact change, the user makes it.
- Never use a server to write outside the repo (comment, ticket, query that writes) from this skill.
- A secret seen in a configuration (token in an env var or an URL) is never shown: `tools` already
  hides them; do not read them back from the files.
- Suggest `/kaizen:learn` when a choice is specific to this repo and worth keeping ("the staging admin
  is only reachable through the user's browser").
