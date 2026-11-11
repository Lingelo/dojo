---
title: A skill silently skips steps that use a tool missing from its allowed-tools
date: 2026-03-30
category: logic-errors
module: plugins (skills)
problem_type: logic_error
component: tooling
symptoms:
  - A skill runs to the end but skips its edit or question steps, with no error
root_cause: missing_permission
resolution_type: code_fix
severity: medium
tags: [skills, allowed-tools, frontmatter, silent-failure]
files: ["plugins/*/skills/*/SKILL.md"]
---

# A skill silently skips steps that use a tool missing from its allowed-tools

## Problem
A `SKILL.md` body told Claude to use `Edit` and `AskUserQuestion`, but its `allowed-tools` frontmatter
did not list them. The skill appeared to work and never did those steps.

## Symptoms
- The skill completes, but the edit or the question it prescribes never happens; no error is shown.

## What didn't work
- Reading the skill body: it looks right. The frontmatter and the body are not checked against each
  other by Claude Code, so nothing points at the mismatch.

## Solution
Every tool the body tells Claude to use must appear in `allowed-tools`:

```yaml
# before: the body uses Edit and AskUserQuestion
allowed-tools: Read, Write, Glob, Grep, Bash
# after
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion
```

Or omit `allowed-tools` when the skill is not meant to restrict tools (this repository's conventions
require the field, so list the tools).

## Why it works
`allowed-tools` is an allowlist: only the listed tools are available while the skill runs. A body
edited without its header drifts from it, and the forbidden calls simply never happen.

## Prevention
After changing a skill's body, grep it for tool names and compare with its frontmatter:
`grep -oE '\b(Edit|Write|Read|Bash|Glob|Grep|Agent|AskUserQuestion|WebFetch|WebSearch)\b' SKILL.md | sort -u`.
When delegating a skill change, say so explicitly: "if you add a tool to the body, add it to
`allowed-tools`".
