# `/kaizen:setup`

> Set up the SDLC on a project: diagnose what it is missing, install Kaizen, check it is healthy, or
> create a Kaizen Pack.

## At a glance

| | |
|---|---|
| **What it does** | Creates the config and the folders, has the verification commands validated, sets language, tracker, documents location and PR limit, makes the learnings findable from `CLAUDE.md`, proposes the constitution, detects the deployment platform |
| **When to use it** | First use in a repo; `audit` to find out what the project is missing and fix it in order; `check` when something looks wrong; `pack:<name>` to create a pack |
| **When not to use it** | Writing the project's principles (→ [constitution](constitution.md), which `setup` proposes at the end) |
| **What it produces** | `.kaizen/config.json`, `docs/{plans,learnings,ideation}/`, one line in `.gitignore`, possibly a section in `CLAUDE.md` and scaffolded files (`audit`) |
| **What next** | `/kaizen:constitution`, then `/kaizen:brainstorm <idea>` or `/kaizen:ideate` |

## Examples

```text
/kaizen:setup audit           # project SDLC maturity, guided fixes by priority
/kaizen:setup                 # guided installation
/kaizen:setup check           # health check, no writes
/kaizen:setup pack:house-rules
/kaizen:setup pack:house-rules first rule: every CSV export starts with a BOM
```

![What Kaizen writes in your repo and who reads it](../media/diagrams/artifacts-map.svg)

In depth: [state and files](../reference/state-and-files.md).

## The audit: setting up the SDLC

`node $K audit` (`--json`, `--no-github` without an authenticated `gh`) scores the project on five
areas:

| Area | Checks |
|---|---|
| **Foundations** | remote repository, CI running the tests, automated tests, lint, type checking, `.env` ignored, secret scanning |
| **Flow** | default branch protection (through `gh`), CODEOWNERS, PR template, Dependabot/Renovate, `CLAUDE.md` |
| **Delivery** | tooled deployment (or recognized by `deploy detect`), rollback, protected production |
| **Operations** | watched signals, continuous incident detection, health endpoint (route found in the code) |
| **Kaizen loop** | Kaizen initialized, constitution, findable learnings |

Each check is `ok`, `warn`, `missing` or `unknown`, with its evidence and a priority (P1 protects, P3
improves). Then Claude offers to fix each point, **P1 first**, one by one, with your approval:
- **scaffolds** generated from your stack, never over an existing file:
  `audit fix ci` (GitHub Actions: install and detected verification commands),
  `pr_template`, `dependabot` (detected ecosystems), `codeowners --owner @team`, `gitignore_env`,
  `secret_scanning` (every PR scanned for keys and tokens, `--ref <sha>`),
  `monitor_patrol` and `monitor_alert` (continuous incident detection, `--env`, `--ref <sha>`);
- **deployment**: `deploy detect`, you choose, `deploy configure <id>`;
- **administration settings** (branch protection): Claude gives the exact settings, you apply them;
- **skills**: constitution, installation.

The audit is rerun at the end to show the before/after.

## The installation, step by step

1. **Initialize**: `node $K init`, idempotent (never overwrites an existing config).
2. **Checks**: Claude shows you the detected `test`, `lint` and `typecheck` commands. You keep them,
   adjust them, or disable the gate. It runs them once to make sure they already pass on the default
   branch. Slow suite → targeted checks for the gate (`gate.targeted` with `{files}`).
3. **Language**: `auto` (follows the conversation), or pinned (`en`, `fr`…) for the deliverables.
4. **Tracker**: `auto` (Jira read from the branch, GitHub through `gh`).
5. **Location**: `docs_root` (`docs` by default). To change **before** the first documents if `docs/`
   is already a published site.
6. **Findability** (with your approval): a short section in `CLAUDE.md`, so that any agent reads
   `docs/learnings/` before planning or debugging.
7. **Constitution**: proposed if missing, checked if it exists.
8. **PR size**: `pr.max_lines` (400 by default).
9. **Deployment and monitoring** (optional): `deploy detect` recognizes your platform and proposes
   commands, rollback and health-check; you choose. See [deploy](deploy.md).
10. **Profile**: `lean` (recommended to start), `standard` or `full`. It also sets each agent's model.
    See [Configuration](../configuration.md#profile) and
    [`models`](../configuration.md#models--the-right-model-for-each-task).
11. **Summary**.

## The health check (`check`)

| Point | Command |
|---|---|
| Root and config | `node $K root`, `node $K config` |
| Checks | `node $K detect` |
| Learnings | `node $K learnings validate` |
| Packs | `node $K packs` |
| Constitution | `node $K constitution check` |
| Gate | `node $K gate status` (a gate left active without work in progress → `gate off`) |
| Review | `node $K review status` |
| Models | `node $K models` (invalid values reported) |

Each point shows ✔ or ⚠, with the proposed fix.

## Good to know

- What `setup` creates is to be **committed**: the config and the folders are shared by the team.
  `.kaizen/config.local.json` and `.kaizen/state/` are not versioned.
- The scaffolds stay uncommitted: review them before committing.

## See also

[Getting started](../getting-started.md) · [Configuration](../configuration.md) · [Kaizen Packs](../packs.md) · [constitution](constitution.md)
