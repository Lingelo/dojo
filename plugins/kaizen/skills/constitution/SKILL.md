---
name: constitution
description: Creates, amends or audits the project's engineering constitution (CONSTITUTION.md) — 5 to 9 non-negotiable principles, each with a verifiable check, an AI policy (what agents do on their own), versioning and governance — through an interview that pushes back on vague principles and a stress test. Plan, doc-review and review then enforce it as checks. Use when the user says "create our constitution", "our engineering principles", "add a principle", "amend the constitution", /kaizen:constitution.
allowed-tools: Bash(node:*), Bash(git:*), Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion
argument-hint: "[empty | amend <article or topic> | audit]"
---

# Constitution — the principles the project does not negotiate

`CONSTITUTION.md`, at the repo root, carries the **non-negotiable engineering principles**: how things
are built here, what an agent may do on its own. It is neither a list of good intentions nor a style
guide: each article has a **check** the plan must pass and the review verifies.

Read `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`. Template:
`${CLAUDE_PLUGIN_ROOT}/templates/constitution.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

**Done when:** `CONSTITUTION.md` exists, `node "$K" constitution check` passes, and the user has seen
the full text and had one round of corrections before writing.

## Limits

- **Principles, not a plan.** A feature goes to `/kaizen:brainstorm`, a detailed rule for one area
  ("CSV exports start with a BOM") into a **Kaizen Pack**, a learning into `/kaizen:learn`. The
  constitution only keeps what holds for **all** the work.
- **The user answers; the repo only sharpens the question.** Principles are not inferred from the
  code. Use it to ask a better question ("your tests are mostly integration tests — is that a principle
  or an accident?").
- **Short is a quality.** 5 to 9 articles. Beyond 12, nobody applies them all anymore.
- **Never edit** an article marked `<!-- approved -->` without going through an amendment.

## Phase 0 — Anchor and route

1. `node "$K" constitution --json`: does the constitution exist?
2. **Repo model** (bounded reads, in parallel): `CLAUDE.md`, `CONTRIBUTING.md`, `AGENTS.md`,
   `.claude/rules/`, CI config (`.github/workflows/`), test/lint/typing tools (`node "$K" detect`),
   declared packs (`node "$K" packs`), and the most frequent learning types
   (`node "$K" learnings stats`) — a recurring bug type suggests a missing principle. Show in 3 to 5
   lines what you take from it, sources named, and invite corrections.
3. Route: no file → **Phase 1**; `amend …` → **Phase 2**; `audit` → **Phase 3**; existing file without
   an argument → propose amend or audit.

## Phase 1 — Interview (first time)

**One question per turn.** Free-form answers for the substance. At most two follow-ups per topic, then
capture what was given and mark it "to revisit". Quote the user's words when you follow up, do not
paraphrase. Do not name anti-patterns: ask the more precise question.

1. **What breaks most expensively.** "When a change hurt here — incident, regression, sleepless night —
   what, upstream, should have prevented it?" The answers become candidate articles.
2. **The candidates.** Propose 5 to 8 starting articles suited to the repo, from these families
   (choose, do not copy them all):
   - **Evidence first** — every behavior change comes with a test that failed before.
   - **Simplicity** — no mechanism nobody asked for; all complexity is justified in the plan.
   - **No premature abstraction** — no interface with a single implementation, no "for later" layer.
   - **Small batches** — a PR ≤ `pr.max_lines` reviewable lines; beyond that, split into slices.
   - **Secure by default** — untrusted input validated at the boundary, no secret in code or logs,
     audited dependencies.
   - **Compatibility** — no breaking change to a consumed interface without versioning; migrations as
     expand → migrate → contract.
   - **Observability** — every new critical path emits what is needed to diagnose a failure.
   - **Reversibility** — every deployment has a described rollback (flag, revert, reverse migration).
   - **AI policy** (mandatory) — what agents do on their own, what requires a human.
   Ask which to keep, which to rewrite, which are missing.
3. **For each kept article**: the rule in 1 to 3 sentences, then **the check**. Typical follow-ups:
   - unverifiable principle ("quality code", "test well") → "How would a reviewer know, reading a PR,
     that it is respected? What evidence would they look at?"
   - a value, not a principle ("we are pragmatic") → "What does it concretely forbid? If nothing, it is
     not an article."
   - duplicating a tool ("no line over 120 characters") → "The linter already enforces it; an article
     must carry what no tool checks."
   - too broad ("security comes first") → "In which precise situation would this principle change a
     decision?"
4. **Non-negotiable or not?** For each article: does it admit exceptions? If so, which ones and how
   they are recorded. "NON-NEGOTIABLE" is reserved for 1 to 3 articles.
5. **AI policy.** Specify: what the agent may do alone (branch, commit, branch push, PR, review fixes),
   what requires a human in the session (merge, migration, new dependency, infrastructure, production
   data, deletion), and what it never does.
6. **Stress test.** Ask 3 to 5 concrete propositions, one per turn, aimed at the draft's fuzzy areas
   ("an urgent production fix without a test, on a Friday night?", "an abstraction for a second client
   planned next month?", "the agent adds a dependency to save two hours?"). If the constitution
   already decides like the user → confirmed. If it does not decide → the article is too vague:
   sharpen it. If the user wants an exception → write it under "Exceptions".

## Writing

Fill in the template (continuous Roman numbering, AI policy included), today's dates,
`version: 1.0.0`. Write the constitution in the configured language (`config.language`, `auto` = the
conversation's); the field names the tools read (`**Check:**`, `**Exceptions:**`, `NON-NEGOTIABLE`,
`## Amendments`, `Approved by:`) stay as in the template. Show **the full text** in the chat, one round
of corrections, then write `CONSTITUTION.md` and run `node "$K" constitution check` until green
(warnings are discussed). Then:
- offer to add to `CLAUDE.md` (existing) one line: "Non-negotiable principles: `CONSTITUTION.md` —
  enforced by /kaizen:plan and /kaizen:review.";
- report **conflicts** with existing packs or learnings (a pack rule contradicting an article): the
  constitution wins, the rule must be amended — propose, do not change it.

## Phase 2 — Amendment (`amend`)

1. Read the current constitution. Identify the targeted article (or the proposed new article).
2. **Why now?** A postmortem, a recurring learning, an exception requested too often? Ask for the
   reason if it is not given: an amendment without a reason is refused.
3. Draft the change with the same follow-ups as in phase 1.
4. **Impact**: plans in progress (`node "$K" plan list` then `plan check` on each), pack rules and
   learnings becoming contradictory. Show the list.
5. Version: MAJOR if an article is removed or redefined incompatibly, MINOR if added or widened, PATCH
   if a clarification. Update `last_amended`. Add at the bottom a log `## Amendments`:
   `- v1.2.0 (2026-11-03) — Article IV widened to webhooks. Reason: postmortem docs/postmortems/…`.
6. **Approval.** If the frontmatter declares `approvers` (team governance), the amendment is only valid
   with `Approved by: @<approver>` at the end of the log line, and `constitution check` refuses it
   otherwise. Ask who approved it; never write a name the user did not give, and never an agent
   (`@claude`…): an agent does not approve a change to the rules it must follow. Without approval,
   leave the amendment as a proposal (PR touching `CONSTITUTION.md`, reviewed by the approvers, ideally
   through `CODEOWNERS`). In non-interactive mode: never an amendment, only a proposal.
7. Explicit approval, writing, `constitution check`.

## Phase 3 — Audit (`audit`)

Read-only. For each article: is the check verifiable? Is it **actually** applied? Look at the last 10
PRs or the last 50 commits of the default branch (`git log`, `gh pr list --state merged --limit 10` if
available) and recent plans: how many exceptions, which ones without justification, which articles are
never cited. An article never checked is dead: propose amending or removing it. Report: article, state
(alive / bypassed / dead), evidence, proposal.
