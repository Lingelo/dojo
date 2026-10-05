# Implementation loop

## For each unit, in order

```
while units remain:
  - mark the task "in progress"
  - read the unit's files, the pattern to imitate, the cited learnings (parallel reads)
  - already done? (files present, expected capability, verification already true) → verify, mark
    done, move on: never silently reimplement
  - find the existing tests of the touched files (test discovery, below)
  - choose the evidence strategy (table below)
  - evidence first: write/strengthen the test, run it, OBSERVE THE FAILURE for the right reason
  - implement following the conventions and the cited pattern
  - run the targeted tests, then the cross-cutting impact (callers, serialization, migrations, docs)
  - record the evidence (below)
  - commit the unit
  - mark the task "done"
```

Dependency outside the repo (console setting, DNS, data in a database…): decide from the **observed**
state of the deliverable, never from a clean git tree. Re-apply only if safe or authorized; otherwise
ask or block.

## Evidence strategy

| Situation | Action |
|---|---|
| An existing test already fails for the targeted behavior | that is the red evidence; no duplicate |
| An existing test owns this behavior | strengthen it, observe the failure, then implement |
| New behavior, natural test location | new test that fails first |
| Existing code without tests that will be changed | **characterization** test first (capture what exists) |
| Rename, pure config, style, generated files, manual surface | exception: record the reason and the replacement check |

Rules:
- Never write the test and the implementation in the same step in test-first mode.
- A test must fail when the behavior it names breaks, and keep passing when only the implementation
  changes. It is worthless if its expected value comes from the tested code, if a mock provides the
  expected result, or if it asserts internal calls instead of what the code returns, stores or sends.
- No production export, flag or hook used only by tests when the real entry point can drive the
  behavior.
- No new duplicate test when an existing test is the right home: strengthen it.

## Test discovery

Before changing a file, find its tests (files importing it or sharing its name: `*.test.*`, `*_spec.*`,
`test_*.py`, `*Test.java`…). The plan's scenarios are a starting point; check whether others exist. New
behavior → new tests; changed behavior → changed tests; removed behavior → tests removed.

## Build what is asked

The plan's units and scope define what gets built. Only add an unrequested mechanism (guard, retry,
fallback, validation, option, abstraction) if an existing contract requires it, or if:
- its absence lets harm happen before anyone notices (trace that it is possible here);
- adding it later would be expensive (stored data or its format, public interface, money, security).

Then in its smallest form; otherwise, do not build it and report it in one line ("considered, not
built: …"). Never reduce the requested behavior to fit a safeguard. An item listed out of scope stays
unbuilt, unless there is new evidence — say which.

When you replace a function, a type or a module whose **all** callers are in the repo, update the
callers and delete the old version in the same change (no alias). An interface used outside the repo,
or that the plan says to keep, keeps working.

## When it resists

- Two successive fixes for the same failure did not work → **stop patching**: name the assumption
  common to both and check it. If it comes from the plan and fixing it stays in scope, fix it and note
  the change; otherwise it is a blocker (settled decision challenged, missing authority, information
  only the user has).
- Bug whose cause is not obvious → apply the `/kaizen:debug` discipline (full causal chain before
  fixing).

## Recorded evidence (per unit)

Behavior changed? · existing tests inspected · tests added/changed/unchanged · red failure observed (or
characterization) · verification run and result · exception and its reason. Keep it in the task and
carry it into the final summary (and into the return in `mode:return`).

## Commits

One commit per unit, after the unit's verification is green:
```bash
git add <unit files>          # never -A, never commit -a
git commit -m "<type>(<JIRA>): <imperative description>" -m "Unit U3 of plan <path>. Covers R2, AE1."
```
A unit applying a learning cited by the plan adds to the commit body
`-m "Applies docs/learnings/<…>.md"`: that is the "learning applied" signal of `/kaizen:metrics`. Jira
key extracted from the branch (`[A-Z][A-Z0-9]+-\d+`), otherwise `<type>: …`. No file from the user's
work in progress in a commit without their approval. Commit messages follow the repo's existing
language and conventions.

## User interface

Visible change: check in a browser (the Playwright MCP server Kaizen
ships, or another browser tool) — rendering, empty/error/loading states, keyboard, small screen. Otherwise, record the
manual check to do.
