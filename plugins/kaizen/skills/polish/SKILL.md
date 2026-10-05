---
name: polish
description: Polishes the experience of a feature that already works, guided by the user on the live page — detects and starts the dev server (Next, Vite, Nuxt, SvelteKit, Astro, Angular, Rails, Django, Phoenix, Laravel, .claude/launch.json), opens the page in the browser (Playwright), applies each piece of feedback live (spacing, copy, states, responsiveness, accessibility), checks by screenshot, and commits locally. Use when the user says "let's polish the UI", "polish", "let's tune the rendering before shipping", /kaizen:polish. Never pushes, does no autonomous QA.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion
argument-hint: "[PR number, branch, or empty = current branch] [url or route to open]"
---

# Polish — the user looks, Claude adjusts

Put a feature **that works** in front of the user and turn their observations into targeted touch-ups
on the running page. **The user directs** what is looked at and what changes: no autonomous checklist,
no general QA. Talk to the user in their language.

Read `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

**Done when:** the user says they are done, each requested touch-up is visible on the page or reported
as blocked, and the changes are committed **locally**. A server or working-copy blocker also ends the
session, reported with what is needed to resume.

**Limits**: never on the default branch; never a push or a PR (that is `/kaizen:ship`); only touch the
surface concerned by the feedback.

## 1. Workspace

- Named PR or branch: if it is already checked out in another worktree (`git worktree list`), work
  there; otherwise `gh pr checkout <n>` / `git switch <branch>` **only** if the current tree is clean.
  Without an argument: the current branch.
- Default branch with a clean tree → create a local branch `polish/<short-topic>` and say so (safe:
  nothing is pushed). Dirty tree on the default branch, or detached HEAD: say so and stop.

## 2. Dev server

**Always**, even if the user says they will not look or the touch-up seems trivial: the served page is
the only evidence that the touch-up renders what was asked, and the final report gives its URL and the
stop command by PID (`kill <pid>`, never `pkill`). Only a blocker (no candidate, port taken by another
project, unreachable server) exempts from it, and it is reported.

1. `node "$K" dev detect` → candidates (command, folder, port, URL, source). `.claude/launch.json` wins
   if it exists. Several candidates (monorepo) → ask which one; none → ask for the command and the
   port, without guessing.
2. **Port already in use** (`node "$K" dev probe --url <url> --timeout-seconds 2` answers): reuse it
   only if it really is this project (expected page, process visible in `lsof -i :<port>` or `ss`);
   otherwise ask: stop that process, another port, or give up. Never kill a process on your own.
3. Otherwise start it **in the background** (Bash tool, `run_in_background: true`) in its folder, with
   its environment, output redirected to a temporary file
   (`mktemp -d "${TMPDIR:-/tmp}/kaizen-polish-XXXXXX"`).
4. `node "$K" dev probe --url <url> --timeout-seconds 60`. Unreachable → show the last 20 lines of the
   started server's log and ask: fix the URL/the command, or stop.
5. After a successful automatic detection, offer **once** to save the tuple in `.claude/launch.json`
   (`{"configurations":[{"name","runtimeExecutable","runtimeArgs","cwd","port","env"}]}`).

## 3. Open and wait

Open the page (route passed as argument, otherwise the one the branch touches — `git diff --name-only`
towards page/route files) with the available browser tool: a Playwright MCP server
(`browser_navigate`, `browser_take_screenshot`, `browser_resize`), otherwise give the URL. Then say (in
the user's language):

```text
Dev server: <url>
Walk through the feature and tell me what could be better.
```

**Do not start a review while they browse.** Wait for their feedback.

## 4. Loop

For each piece of feedback:
1. Restate in one line what you will change if it is ambiguous (otherwise, do it).
2. Inspect the minimum (component, styles, copy); edit **the surface concerned** following the design
   system and existing components (no new color or magic spacing if tokens exist); hot reload updates
   the page.
3. If the user asks to see, or if the feedback is visual: screenshot after the change (and at 375 px
   wide if the feedback concerns mobile). Without a browser tool, ask them what they see.
4. Keep a running list: feedback → change → file.

Recurring feedback worth anticipating when it touches the area: empty / loading / error states,
visible keyboard focus, contrast, truncated text, small screens, double submit. Suggest them **once**,
in one line, without imposing them.

## 5. Close

When the user says they are done:
1. `node "$K" verify` (touch-ups must break nothing); red → fix or revert the faulty touch-up.
2. Local conventional commit (`style(<JIRA>): …` or `fix(<JIRA>): …` depending on the nature), files
   named explicitly — the user's earlier changes outside polish stay out of the commit.
3. Report: touch-ups applied, blocked (and why), commit(s), URL of the server **still running** and how
   to stop it: its exact PID (`kill <pid>`), never a pattern `pkill` that would hit other projects'
   servers. Suggest `/kaizen:ship` to ship, and `/kaizen:learn` if a touch-up revealed a UI rule worth
   keeping (or a "design" pack rule).
