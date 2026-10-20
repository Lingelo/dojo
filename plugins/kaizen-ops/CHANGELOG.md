# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions: [SemVer](https://semver.org/).

## [1.0.1] - 2026-10-20

### Fixed
- A core killed by a signal exits `128 + signal` with a message instead of `1`, which core uses for a
  monitor verdict (breach or blind).
- A missing or unreadable `scripts/requires.json` refuses every call instead of accepting any core.
- `--version` answers even with an incompatible core, flagged `INCOMPATIBLE` (exit 1).
- Tests read the plugin and required versions instead of hard-coding them.

## [1.0.0] - 2026-10-20

### Added
- `/kaizen-ops:deploy`, `/kaizen-ops:monitor` and `/kaizen-ops:postmortem`, moved from Kaizen 3.10
  (`/kaizen:deploy`, `/kaizen:monitor`, `/kaizen:postmortem`) with unchanged behaviour, their guides
  and the postmortem template. The skills read Kaizen core's conventions and configuration through
  `node "$K" core-root`.
- Registered in the dojo marketplace; requires Kaizen ≥ 4.0.0.

## [0.1.0] - 2026-10-20 (unpublished)

### Added
- Plugin skeleton, not yet registered in the marketplace: the resolver `scripts/kaizen.mjs`, which finds
  Kaizen core (`git config kaizen.cli`, `KAIZEN_CLI`, the sibling checkout, the dojo plugin cache),
  refuses a core older than `scripts/requires.json` (4.0.0) and forwards every call; it answers
  `core-root` and `--version` itself. Contract tests for the skills to come.
