# Git plugin

Git utilities for Claude Code: conventional commits with Jira extraction, and safe push.

## Features

- **Commit**: conventional commits with the Jira number extracted automatically from the branch
- **Push**: safe push with a lock on the main branches (main/master)

## Installation

Enable the plugin in the Claude Code settings:

```json
{
  "enabledPlugins": {
    "git@angelo-plugins": true
  }
}
```

## Skills

### /commit

Creates commits following the [Conventional Commits](https://www.conventionalcommits.org/) specification,
with the Jira ticket extracted automatically.

```bash
/commit
```

**Format:**
```
<type>(<JIRA-123>): <description>
```

The Jira key is the first `[A-Z]+-[0-9]+` match in the branch name (`feature/MOJ-1234-add-login` →
`MOJ-1234`). Without a key, the scope is omitted: `<type>: <description>`.

**Supported types:**
| Type | Description |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation |
| `style` | Formatting |
| `refactor` | Refactoring |
| `perf` | Performance |
| `test` | Tests |
| `build` | Build |
| `ci` | CI/CD |
| `chore` | Maintenance |

**Examples:**
```bash
# Branch: feature/MOJ-1234-add-login
git commit -m "feat(MOJ-1234): add OAuth2 authentication"

# Branch: main (no Jira)
git commit -m "chore: update dependencies"

# Breaking change
git commit -m "feat(MOJ-1234)!: change the API response format"
```

**Rules:** imperative verb, 72 characters at most, no trailing period, the "what" and "why" rather than
the "how", one logical change per commit, never a mention of AI tools. The description follows the
language of the project's history (English by default).

### /push

Pushes commits to the remote with a safety lock.

```bash
/push
```

**Safety lock:** this skill **REFUSES** to push to:
- `origin/main`
- `origin/master`

**Behavior:**
- On a feature branch → normal push (`git push -u origin <branch>` the first time)
- On main/master → blocked with an error message

**Message when blocked:**
```
ERROR: Push to origin/main or origin/master blocked

Pushing directly to the main branches is forbidden.

To push your changes:
1. Create a branch: git checkout -b feature/my-feature
2. Push it: git push -u origin feature/my-feature
3. Open a Merge Request
```

## Recommended workflow

1. Create a branch from main:
   ```bash
   git checkout -b feature/MOJ-1234-my-feature origin/main
   ```

2. Make changes and commit:
   ```
   /commit
   ```

3. Push the branch:
   ```
   /push
   ```

4. Open a Merge Request on GitLab/GitHub

## Why this lock?

The lock on main/master is a safety measure to:
- avoid accidental pushes to protected branches;
- enforce the Merge Request / Pull Request workflow;
- allow code review before integration;
- protect the history of the main branches.

It is an instruction followed by Claude, not a hook: also protect your branches server-side (GitHub
branch protection, GitLab protected branches).

## Used by

The [Kaizen](../kaizen/README.md) plugin uses the same commit format (`<type>(<JIRA>): …`).
