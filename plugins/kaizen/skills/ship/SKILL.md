---
name: ship
description: Ships Kaizen work as a reviewable PR — green checks, size under the limit (otherwise split into stacked PRs), conventional commits with Jira, branch push (never the default branch), PR with a description from the plan (goal, covered requirements, evidence, constitution check, rollout and rollback) and a reviewer guide; then offers /kaizen:watch-pr. Can also only draft or refresh a PR description. Use when the user says "open the PR", "ship it", "push and create the PR", "update the PR description", /kaizen:ship.
allowed-tools: Bash(node:*), Bash(git:*), Bash(gh:*), Read, Write, Edit, Glob, Grep, AskUserQuestion
argument-hint: "[plan path] [description-only | refresh-description] [draft] [mode:auto]"
---

# Ship — a PR reviewers want to review

DORA 2025: with AI, PRs grow and **human review becomes the bottleneck**. A Kaizen PR is small, tells its
own story, and tells the reviewer where to look.

Read `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

**`mode:auto`** (set by `/kaizen:work`, `/kaizen:autopilot`, `/kaizen:watch-pr`): no questions; returns
`{ status: shipped|local-only|blocked, pr_url, branch, commits, size, notes }`.

## Modes

- **description-only** — draft the description (step 4) and show it; only publish if asked.
- **refresh-description** — the PR exists: rewrite its description if it no longer matches the diff
  (behavior added/removed, approach changed, concerns lifted) and apply it with
  `gh pr edit <n> --body-file`. If it is still accurate, touch nothing and say so.
- **default** — steps 1 to 6.

## 1. Preconditions

- `git status --short`: uncommitted files? Those of the work in progress are committed per unit; the
  user's never leave without their approval (question interactively, `blocked` in auto).
- Current branch ≠ default branch (otherwise create `<type>/<topic>` and move the unpushed local
  commits with the user's approval). Never a push to the default branch.
- Empty `git remote` → **local only**: commits made, nothing else; say so in one line.

## 2. Barriers

1. `node "$K" verify` green (red → stop: `/kaizen:work` or `/kaizen:debug`).
2. Review done: a `/kaizen:review` report from this session on this diff, or an explicit instruction
   to skip it. Otherwise, run it (`mode:agent` in auto) and handle the P0/P1.
3. `node "$K" size` under `pr.max_lines`. Above it:
   - **interactive** — propose **splitting** into stacked PRs: one branch per plan slice (or per
     coherent group of units), each based on the previous one, `gh pr create --base <previous
     branch>`. Or shipping as one block with a justification in the PR;
   - **auto** — ship as one block, with the "Size" section explaining why.
4. Constitution: if the plan declares exceptions, they go into the PR.

## 3. Commits and push

Remaining commits in conventional format (`<type>(<JIRA>): …`, key read from the branch), files named
explicitly. Check the review: `node "$K" review check` — refused → `kaizen:review` (`mode:agent` in
`mode:auto`), P0/P1 fixes, then resume; a waiver is only possible at the user's request, confirmed by
them (`review waive --reason`, then they type `kaizen waive <code>`) — never in `mode:auto`. Then
`git push -u origin <branch>` (never `--force`; `--force-with-lease` only on a branch this session
created and rewrote, with approval).

## 4. Description

Title: conventional, ≤ 72 characters (`feat(SHOP-412): export filtered orders as CSV`). Body, from the
plan (`plan:` or the plan cited in the commits) and the real diff — **never** from the plan alone if the
code diverged. Written in the configured language (`config.language`, `auto` = the conversation's);
the section titles below are translated with it:

```markdown
## Why
<capsule goal, 1 to 2 sentences; link to the plan and the ticket>

## What changes
- <visible behavior, one bullet per covered requirement: R1, R2…>

## How to review (reviewer guide)
1. Start with `<file>`: <the heart of the change>
2. Then `<file>`: <…>
- Look closely at: <the decision or risk where a human eye matters most>
- Can be skimmed: <generated tests, renames, mechanical files>

## Evidence
- `<verification command>` ✅ · acceptance examples AE1–AE3 covered by <tests>
- Kaizen review: <verdict, remaining findings>

## Rollout and rollback
<summary of kaizen:rollout: exposure, order, rollback, signal>

## Constitution
<only if there are exceptions: article, reason>

## Review waived
<only if `node "$K" review status` shows `verdict: waived`: reason given by the user, confirmation
date, and what was therefore not reviewed — mandatory section, never removed>

## Open points
<findings not applied, decisions left to the human — or delete the section>

🤖 Prepared with Kaizen
```

Add the `<!-- kaizen -->` marker as the last line (it keeps PR watching from taking this text for
feedback to handle).

## 5. Open

A PR already exists for the branch (`gh pr view --json url`) → update it (`gh pr edit`) instead of
opening a second one. Otherwise `gh pr create --title … --body-file … [--draft] [--base <base>]`.
Without `gh`, use the GitHub MCP tools if available; otherwise give the creation URL and the body.

## 6. Follow-up

Give the URL. Propose `/kaizen:watch-pr <url>` (Recommended) to drive it to "ready to merge" —
comments handled, CI repaired — without ever merging in the human's place.
