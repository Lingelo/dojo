---
name: push
description: Pushes commits to the remote with a safety lock that blocks pushes to origin/main and origin/master. Use when the user asks to push, says /push, or wants to push their changes.
allowed-tools: Bash(git *)
---

# Safe push

Pushes commits to the remote with a safety lock that prevents direct pushes to the protected branches
(main/master).

## Safety lock

**IMPORTANT: this skill ALWAYS REFUSES to push to:**
- `origin/main`
- `origin/master`

The lock is a safety measure against accidental pushes to the main branches.

## Instructions

### 1. Check the current branch

```bash
git branch --show-current
```

### 2. Check the status

```bash
git status
```

Check:
- whether there are commits to push;
- whether the branch tracks a remote;
- the state of the branch compared to the remote.

### 3. Apply the safety lock

**BEFORE any push, check the target branch:**

```bash
git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null || echo "no-upstream"
```

**BLOCK the push if the current branch, or its upstream, is `main` or `master`:**

1. **DO NOT run the push**
2. Show a clear error message
3. Suggest creating a feature branch

**Message to show:**
```
ERROR: Push to origin/main or origin/master blocked

Pushing directly to the main branches is forbidden for safety reasons.

To push your changes:
1. Create a feature branch: git checkout -b feature/my-feature
2. Push that branch: git push -u origin feature/my-feature
3. Open a Merge Request / Pull Request
```

### 4. Run the push (if allowed)

If the branch is NOT `main` or `master`:

**First push (new branch):**
```bash
git push -u origin <branch-name>
```

**Later pushes:**
```bash
git push
```

**Push with tags:**
```bash
git push --follow-tags
```

## Full workflow

1. Get the current branch name
2. **CHECK that it is NOT `main` or `master`**
3. If `main` or `master` → BLOCK and show the error message
4. Otherwise → run the push normally
5. Confirm the push succeeded

## Examples

### Push allowed

```
Branch: feature/MOJ-1234-add-login
→ Push allowed to origin/feature/MOJ-1234-add-login
```

```
Branch: fix/UNIV-456-bugfix
→ Push allowed to origin/fix/UNIV-456-bugfix
```

### Push blocked

```
Branch: main
→ BLOCKED - show the error message
```

```
Branch: master
→ BLOCKED - show the error message
```

## Supported options

| Option | Description |
|---|---|
| `--force-with-lease` | Safe force push (only on your own branch, after asking the user) |
| `--force` | Force push (avoid; prefer `--force-with-lease`) |
| `--tags` | Also pushes the tags |
| `--follow-tags` | Pushes the annotated tags |
| `-u` / `--set-upstream` | Sets the branch tracking |

## Important notes

- The lock on main/master is **NON-NEGOTIABLE**
- If the user insists on pushing to main/master, **REFUSE** and explain why
- Always suggest the Merge Request / Pull Request workflow
- This lock protects against human error, not against malicious intent
