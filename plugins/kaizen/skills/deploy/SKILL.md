---
name: deploy
description: Moved in Kaizen 4.0 — deployments, rollbacks and feature flags are now /kaizen-ops:deploy, in the kaizen-ops plugin. Use when the user types /kaizen:deploy, only to say where the command went.
allowed-tools: Read
---

# /kaizen:deploy moved to kaizen-ops

Kaizen 4.0 moved the production commands to the **kaizen-ops** plugin. Do not run anything — no CLI,
no deployment, no command — and answer in the user's language, in three lines:

1. The command is now **`/kaizen-ops:deploy`** (same arguments, same behaviour).
2. If it is not available, enable the plugin in `.claude/settings.json`:
   `"enabledPlugins": { "kaizen@dojo": true, "kaizen-ops@dojo": true }`, then restart Claude Code;
   `/kaizen:help` checks the setup if anything is still missing.
3. This stub is removed in Kaizen 4.1.0.
