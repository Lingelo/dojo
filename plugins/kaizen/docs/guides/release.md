# `/kaizen:release`

> Release notes users read, a SemVer version that tells the truth, and a production checklist. Without
> ever tagging or publishing without your approval.

## At a glance

| | |
|---|---|
| **What it does** | Collects the conventional commits since the last tag, checks the SemVer level (looks for hidden breaking changes), drafts the notes, updates the CHANGELOG and the version in the working tree (without committing), builds the production checklist |
| **When to use it** | "Prepare the release", "release notes", "which version?", "changelog" |
| **When not to use it** | Shipping a PR (→ [ship](ship.md)) |
| **What it produces** | Release notes, proposed version, `CHANGELOG.md` entry (Keep a Changelog format), checklist |
| **What next** | `publish` to tag and create the GitHub release, after confirmation; then [deploy](deploy.md) |

## Examples

```text
/kaizen:release
/kaizen:release --from v2.3.0
/kaizen:release publish
```

## How it goes

1. `node $K release notes` (`--from <tag>`, `--to <ref>`): grouped commits (Features, Fixes,
   Performance, Refactoring, Documentation, Reverts, Other), breaking changes (`!` or
   `BREAKING CHANGE:`), proposed version. In 0.x, a breaking change bumps the minor. `deploy/…`,
   `rollback/…` tags are never taken as the previous version.
2. **Verification**: the diffs of public interfaces (routes, schemas, package exports) are read, so
   that a breaking change does not hide in a `fix`. The project's version files (`package.json`,
   `pyproject.toml`, `plugin.json`…) are compared to the proposed version.
3. **Writing for users**: one sentence per change, grouped (Features, Fixes, Performance, Breaking
   changes **with migration**), without the noise (chore, ci, tests).
4. **Production checklist**, from the shipped plans (`kaizen:rollout` section, extracted in the
   `rollout` field):
   - green checks and CI;
   - migrations and their order;
   - feature flags;
   - rollback and what is irreversible;
   - signals to watch, with their threshold (a shipped plan without a signal or rollback is reported as
     blocking);
   - communication.
5. **Publication** (with `publish` and confirmation):
   1. version files updated;
   2. `chore(release): vX.Y.Z`;
   3. annotated tag;
   4. push;
   5. `gh release create`.
6. **Deployment**: `release` does not deploy; it proposes `/kaizen:deploy <env> vX.Y.Z`
   ([deploy](deploy.md)) when environments are configured.

## Good to know

- The constitution's AI policy may forbid publication by an agent: it wins.
- Non-conventional commits are counted and classified by hand by Claude, reading their diff.

## See also

In depth: [production](../concepts/production.md#release).


[ship](ship.md) · [deploy](deploy.md) · [metrics](metrics.md)
