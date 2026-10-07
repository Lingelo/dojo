---
name: probe-locate
description: Kaizen host probe — records how this host tells a skill where its own files are. Use only when the user asks to run probe-locate.
allowed-tools: Bash(node:*), Read
---

# Probe — locate the plugin from a skill

This is a measurement, not a task to get right: report what happens, do not work around failures.
Never search the disk for the script, never guess a path you were not given.

1. Write down the absolute path of the directory that contains this `SKILL.md`, exactly as the host gave
   it to you when it loaded this skill, and how you learned it (for example: "a base directory line
   above the skill", "the path in the skills list", "not given").
2. If you have that path, run, with your shell's quoting:
   `node "<that directory>/../../scripts/whereami.mjs" --skill probe-locate --skill-dir "<that directory>" --how "<how you learned it>"`
3. Run each of these, even if the first failed (on Windows PowerShell, `$env:NAME` instead of `$NAME`):
   - `node "$CLAUDE_PLUGIN_ROOT/scripts/whereami.mjs" --skill probe-locate --as env-claude-root`
   - `node "$PLUGIN_ROOT/scripts/whereami.mjs" --skill probe-locate --as env-plugin-root`
   - `node "$CURSOR_PLUGIN_ROOT/scripts/whereami.mjs" --skill probe-locate --as env-cursor-root`
4. Reply with: the path and how you learned it, then every `KAIZEN-PROBE-OK` line and every error,
   verbatim.
