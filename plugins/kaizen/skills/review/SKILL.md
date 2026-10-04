---
name: review
description: Kaizen multi-agent code review — selects the specialized reviewers by what the diff touches (correctness always; security, tests, performance, reliability, API contracts, migrations, maintainability, adversarial, standards/packs/learnings depending on the case), launches them in parallel, merges, filters by confidence, verifies each blocking finding and returns a verdict against the plan. Report only by default; applies fixes with "apply". Use when the user says "review my code", "review the branch/PR", /kaizen:review.
allowed-tools: Bash(node:*), Bash(git:*), Bash(gh:*), Read, Write, Edit, Glob, Grep, Agent
argument-hint: "[empty = current branch | PR number or URL | base:<ref>] [plan:<path>] [apply] [mode:agent]"
---

# Review — multi-agent review

Help ship a change that is **correct within the agreed scope**. Find the defects and improvements whose
consequences justify action. An adequate change needs no finding; a serious defect stays serious even
in a small diff.

Read `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`, then when selecting the reviewers
`${CLAUDE_PLUGIN_ROOT}/skills/review/references/persona-catalog.md`, and when merging
`${CLAUDE_PLUGIN_ROOT}/skills/review/references/synthesis.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

## Principles

- **Report only by default; never a push.** Only apply if the invocation contains `apply` or the user
  explicitly asked to fix. Never a push, a PR or a ticket.
- **No blocking question.** Infer intent, plan and scope from the tokens, git, the PR and the
  conversation; note the uncertainty in the report.
- **No branch change.** A PR number chooses the *scope*, not the permission to `checkout`. An
  uncommitted diff is only reviewed from the checkout that contains it.
- **Show the review, not the machinery**: what is examined, which lenses and why, the findings.
- **Language**: the report and its labels follow the user's language; reviewer JSON stays as the
  contract defines it.

## Step 1 — Scope

- **Current branch** (default): base = `base:<ref>` if given, otherwise
  `git merge-base HEAD origin/<default>` (fallback: local default branch). Diff = `git diff <base>`
  (includes uncommitted changes) + file list. Nothing to review → say so and stop.
- **PR** (number/URL): `gh pr view <n> --json title,body,baseRefName,headRefName,files` and
  `gh pr diff <n>` (or the GitHub MCP tools if `gh` is missing). Existing review comments: take them
  into account so as not to repeat what is already reported.
- Excluded from the reviewed diff: lockfiles, generated files, binaries, vendored code (mention them).
- **Depth**:
  - **Light** — ≤ 20 lines, no risk surface, docs/config only: review yourself with the reviewer
    contract, without subagents.
  - **Targeted** — < 100 lines and a single area: 1 to 3 reviewers.
  - **Full** — otherwise.

## Step 2 — Intent and plan

Write a 2-to-3-line **intent summary** (what the change aims to achieve). Plan source: `plan:<path>`,
otherwise a plan cited in the branch's commits, otherwise `node "$K" plan list` (a plan whose `topic`
matches the branch). Plan found → extract the R, AE, KTD and units: they are step 6's criteria.

## Step 3 — Selection

Per `persona-catalog.md`: `correctness` always (outside light depth), then only the reviewers whose area
is **present in the diff** — by judgment on the diff, not by keywords. For `standards`: gather
`CONSTITUTION.md` (`node "$K" constitution --json`), the standards files, `node "$K" packs --json` (rules
whose `applies_when` matches) and `node "$K" learnings search <diff terms>` (relevant learnings). The
**profile** (`node "$K" config` → `profile`, see `conventions.md`) adjusts the selection: `lean` = core
(`correctness`, `standards`) + `security` on a risk surface; `full` = `adversarial` from targeted depth.
Announce in one line per reviewer why it was kept.

## Step 4 — Launch in parallel

Read `${CLAUDE_PLUGIN_ROOT}/references/review-contract.md`. Create the run folder with
`node "$K" run-dir reviews` (it prints the path; ignored by git). Launch **all** kept reviewers **in a
single message** (`Agent` tool, `subagent_type: "kaizen:<name>"`, `model` read from
`node "$K" models --json` → `agents.<name>.model`, omitted if `inherit`), each with this prompt:

```
<contract>
{content of review-contract.md}
</contract>
<review-context>
Reviewer: <name>
Intent: <intent summary>
Plan (relevant R/AE/KTD excerpts): <… or "none">
Changed files: <list>
Diff: <inline diff, or path of a .patch file in the run folder to read if it is large>
Rules to apply (standards only): <standards quotes, pack rules, learnings>
</review-context>
Return only the contract's JSON.
```

Large diff (> ~1500 lines): write it into `<run>/diff.patch` and pass the path. Wait for **all**
returns; an error or non-JSON return = failed reviewer (noted in the coverage, never silently ignored).
Save each return in `<run>/<name>.json`.

## Step 5 — Merge, filter, validate

Follow `synthesis.md`: normalization, deduplication, confidence gate, verification of each P0/P1 finding
by rereading the quoted lines, ranking, and pre-existing items reported separately.

## Step 6 — Report

```markdown
## Review — <branch or PR> · <N files, +a/−b>
**Verdict: ✅ Ready | ⚠️ Ready with concerns | ⛔ Not ready** — <one sentence>
**Coverage:** correctness, security (auth touched), testing (…) · skipped: …

### Findings
| # | Sev. | Conf. | File:line | Finding | Fix | Reviewer |
|---|---|---|---|---|---|---|
| 1 | P0 | 100 | `app/x.rb:42` | … | … | security |

<for each P0/P1: 2 to 4 sentences of why_it_matters + the quoted line>

### Constitution
| Article | Respected? | Evidence |  — only if `CONSTITUTION.md` exists; plan exceptions restated

### Plan conformance
| Requirement | Covered by | Evidence |  — R/AE not covered or covered differently = finding

### Test gaps · Residual risks
### Pre-existing (outside the diff, for information)
### To capture
- <finding revealing a recurring trap → candidate for /kaizen:learn or a pack rule>
```

Verdict: ⛔ if a P0 remains, or a confirmed P1; ⚠️ if non-blocking P1/P2 remain or the coverage is
incomplete; ✅ otherwise.

**Record the review** (scope = current branch, in every mode):
`node "$K" review record --verdict <ready|concerns|blocked> --run <run folder>` (✅ → `ready`,
⚠️ → `concerns`, ⛔ → `blocked`). That is what the push hook requires; a review of another PR or another
branch is not recorded. Recording is refused if no reviewer actually ran (a hook logs every `Agent` call
to a code reviewer) — except at light depth (≤ 20 lines): do not work around it, launch the reviewers.

## Step 7 — Apply (only with `apply`)

Apply the kept `gated_auto` findings, from most to least severe, one by one; rerun the targeted
verification after each (`node "$K" verify`); revert a fix that breaks something. The `manual` ones stay
listed with their proposal. Commit the fixes in conventional format (`fix(<JIRA>): review fixes …`, body
citing the applied learning if any), concerned files only. Then record the review again with the
verdict **after** the fixes (`node "$K" review record --verdict …`). Summarize applied / not applied.

## `mode:agent` (for /kaizen:work and /kaizen:autopilot)

No prose: return the merged JSON
`{ verdict, coverage: {ran, failed, skipped}, findings: [...], plan_conformance: [...],
testing_gaps, residual_risks, pre_existing_count, recorded: bool }`. Never change the tree in this mode,
even if the caller will apply afterwards (recording the review under `.kaizen/state/` is not a tree
change).
