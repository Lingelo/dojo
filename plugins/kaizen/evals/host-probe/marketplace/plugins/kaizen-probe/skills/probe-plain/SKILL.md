---
name: probe-plain
description: Kaizen host probe — same as probe-locate without an allowed-tools field, to see whether that field changes how the host loads a skill. Use only when the user asks to run probe-plain.
---

# Probe — skill without allowed-tools

This is a measurement: report what happens, do not work around failures, never search the disk.

1. Write down the absolute path of the directory that contains this `SKILL.md`, as the host gave it to
   you, and how you learned it.
2. If you have it, run:
   `node "<that directory>/../../scripts/whereami.mjs" --skill probe-plain --skill-dir "<that directory>" --how "<how you learned it>"`
3. Reply with the path, how you learned it, and the `KAIZEN-PROBE-OK` line or the error, verbatim.
