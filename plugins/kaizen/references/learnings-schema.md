# Learnings schema (`<root>/learnings/`)

Frontmatter contract of the learnings written by `/kaizen:learn` and maintained by
`/kaizen:prune-learnings`. Validation: `node "$K" learnings validate <file>` (exit 1 if invalid).

## The durability test

A learning only belongs if it carries **durable reasoning** that the final code, tests, types,
comments and existing docs do not make obvious, and whose loss would plausibly **bring the problem
back, take a real risk, or redo a costly investigation**.

> Counterfactual: if this document disappeared, would a future developer reading the final
> implementation probably make the mistake again, or redo the same investigation?

Effort spent, diff size or having finished are not enough. If the test fails: write nothing and say
why.

## Two tracks, by `problem_type`

| Track | `problem_type` |
|---|---|
| **Bug** (diagnosed and fixed) | `build_error`, `test_failure`, `runtime_error`, `performance_issue`, `database_issue`, `security_issue`, `ui_bug`, `integration_issue`, `logic_error` |
| **Knowledge** (practice, pattern, decision) | `best_practice`, `documentation_gap`, `workflow_issue`, `developer_experience`, `architecture_pattern`, `design_pattern`, `tooling_decision`, `convention` — take the most precise value, `best_practice` as a last resort |

### Required fields (both tracks)

- `title` — clear title, identical to the H1
- `date` — `YYYY-MM-DD`
- `module` — module or area touched
- `problem_type` — enumeration above
- `component` — open vocabulary (see "Corpus vocabulary first"); suggested defaults: `data_model`,
  `api_layer`, `service_layer`, `background_job`, `database`, `frontend`, `messaging`,
  `infrastructure`, `observability`, `authentication`, `payments`, `development_workflow`,
  `testing_framework`, `documentation`, `tooling`
- `severity` — `critical` | `high` | `medium` | `low`

### Bug track — also required

- `symptoms` — list of 1 to 5 observable symptoms
- `root_cause` — open vocabulary; defaults: `wrong_api`, `data_integrity`, `concurrency`,
  `async_timing`, `memory_leak`, `config_error`, `logic_error`, `test_isolation`, `missing_validation`,
  `missing_permission`, `missing_workflow_step`, `inadequate_documentation`, `missing_tooling`,
  `incomplete_setup`
- `resolution_type` — `code_fix` | `migration` | `config_change` | `test_fix` | `dependency_update` |
  `environment_setup` | `workflow_improvement` | `documentation_update` | `tooling_addition` |
  `seed_data_update`
- optional: `framework_version` (e.g. `rails 7.1.2`, `node 22.4.0`)

### Knowledge track — optional

`applies_when` (≤ 5 situations), `symptoms`, `root_cause`, `resolution_type`.

### Optional (both tracks)

- `category` — subfolder of `learnings/`
- `tags` — ≤ 8 lowercase-with-dashes keywords
- `related_components` — other components
- `retire_when` — the change **outside the repo** that would make the learning obsolete and how to
  check it (open upstream bug, tool version…). A string; quoted if it contains ` #` or `: `.

## Corpus vocabulary first

A repo that already has learnings has its own vocabulary, and its searches rely on it. Before
classifying, sample the existing frontmatter and folders (`node "$K" learnings stats`):
- `component`: the value the corpus already uses for this area;
- `root_cause`: the value already used for **this same cause**, wherever it is;
- with competing spellings, the most frequent one (tie: the most recent);
- the suggested defaults only if nothing covers the area or the cause. No near-synonyms.
- Folder: the one already covering the area; otherwise the table below.

## Default folders

| `problem_type` | Folder |
|---|---|
| `build_error` | `learnings/build-errors/` |
| `test_failure` | `learnings/test-failures/` |
| `runtime_error` | `learnings/runtime-errors/` |
| `performance_issue` | `learnings/performance-issues/` |
| `database_issue` | `learnings/database-issues/` |
| `security_issue` | `learnings/security-issues/` |
| `ui_bug` | `learnings/ui-bugs/` |
| `integration_issue` | `learnings/integration-issues/` |
| `logic_error` | `learnings/logic-errors/` |
| `developer_experience` | `learnings/developer-experience/` |
| `workflow_issue` | `learnings/workflow-issues/` |
| `best_practice` | `learnings/best-practices/` |
| `documentation_gap` | `learnings/documentation-gaps/` |
| `architecture_pattern` | `learnings/architecture-patterns/` |
| `design_pattern` | `learnings/design-patterns/` |
| `tooling_decision` | `learnings/tooling-decisions/` |
| `convention` | `learnings/conventions/` |

File name: `<title-slug>.md`, without a date (the date is in the frontmatter).

## YAML safety

Double-quote any list item that starts with `` ` [ * & ! | > % @ ? `` or contains `": "`. Example:
`- "\`npm ci\` fails with EINTEGRITY"`.

## Templates

- Bug track: `${CLAUDE_PLUGIN_ROOT}/templates/learning-bug.md`
- Knowledge track: `${CLAUDE_PLUGIN_ROOT}/templates/learning-knowledge.md`
