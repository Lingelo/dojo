# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions: [SemVer](https://semver.org/).

## [Unreleased]

### Added
- Plugin skeleton, not yet registered in the marketplace: the resolver `scripts/kaizen.mjs`, which finds
  Kaizen core (`git config kaizen.cli`, `KAIZEN_CLI`, the sibling checkout, the dojo plugin cache),
  refuses a core older than `scripts/requires.json` (4.0.0) and forwards every call; it answers
  `core-root` and `--version` itself. Contract tests for the skills to come.
