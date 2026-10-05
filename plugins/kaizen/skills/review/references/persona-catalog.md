# Reviewer catalog

Select by **judgment on the real diff** (read it), not by keywords. A reviewer with no surface to review
costs time and adds noise.

## Core

| Reviewer | Agent | When |
|---|---|---|
| `correctness` | `kaizen:correctness-reviewer` | always (targeted or full review) |
| `standards` | `kaizen:standards-reviewer` | as soon as there is a `CONSTITUTION.md`, at least one applicable standards file (`CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `.claude/rules/`), a pack rule whose `applies_when` matches, or a relevant learning in `docs/learnings/` |

## Generic conditionals

| Reviewer | Agent | When the diff touches… |
|---|---|---|
| `testing` | `kaizen:testing-reviewer` | test files or their infrastructure; **or** changed behavior (new branches, state mutation, API, control flow, error handling) with or without tests. Not for non-behavioral changes. |
| `maintainability` | `kaizen:maintainability-reviewer` | substantial refactor, new abstractions, file moves, coupling, or ≥ 200 executable lines changed |

## Area conditionals

| Reviewer | Agent | When the diff touches… |
|---|---|---|
| `security` | `kaizen:security-reviewer` | auth middleware, public endpoints, user input, permission checks (including feature flags guarding access), secrets, crypto, upload, deserialization, server-side called URLs |
| `performance` | `kaizen:performance-reviewer` | database/ORM query shape, algorithmic complexity, heavy transformations in loops, fan-out, caching policy with real impact |
| `reliability` | `kaizen:reliability-reviewer` | error handling, retries, timeouts, background jobs, async handlers, webhooks, calls to external services |
| `api-contract` | `kaizen:api-contract-reviewer` | an **externally consumed** boundary: routes and request/response shapes, serializers, published event schemas, versioning, a package's public signature with proven callers |
| `data-migration` | `kaizen:data-migration-reviewer` | migration files, schema dumps, backfills, data transformations — not a mere model or query change without a migration |
| `adversarial` | `kaizen:adversarial-reviewer` | ≥ 50 lines of changed code; or auth/payment; persistent writes or event publishing; retries, partial failures, concurrency or ordering; external APIs; or a verification mechanism that could wrongly go green (CI, gate, infra mocks) |

## Bounds

- Targeted review: 1 to 3 reviewers. Full review: usually 3 to 7.
- Beyond 7, group or prioritize by risk; say which were left aside and why.
- Purely documentation diff: `standards` (and `correctness` if the docs describe executable behavior,
  commands or config).
