---
name: release
description: Prepares a release — conventional commits since the last tag grouped into readable release notes (features, fixes, breaking changes with migration), proposed SemVer version, CHANGELOG entry, and production checklist (checks, migrations, flags, rollback, communication). Never tags or publishes without explicit approval. Use when the user says "prepare the release", "release notes", "changelog", "which version?", /kaizen:release.
allowed-tools: Bash(node:*), Bash(git:*), Bash(gh:*), Read, Write, Edit, Glob, Grep, AskUserQuestion
argument-hint: "[--from <tag>] [forced version] [publish]"
---

# Release — notes users read, a version that tells the truth

Read `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

**Never** a tag, a tag push, a release publication or a deployment without explicit approval in the
session (the constitution's AI policy may be stricter: it wins).

## 1. Collect

`node "$K" release notes [--from <tag>]` → grouped commits (`Features`, `Fixes`, `Performance`,
`Refactoring`, `Documentation`, `Reverts`, `Other`), breaking changes, level and proposed version
(SemVer; in 0.x a breaking change bumps the minor). Non-conventional commits: report their number and
classify them yourself by reading their diff.

## 2. Check the version

- A breaking change (`!` or `BREAKING CHANGE:`) → major. Check that it really is one (public interface,
  data format, configuration) and that **no** breaking change hides in a `feat`/`fix` (read the diffs
  of public interfaces: routes, schemas, package exports).
- The project's version files (`package.json`, `pyproject.toml`, `Cargo.toml`, `version.rb`,
  `.claude-plugin/plugin.json`…): does the proposed version go beyond them?

## 3. Write

Notes for **users**, not developers: what changes for them, one sentence per point, grouped (Features,
Fixes, Performance, Breaking changes), in the configured language. Each breaking change has its
**migration** (before → after, steps). Links to PRs and plans (`docs/plans/…`) when they shed light.
Remove the noise (chore, ci, tests, invisible refactors).

Update `CHANGELOG.md` (Keep a Changelog format: `## [x.y.z] - YYYY-MM-DD`) if it exists or if the user
wants it, and the manifest's version (`package.json`…): **in the working tree, without committing**,
including on the default branch — it is reviewable and undone with a `git checkout`. The release
commit, the tag and the publication stay at step 5, with approval.

## 4. Production checklist

From `rollout` in `node "$K" release notes --json` (plans cited by the commits or changed in the range,
`kaizen:rollout` section already extracted) and the diff. A plan with a non-empty `missing` (no
rollback, no signal, no section) is a **blocking checklist item**: ask for the rollback and the signal
before publishing, never invent them.
- `node "$K" verify` green on the commit to tag; CI green (`gh run list --branch <default> --limit 5`);
- migrations to run and in which order (expand → migrate → contract);
- feature flags to toggle, and their default;
- the release's rollback and what is irreversible;
- signals to watch after the release, **with their threshold** and the action when it is breached; a
  threshold breached after the release → rollback, then `/kaizen:postmortem` (that is how production
  comes back into the loop);
- communication (users, support) for visible changes.

## 5. Publish (only with approval)

With `publish` and confirmation: version files update, commit `chore(release): vX.Y.Z`, annotated tag
`vX.Y.Z`, push of the commit and the tag, `gh release create vX.Y.Z --notes-file <notes>`. Otherwise,
deliver the notes, the version and the checklist, and give the commands.

## 6. Deploy

`release` does not deploy. If `deploy.environments` is configured, finish by proposing
`/kaizen:deploy <env> vX.Y.Z` (staging first if it exists): preconditions, approval typed by the user
for production, watch of the checklist's signals, rollback ready.
