---
name: debug
description: Kaizen diagnosis loop for bugs, red tests, wrong or slow behavior — reproduction, backward tracing, past learnings and git history, one hypothesis at a time, full causal chain with file:line before any fix, then test-first fix and capture. Use when the user says "it crashes", "this test fails", "why does X…", a bug ticket, /kaizen:debug.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, TaskCreate, TaskUpdate
argument-hint: "[error message, test path, ticket/issue, or behavior description] [mode:return]"
---

# Debug — find the cause, then fix

**Done when:** the causal chain from trigger to symptom is stated **without gaps**, with `file:line`
evidence, and either a verified fix was delivered (commit or PR, or the stop the user chose), or a
diagnosis summary was handed over.

**Escalate rather than grind:** 2 to 3 hypotheses exhausted without confirmation, or 3 failed fixes →
diagnose **why** you are wrong instead of retrying. **One hypothesis, one change at a time**: changing
several things to see what helps is shotgun debugging.

Read `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`, then
`${CLAUDE_PLUGIN_ROOT}/skills/debug/references/investigate.md` for phases 0 to 2.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

**`mode:return`** (set by `/kaizen:autopilot`): no questions; fix applied only if it is **convergent**
(it restores the intended behavior) — a **divergent** fix (it would reverse a deliberate decision, or a
"red" test asserting the intended behavior) is deferred; commit on a dedicated branch, no push. Return
`{ status: fixed|diagnosed-no-fix|needs-human|blocked, root_cause, files, tests, commit, deferred }`.

## Secrets in evidence

Debugging prints a lot of raw output. Keep credentials in environment variables; if an output may
contain a secret (HTTP traces, headers, config dumps), capture it into a file and only show sanitized
excerpts (`<REDACTED>`). No secret in what is displayed, written or committed.

## Phases

**0 Triage → 1 Investigation → 2 Root cause → 3 Fix → 4 Handover.** No shortcut outside the trivial
case (cause readable in the input, one-line fix) — and even then, the phase 2 gate applies before
editing.

**The reference ticket.** If the user provided a ticket or an issue (GitHub, Jira, Sentry…), that is
where the bug lives: keep its id until phase 4. Without a ticket, there is none, and that is fine: never
create one "to be tidy".

### Phase 2 gate — present, then ask

Do not move to phase 3 until you can explain the **whole** chain — trigger, each step, observed symptom
— without "somehow". Only the user can authorize moving on with the best available hypothesis when the
investigation is stuck.

First write, **in full**, the findings block: causal chain with `file:line`; proposed fix and files
touched; tests to use, add, change or strengthen, and why the existing tests did not catch it; related
ticket or PR (if an open PR already fixes it, start with that link). **Only then**, ask (unless the
request already decided):
1. **Fix now** → phase 3 (Recommended).
2. **Diagnosis only** → phase 4, summary, end.
3. **Rethink the design** (`/kaizen:brainstorm`) → only if the bug cannot be fixed within the current
   design (wrong responsibility or interface, wrong requirements, every fix is a workaround). Size alone
   is not a design problem.

### Phase 3 — Fix

Read `${CLAUDE_PLUGIN_ROOT}/skills/debug/references/fix.md` before any edit. Two rules first:
- **Branch** — on the default branch, create `fix/<topic>` (Jira-prefixed if known) without asking, and
  say so. Unstaged user work in a file to change → confirm first.
- **Scope** — note `HEAD`, the `git status --short` state, and keep the list of **fix files**. Phase 4
  depends on it.

### Phase 4 — Handover

In the user's language:

```markdown
## Debug summary
**Problem:** what was broken
**Root cause:** full causal chain, with file:line
**Tests:** added/changed to prevent recurrence (file, assertion)
**Fix:** what changed — or "diagnosis only"
**Prevention:** coverage added; structural fix or defense in depth, or left as a follow-up
**Confidence:** high / medium / low
```

If a fix was made:
1. Non-trivial fix → `kaizen:review` on the fix files only (not on the rest of the branch).
2. Commit **only** the fix files, as `fix(<JIRA>): …`. A fix file already contained user changes → ask
   before committing (with, without, or stop).
3. Push and PR only if the tree was clean before, if nothing but the fix is on the branch, and if a
   remote allows a PR; otherwise a local commit and say in one line why.
4. **Capture**: a bug whose cause was surprising or whose investigation was long is exactly what
   `/kaizen:learn` must keep — propose it (in `mode:return`, flag it in the return).
