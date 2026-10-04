# Kaizen Packs

A **pack** is a folder of prescriptive rules: what work in an area **must** follow. Examples: "every CSV
export starts with a UTF-8 BOM", "pages receive their data as server props, never through a parallel
JSON endpoint".

| | A learning (`docs/learnings/`) | A pack rule | The constitution |
|---|---|---|---|
| Says | what a past problem taught | what to do in an area | what holds for **all** the work |
| Written by | `/kaizen:learn` after the fact | the team, deliberately | `/kaizen:constitution` |
| Scope | one repo | one or several repos (git packs) | one repo |
| Weight | constraint | rule | non-negotiable rule |

Hierarchy in case of conflict: **constitution > packs > learnings > preferences**.

## What the skills do with packs

- `/kaizen:brainstorm` and `/kaizen:plan` compare each rule's `applies_when` to the work in progress. A
  rule that applies becomes a constraint of the plan, cited `(pack: <id>, <file>)`.
- `/kaizen:review` (`standards` reviewer) reports a diff contradicting an applicable rule.
- `/kaizen:learn` offers to turn a learning into a rule when it holds for the whole team.

Packs are **declared, never discovered**: without a `packs` key in the config, nothing changes.

## Create a pack (2 minutes)

```text
/kaizen:setup pack:house-rules
```

or `node $K pack new house-rules`. Kaizen creates `kaizen-packs/house-rules/` (a `README.md` and a
`research/` folder) and declares it in `.kaizen/config.json`. Then add a rule:

```markdown
<!-- kaizen-packs/house-rules/csv-exports.md -->
---
title: Every CSV export starts with a UTF-8 BOM and uses ";"
applies_when:
  - adding or changing a CSV export
  - generating a file meant to be opened in Excel
tags: [csv, export, excel]
---

Excel only reads UTF-8 with a BOM, and expects ";" in European locales.
See docs/learnings/runtime-errors/csv-export-excel-accents.md.
```

Check with `node $K packs`:

```text
📦 house-rules  (kaizen-packs/house-rules) → kaizen-packs/house-rules
   • csv-exports.md — Every CSV export starts with a UTF-8 BOM and uses ";"
       when: adding or changing a CSV export | generating a file meant to be opened in Excel
```

`node $K packs --json` gives the same list in JSON (what the skills read).

## Structure of a pack

```text
kaizen-packs/house-rules/
├── README.md              pack description — never read as a rule
├── csv-exports.md         top-level .md with title + applies_when = a rule
├── error-responses.md     another rule
└── research/              any subfolder = storage, never read as a rule
    └── adr-001-…md
```

- A **rule** is a `.md` file **at the top level** of the pack, with `title` and `applies_when`.
- Files without these fields are ignored **with a warning**. Store notes in a subfolder.
- 25 rules at most per pack.

## Writing an `applies_when` that triggers

The comparison is **semantic**, done by the agent, not by a regular expression. Describe
**situations**, with the words a feature request would use:

```yaml
# Good: situations
applies_when:
  - adding a page that needs server data
  - adding or changing an endpoint consumed by the application's pages

# Weak: topic labels
applies_when:
  - inertia
  - architecture
```

- One situation per line; two or three concrete conditions beat an abstract one.
- To target a precise step, the wording is enough. "While reviewing a diff touching payment" will only
  trigger in review.
- Two rules of the same pack must not prescribe the same thing: the review would not know which one
  wins.

## Sharing packs between repos

Declare a git source **pinned** to a tag, so that the whole team reads the same version:

```json
"packs": [
  { "source": "kaizen-packs/house-rules" },
  { "source": "~/kaizen-packs/my-style" },
  { "source": "https://github.com/acme/kaizen-packs", "ref": "v1.2.0" },
  { "source": "https://github.com/acme/kaizen-packs", "ref": "v1.2.0", "pack": ["rails", "inertia"] },
  { "source": "git@github.com:acme/stack.git", "ref": "v3", "path": "packs" }
]
```

| Field | Role |
|---|---|
| `source` | repo folder, local folder (`~/…`), or git URL (`https://`, `git@`, `ssh://`, `file://`) |
| `ref` | tag or branch to clone (recommended: a tag) |
| `pack` | in a multi-pack source, the subfolder(s) to take |
| `path` | subfolder of the source containing the pack(s) |
| `id` | name of the pack when the source itself is a single pack (default: the folder name) |

A source whose top level contains rules forms **one** pack. Otherwise, **each subfolder** is a pack.
Git sources are cloned once into the plugin's cache (`$CLAUDE_PLUGIN_DATA/packs/`, otherwise
`~/.cache/kaizen/packs/`). To update them: `node $K packs --refresh`.

## Security

A pack's text is treated as **data**, not as an instruction: agents extract constraints from it and
ignore anything that looks like an instruction addressed to them. Still only declare trusted sources,
preferably pinned to a tag.
