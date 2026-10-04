# `/kaizen:constitution`

> The engineering principles the project does not negotiate, each with a check the plan must pass and
> the review verifies.

`CONSTITUTION.md` says **how things are built here** and **what an agent may do on its own**. It is not
a list of good intentions: a principle without a verifiable check is never applied, so every article
carries one. The idea comes from GitHub's Spec Kit. Kaizen enforces it through mechanical checks rather
than reminders.

## At a glance

| | |
|---|---|
| **What it does** | An interview (with follow-ups and a stress test) producing 5 to 9 articles, an AI policy and a governance. It can also amend and audit. |
| **When to use it** | When starting Kaizen on a project; after a postmortem revealing a missing principle; when an exception comes back too often |
| **When not to use it** | For a precise domain rule (→ [pack](../packs.md)); for a learning (→ [learn](learn.md)); for a feature (→ [brainstorm](brainstorm.md)) |
| **What it produces** | `CONSTITUTION.md` at the root, versioned with SemVer, validated by `node $K constitution check` |
| **What next** | `/kaizen:brainstorm`: the constitution now frames every plan and every review |

## Examples

```text
/kaizen:constitution                       # first writing (or amend/audit choice if it exists)
/kaizen:constitution amend article IV      # change an article, with reason and impact
/kaizen:constitution amend add a principle on webhook idempotency
/kaizen:constitution audit                 # are the articles really applied?
```

## How it goes

1. **Reading the repo**: CI, test and lint tools, `CLAUDE.md`, packs, most frequent learning types.
   Claude tells you what it takes from it and you correct.
2. **The question that hurts**: "When a change cost a lot here, what should have prevented it
   upstream?"
3. **Candidates**: it proposes 5 to 8 articles suited to the repo, from these families: evidence
   first, simplicity, no premature abstraction, small batches, secure by default, compatibility,
   observability, reversibility, AI policy. You keep, rewrite or add.
4. **One check per article.** Claude pushes back on vague principles: "quality code" becomes "how would
   a reviewer see it in a PR?". Rules a linter already enforces are set aside.
5. **NON-NEGOTIABLE**: reserved for 1 to 3 articles. The others may provide exceptions, to justify in
   the plan.
6. **AI policy** (mandatory): what the agent does alone, what requires a human, what it never does.
7. **Stress test**: 3 to 5 concrete cases. If the constitution does not decide a case, the article is
   sharpened.
8. The full text is shown to you and you correct it once. Then writing and validation.

## Format of an article

```markdown
### I. Evidence first — NON-NEGOTIABLE

Every behavior change comes with a test that failed before the change.

**Check:** does each unit of the plan have an evidence strategy, and the PR a test that failed on the base?

**Exceptions:** renames, pure configuration, generated files — reason and replacement check in the plan.
```

Continuous Roman numbering, including in the "AI policy" section. Frontmatter: `name`, `version`,
`ratified`, `last_amended`, `artifact: kaizen-constitution/v1`. Template:
[`templates/constitution.md`](../../templates/constitution.md). The text can be written in your team's
language; the field names the tools read (`**Check:**`, `**Exceptions:**`, `NON-NEGOTIABLE`,
`## Amendments`, `Approved by:`) stay as in the template. Constitutions written in French before
Kaizen 3.0 (`**Contrôle :**`, `NON NÉGOCIABLE`, `Approuvé par :`) are still read.

## How it is enforced

| Where | How |
|---|---|
| `/kaizen:plan` | "Constitution check" section: one verdict per article, justified exceptions |
| `node $K plan check` | fails if an article is not assessed |
| `/kaizen:doc-review` | the scope reviewer checks the exceptions |
| `/kaizen:review` | the `standards` reviewer applies each **Check** to the diff: violating a NON-NEGOTIABLE article = P0, another article = P1 |
| `/kaizen:ship` | exceptions are restated in the PR |

## Amending

An amendment always has a **reason** (postmortem, recurring learning, too frequent exception) and an
**impact analysis**: plans in progress, packs and learnings becoming contradictory. Version:
- MAJOR if an article is removed or redefined incompatibly;
- MINOR if an article is added or widened;
- PATCH for a clarification.

The amendment is noted in a `## Amendments` log at the bottom of the file.

**In a team**, declare who may approve:

```yaml
approvers: [@alice, @bob]
ratified_by: alice
```

Each log entry then ends with `Approved by: @bob`, and `node $K constitution check` refuses a version
without an amendment approved by a declared approver, or approved by an agent. Add `CONSTITUTION.md` and
`kaizen-packs/` to `CODEOWNERS` so that GitHub requests their review (`node $K audit fix codeowners`).

## Good to know

- Without a constitution, all of Kaizen works. You only lose the project-specific checks.
- In case of conflict: constitution > packs > learnings > preferences.
- `audit` looks at the last 10 PRs and the recent plans. An article never checked is declared "dead",
  and Claude proposes amending or removing it.

## See also

[plan](plan.md) · [review](review.md) · [postmortem](postmortem.md) · [Kaizen Packs](../packs.md)
