# SDLC audit

`node $K audit` (and [`/kaizen:setup audit`](../guides/setup.md)) answers: what does a solid delivery
lifecycle assume, what is in place in this repo, what is missing, and in which order to fix it. It is
read-only; simple, unambiguous fixes have a **scaffold** (`audit fix <id>`) that never overwrites an
existing file. Options: `--json`, `--no-github` (skips the branch protection call).

## Checks

Each check returns `ok`, `warn`, `missing` or `unknown`, its evidence, the fix, and a priority (1 =
protects first).

### Foundations

| Id | Check | `ok` when | Priority | Scaffold |
|---|---|---|---|---|
| `remote` | remote repository | a git remote exists | 1 | — |
| `ci` | CI running the tests | a GitHub Actions workflow or another CI (`.gitlab-ci.yml`, `Jenkinsfile`, CircleCI, Azure, Bitbucket, Buildkite) with a recognizable test step | 1 | `ci` |
| `tests` | automated tests | a test command **and** test files (`warn` with only one of them) | 1 | — |
| `lint` | lint | a lint command | 3 | — |
| `typecheck` | type checking (typed projects) | a typecheck command | 2 | — |
| `gitignore_env` | secret files ignored | `.env` in `.gitignore` | 1 | `gitignore_env` |
| `secret_scanning` | secret scanning | the marketplace `security` plugin enabled, a gitleaks/detect-secrets/trufflehog config, or a scanner in pre-commit or CI | 2 | — |

### Flow

| Id | Check | `ok` when | Priority | Scaffold |
|---|---|---|---|---|
| `branch_protection` | default branch protected | ≥ 1 required approval and ≥ 1 required check (`gh api …/protection`; `unknown` without GitHub or rights) | 1 | — (a repository setting) |
| `codeowners` | code owners | a `CODEOWNERS` file | 2 | `codeowners` |
| `pr_template` | PR template | a pull request template | 3 | `pr_template` |
| `dependency_updates` | automated dependency updates | Dependabot or Renovate config | 3 | `dependabot` |
| `claude_md` | project instructions for agents | `CLAUDE.md` | 2 | — (`/init`) |

### Delivery

| Id | Check | `ok` when | Priority |
|---|---|---|---|
| `deploy` | tooled deployment | `deploy.environments` declared (`warn` if `deploy detect` recognizes something not configured) | 1 |
| `rollback` | declared rollback | every environment has a `rollback` | 1 |
| `protected` | protected production | `production` is not declared `"protected": false` | 2 |

### Operations

| Id | Check | `ok` when | Priority | Scaffold |
|---|---|---|---|---|
| `monitoring` | watched production signals | `monitor.signals` declared | 1 with environments, 2 otherwise | — |
| `continuous_monitoring` | continuous incident detection | a workflow running `monitor patrol` or `monitor alert` | 3 | `monitor_patrol` (and `monitor_alert`) |
| `health` | health endpoint | an HTTP signal (`warn` if a `/health`, `/healthz`, `/up`, `/ready`… route exists in the code but is not watched) | 2 | — |

### Kaizen loop

| Id | Check | `ok` when | Priority |
|---|---|---|---|
| `kaizen` | Kaizen initialized | `.kaizen/config.json` | 1 |
| `constitution` | engineering constitution | `CONSTITUTION.md` valid (`warn` if invalid) | 2 |
| `learnings` | learnings findable by agents | `CLAUDE.md` mentions the learnings | 3 |

**Area score** = (ok + ½ warn) / checks with a known status, as a percentage. The `next` list sorts
everything `missing` or `warn` by priority, with the fix, the scaffold id and the skill to run.

## Scaffolds (`audit fix <id>`)

| Id | Writes | Notes |
|---|---|---|
| `ci` | `.github/workflows/ci.yml` | from the detected stack: setup for Node (npm, pnpm, yarn, bun; `npm install` without a lockfile), Python (uv, poetry, pip), Go, Rust, Ruby, Java…, then the verify commands; refused without a test command |
| `pr_template` | `.github/pull_request_template.md` | why, evidence, rollback |
| `dependabot` | `.github/dependabot.yml` | weekly updates, 5 open PRs max, for the stack’s ecosystems (npm, pip/uv, gomod, cargo, bundler, maven, gradle, composer), plus `github-actions` and `docker` when present |
| `codeowners` | `.github/CODEOWNERS` | requires `--owner @user` or `@org/team`; default owner, plus `/CONSTITUTION.md`, `/kaizen-packs/`, `/.kaizen/config.json` |
| `gitignore_env` | appends to `.gitignore` | `.env`, `.env.*`, `!.env.example` |
| `monitor_patrol` | `.github/workflows/kaizen-patrol.yml` | scheduled `monitor patrol` (`--env`, default production or the first environment; `--ref <sha>` pins the Kaizen checkout) |
| `monitor_alert` | `.github/workflows/kaizen-alert.yml` | `repository_dispatch` entry point passing the payload to `monitor alert` through the environment (no script injection) |

Every scaffold stays **uncommitted**, for you to review. `/kaizen:setup audit` walks the list one item
at a time — fix (recommended), later, never for this repo — reruns the audit at the end and shows the
before/after scores.
