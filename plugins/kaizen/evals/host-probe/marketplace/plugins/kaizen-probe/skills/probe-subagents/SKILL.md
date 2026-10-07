---
name: probe-subagents
description: Kaizen host probe — records whether this host can run two subagents at the same time from a prompt file read by path, and whether the plugin's own agent is available by name. Use only when the user asks to run probe-subagents.
allowed-tools: Bash(node:*), Read, Agent
---

# Probe — parallel subagents

This is a measurement: report what happens, never fake a result by running the reviewers' command
yourself.

1. Take the absolute path of the directory that contains this `SKILL.md`, as the host gave it to you.
   Read `<that directory>/../../agents/probe-reviewer.md`: its body (after the frontmatter) is the
   reviewer prompt. The script path is `<that directory>/../../scripts/whereami.mjs`.
2. **Generic subagents, in parallel.** In a single step, launch two subagents with your host's
   subagent or delegation mechanism, at the same time. Prompt of each: the reviewer prompt, then
   `Your name: reviewer-a` (or `reviewer-b`) and `Script: <absolute script path>`.
3. **Named agent.** If the host lists an agent called `probe-reviewer` (shipped by this plugin), launch
   it once the same way with the name `named-agent`. If it does not exist, say so.
4. If this host cannot launch subagents at all, say so and stop.
5. Reply with: the mechanism you used (its tool or command name), whether the two launches were in the
   same step, and each subagent's answer verbatim.
