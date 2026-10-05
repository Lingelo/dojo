---
name: commit
description: Creates commits in the Conventional Commits format with the Jira ticket number extracted automatically from the branch name. Use when the user asks to commit, says /commit, or wants to commit their changes.
allowed-tools: Bash(git *), Read, Grep, Glob
---

# Conventional commit with Jira

Creates commits following the [Conventional Commits](https://www.conventionalcommits.org/) specification,
with the Jira ticket number extracted automatically from the current branch.

## Commit format

```
<type>(<jira>): <description>

[optional body]

[optional footer]
```

**If no Jira number is found in the branch:**

```
<type>: <description>
```

## Instructions

### 1. Extract the Jira number from the branch

```bash
git branch --show-current
```

Look for a Jira ticket pattern in the branch name:
- Common patterns: `MOJ-1234`, `UNIV-456`, `ABC-789`
- Regex: `[A-Z]+-[0-9]+`
- Branch examples:
  - `feature/MOJ-1234-add-login` → `MOJ-1234`
  - `fix/UNIV-456-fix-bug` → `UNIV-456`
  - `MOJ-789-refactor` → `MOJ-789`
  - `main` → no Jira

### 2. Analyze the changes

```bash
git status
git diff --staged
git diff
```

Understand:
- which files are modified;
- the nature of the changes (new feature, fix, refactoring…);
- the user's intent.

### 3. Pick the commit type

| Type | Description | When to use it |
|---|---|---|
| `feat` | New feature | Adding a new feature for the user |
| `fix` | Bug fix | Fixing a bug |
| `docs` | Documentation | Documentation-only changes |
| `style` | Code style | Formatting, semicolons, no logic change |
| `refactor` | Refactoring | Restructuring the code without changing behavior |
| `perf` | Performance | Performance improvement |
| `test` | Tests | Adding or fixing tests |
| `build` | Build | Build system or dependency changes |
| `ci` | CI/CD | CI/CD configuration changes |
| `chore` | Maintenance | Maintenance tasks, dependency updates |

### 4. Write the description

- In the language the project's history already uses (`git log --oneline -10`); English by default
- Start with an imperative verb: "add", "fix", "update"
- 72 characters at most
- No trailing period
- Describe the "what" and the "why", not the "how"

### 5. Create the commit

**With Jira:**
```bash
git add <files>
git commit -m "<type>(<JIRA-123>): <description>"
```

**Without Jira:**
```bash
git add <files>
git commit -m "<type>: <description>"
```

## Examples

### With a Jira number

Branch: `feature/MOJ-1234-user-authentication`

```bash
git commit -m "feat(MOJ-1234): add OAuth2 authentication"
```

```bash
git commit -m "fix(UNIV-456): fix form validation"
```

```bash
git commit -m "refactor(MOJ-789): simplify the computation logic"
```

### Without a Jira number

Branch: `main` or `develop`

```bash
git commit -m "chore: update dependencies"
```

```bash
git commit -m "docs: improve the README"
```

### With a detailed body

```bash
git commit -m "feat(MOJ-1234): add result pagination

Implement server-side pagination to improve
performance on large lists.

- Add the page and limit parameters
- Return the total in the headers
- Update the integration tests"
```

## Breaking changes

For breaking changes, add an exclamation mark (!) after the type or the scope:

```bash
git commit -m "feat(MOJ-1234)!: change the API response format"
```

Or in the footer:

```bash
git commit -m "feat(MOJ-1234): redesign the users API

BREAKING CHANGE: the response format changed from an array to a paginated object"
```

## Full workflow

1. Check the branch: `git branch --show-current`
2. Extract the Jira key (if any)
3. Check the changes: `git status` and `git diff`
4. Stage the relevant files: `git add <files>`
5. Ask the user for the intent if it is unclear
6. Create the commit with the right format

## Important notes

- Never mention AI tools in commit messages
- One commit = one coherent logical change
- Prefer several small commits to one big commit
- Check that the code builds/lints before committing
- Never `--no-verify` (the `security` plugin blocks it anyway)
