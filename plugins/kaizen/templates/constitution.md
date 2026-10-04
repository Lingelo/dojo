---
name: {{project name}}
version: 1.0.0
ratified: {{YYYY-MM-DD}}
last_amended: {{YYYY-MM-DD}}
artifact: kaizen-constitution/v1
---

# Engineering constitution — {{project name}}

{{1 to 2 lines: what this constitution governs (this repo, this service…) and who it is written for
(humans and agents).}}

Hierarchy: **constitution > Kaizen Pack rules > learnings in `docs/learnings/` > preferences.**
A plan that departs from an article justifies it in its constitution check; a **NON-NEGOTIABLE**
article admits no exception without an amendment.

## Articles

<!-- 5 to 9 articles. Each one: a 1-to-3-sentence rule, a verifiable check, optional exceptions.
     Starting examples below — keep, rewrite or delete them during the interview. -->

### I. {{Title}} — NON-NEGOTIABLE

{{Rule: what is always true, phrased so it can be verified.}}

**Check:** {{the question a reviewer or an agent asks of the plan and the diff, answered yes or no with evidence.}}

### II. {{Title}}

{{Rule.}}

**Check:** {{…}}

**Exceptions:** {{when it is allowed, and how the exception is recorded.}}

## AI policy

<!-- What agents may do on their own, what requires a human. It is an article like the others:
     keep the numbering continuous. -->

### {{N}}. Agent autonomy

{{E.g.: Agents may create branches, commit, push a working branch and open a PR. They never merge,
never push to the default branch, never rewrite shared history. A data migration, a new dependency or
an infrastructure change requires a human's explicit approval in the session.}}

**Check:** {{Is every such action in the PR traced to a human approval (session, PR comment)?}}

## Governance

- **Amendment** — through `/kaizen:constitution amend`: proposal, impact (plans in progress,
  conflicting packs and learnings), explicit approval, then version and `last_amended` update.
- **Approval** — {{optional, for a team: declare `approvers: [@alice, @bob]` and `ratified_by: alice`
  in the frontmatter. Each amendment in the log then ends with "Approved by: @…" (checked by
  `constitution check`), and `CODEOWNERS` assigns `CONSTITUTION.md` and `kaizen-packs/` to these
  approvers.}}
- **Versioning** — MAJOR: article removed or redefined incompatibly; MINOR: article added or widened;
  PATCH: clarification without a change of meaning.
- **Enforcement** — `/kaizen:plan` assesses each article ("Constitution check" section),
  `/kaizen:doc-review` and `/kaizen:review` verify it, every exception is justified in the plan and
  restated in the PR.
- **Review** — reread at least once a quarter or after a postmortem that calls it into question.
