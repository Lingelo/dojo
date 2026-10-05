# Agents and models

Kaizen ships 21 **read-only** subagents in [`agents/`](../../agents/). Skills launch them through the
`Agent` tool (`subagent_type: "kaizen:<name>"`), in parallel when they are independent, each with a
self-contained context (an agent does not see the conversation) and the model the team’s policy
assigns to its role. If the plugin agent type is not available, the skill uses `general-purpose` with
the agent’s instructions pasted at the top of the prompt.

## Research agents

| Agent | Launched by | What it returns |
|---|---|---|
| `repo-researcher` | brainstorm (standard/deep), plan (always on durable plans) | stack, architecture, conventions, and above all **existing patterns to imitate**: analogous files, neighboring tests, integration points |
| `learnings-researcher` | brainstorm, plan, review, debug | the learnings, ADRs, postmortems and pack rules that apply, turned into constraints, traps and tests — the agent that closes the loop |
| `git-historian` | plan (old, central or bug-prone code), debug (when was it introduced?) | why the code is the way it is: decisions, past regressions, reverted fixes, reference authors (`git log`, `blame`, pickaxe) |
| `docs-researcher` | plan, debug — with precise questions | what the official documentation of the **version actually used** says, and current practice (the only agent with web access) |
| `flow-analyst` | brainstorm, plan (multi-step features) | missing journeys, error cases, state transitions, unspecified permission boundaries |

## Plan reviewers (`/kaizen:doc-review`)

Share the [document reviewer contract](../../references/doc-review-contract.md).

| Agent | When | Lens |
|---|---|---|
| `plan-coherence-reviewer` | always | contradictions, vocabulary drift, broken references, ambiguities, R/AE/U traceability |
| `plan-feasibility-reviewer` | always (standard, full) | can the approach work with the code’s real capabilities: interfaces, dependencies, ordering, migrations, volumes, failure paths |
| `plan-scope-reviewer` | every ready plan | unrequested mechanisms, drift from requirements, slices too big, simplicity and small batches |
| `plan-security-reviewer` | auth, sensitive data, payment, exposed endpoints, integrations | threat model (STRIDE), trust boundaries, secrets |
| `plan-adversarial-reviewer` | high stakes, new abstraction, no prior brainstorm, widened scope (always in `full`) | attacks the premises: right problem? right solution? predicted outcomes? |
| `plan-design-reviewer` | user interface | empty/loading/error states, journeys, accessibility, responsiveness, consistency |

## Code reviewers (`/kaizen:review`)

Share the [reviewer contract](../../references/review-contract.md); selection rules in
[The review system](review.md#3-selection).

| Agent | Looks for |
|---|---|
| `correctness-reviewer` | bugs that pass the tests: boundaries, null, state, swallowed errors, unmet intent (mentally executes the code) |
| `standards-reviewer` | violations of the constitution, `CLAUDE.md`/`AGENTS.md`/`CONTRIBUTING`/`.claude/rules/`, pack rules and applicable learnings, quoting the rule |
| `security-reviewer` | the exploitable path: injection, access control, secrets, deserialization, SSRF, crypto, feature-flag leaks |
| `testing-reviewer` | tests that do not prove the behavior: untested branches, hollow assertions, implementation coupling, non-determinism |
| `performance-reviewer` | N+1, unbounded memory, missing pagination, hot-path allocations, blocking I/O, at the expected scale |
| `reliability-reviewer` | unhandled I/O errors, retries without backoff, missing timeouts, leaks on error, failure cascades |
| `api-contract-reviewer` | breaking changes to consumed interfaces, missing versioning, inconsistent errors (Hyrum’s law) |
| `data-migration-reviewer` | locks on large tables, irreversible migrations, non-idempotent backfills, deploy/migration ordering |
| `maintainability-reviewer` | complexity moved rather than removed, wrong layer, hollow wrappers, premature abstraction, dead code |
| `adversarial-reviewer` | concrete scenarios that break the code: violated assumptions, faulty compositions, cascades, safeguards that go green while production breaks |

All agents have `Read`, `Grep`, `Glob` and `Bash` limited by their instructions to non-mutating commands
(`git diff/log/blame/show`, reading, searching); `docs-researcher` adds `WebSearch` and `WebFetch`.
Code reviewers work within about 40 tool calls, plan reviewers about 25; when the budget runs out they
return what they substantiated and name what they did not reach.

## The model policy

Each agent has a **role**; each role a model per **profile**. Principle: bulk reading and synthesis
rarely cost much when wrong; judgments whose errors are expensive (security, migrations, adversarial,
plan decisions) get the strongest model.

| Role | Agents | `lean` | `standard` | `full` |
|---|---|---|---|---|
| `research` | the five researchers | haiku | sonnet | sonnet |
| `review` | correctness, testing, performance, reliability, api-contract, maintainability, standards | sonnet | sonnet | opus |
| `review_critical` | security, data-migration, adversarial | sonnet | opus | opus |
| `plan_review` | plan-coherence, plan-feasibility, plan-scope, plan-design | haiku | sonnet | opus |
| `plan_review_critical` | plan-security, plan-adversarial | sonnet | opus | opus |
| `implement` | `general-purpose` subagents `/kaizen:work` hands independent units to | sonnet | sonnet | inherit |

`inherit` means the session’s model (no `model` parameter passed). Override per role or per agent:

```json
"models": {
  "roles": { "review_critical": "opus", "research": "haiku" },
  "agents": { "performance-reviewer": "opus" }
}
```

Valid values: `haiku`, `sonnet`, `opus`, `inherit`; unknown roles, agents or models are reported and
ignored. `node $K models` prints the effective policy with each value’s source (`profile standard` or
`config`), `--agent <name>` one agent’s model, `--json` the whole structure that skills read.

Skills must not change the policy "to go faster"; if an agent fails for lack of capability, it is
relaunched once with the next model up and the report says so. The review records the model actually
requested for each reviewer (`node $K review status`), and [cycle cost](metrics.md#cycle-cost) breaks
tokens down by role — enough to check that a cheaper model does not degrade quality.
