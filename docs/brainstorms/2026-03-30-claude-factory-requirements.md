---
date: 2026-03-30
topic: claude-factory
---

# Claude Factory — Meta-plugin for creating Claude Code tools

> Historical document: the `claude-factory` plugin is no longer in this marketplace.

## Problem Frame

Creating Claude Code tools (skills, hooks, agents, rules, commands) requires knowing the frontmatter schemas, naming conventions, hook events, exit codes and the expected file structure. This knowledge is scattered across Anthropic's official docs and changes with every version. A developer who wants to create a skill or a hook has to navigate several doc pages, copy examples and adapt them by hand.

**Who is affected:** every Claude Code user who wants to extend its capabilities (marketplace plugins or local project configuration).

**Why it matters:** reduce the friction between "I have an idea for a tool" and "the tool works" — while guaranteeing compliance with the official specs.

## Requirements

### R0. Hybrid interaction (across all skills R1-R6)
- Each skill accepts a natural-language description as a starting point
- After analyzing the description, the skill asks targeted questions through `AskUserQuestion` ONLY for decisions the description does not settle
- If the description is precise enough, no question is asked
- Each skill supports **updates**: if the target artifact already exists, the skill reads it, shows the differences and proposes interactive changes through `AskUserQuestion`

### R1. Skill scaffolding (`/factory:skill`)
- Accepts a natural-language description of what the skill must do
- Generates the full structure: folder, SKILL.md with valid frontmatter, support files if needed
- Automatically determines the relevant frontmatter fields (`allowed-tools`, `model`, `effort`, `context`, `paths`, `shell`, inline `hooks`, etc.) from the description
- Asks interactive questions if key decisions remain ambiguous (e.g. "Which model? sonnet/opus/haiku", "Is a context: fork needed?")
- Generates the SKILL.md body with actionable instructions, not placeholders
- **Update mode**: if the skill exists, reads the existing SKILL.md and proposes changes (adding fields, updating the body, etc.)

### R2. Hook scaffolding (`/factory:hook`)
- Accepts a description of the desired behavior (e.g. "block rm -rf", "notify Slack when a test fails")
- Generates `hooks.json` with the right event, matcher and hook type (`command`/`http`/`prompt`/`agent`)
- Asks interactive questions if the event or the hook type is ambiguous
- Generates the implementation script for the `command` type (Node.js or Bash)
- Follows the conventions: exit code 0/2, JSON stdin/stdout, reasonable timeout
- **Update mode**: if `hooks.json` exists, reads it and proposes to add/modify a hook

### R3. Agent scaffolding (`/factory:agent`)
- Accepts a description of the agent's role
- Generates the `.md` file with complete frontmatter (`name`, `description`, `tools`/`disallowedTools`, `model`, `maxTurns`, `effort`, `isolation`, `skills`, inline `hooks`)
- Asks interactive questions about the model, the tools and the constraints if ambiguous
- Generates a quality system prompt suited to the described role
- **Update mode**: if the agent exists, reads it and proposes changes (system prompt, frontmatter)

### R4. Command scaffolding (`/factory:command`)
- Accepts a description of the command
- Generates the `.md` file with frontmatter and content
- Detects whether a command would be better served as a skill (richer structure) and suggests it through an interactive question
- **Update mode**: if the command exists, reads it and proposes changes

### R5. Rule scaffolding (`/factory:rule`)
- Accepts a description of the rule
- Generates the `.md` file in `.claude/rules/` with `paths` frontmatter if relevant
- Asks an interactive question to decide whether the rule is unconditional or path-scoped, with a suggestion based on the analysis
- **Update mode**: if the rule exists, reads it and proposes changes

### R6. Full plugin scaffolding (`/factory:plugin`)
- Accepts a description of the plugin
- Asks interactive questions about the components to include (skills, hooks, agents, MCP, templates)
- Generates the full structure: `plugin.json`, README.md and the identified sub-components
- Proposes registration in `marketplace.json` when in the marketplace context
- **Update mode**: if the plugin exists, reads its structure and proposes to add components

### R7. CLAUDE.md maintenance (`/factory:claude-md`)
- Analyzes an existing CLAUDE.md
- Identifies: missing sections, redundancies, overly long instructions (>200 lines), contradictions, missing imports
- Proposes a restructuring following the official best practices (headers, bullets, specific and verifiable)
- Can generate a CLAUDE.md from scratch if none exists (better than `/init`)

### R8. Audit and validation (`/factory:audit`)
- Takes a path to an existing plugin, skill, hook or agent
- Checks compliance against the official schemas (required frontmatter, valid events, exit codes, etc.)
- Identifies deprecated fields or obsolete patterns
- Generates a report with suggested fixes

### R9. Built-in reference documentation (`/factory:docs`)
- Gives quick access to the official references without leaving the terminal
- Covers: frontmatter fields (skills, agents), complete hook events, exit codes, permission rule syntax, settings schema, string substitutions
- Accepts natural-language queries (e.g. `/factory:docs hook events that can block`)

### R10. Embedded static documentation
- The whole official reference is compiled into `.md` files included in the plugin
- Works offline, with no network dependency
- Organized by domain (skills, hooks, agents, rules, settings, CLAUDE.md)

## Success Criteria

- A user can create a working skill with a single `/factory:skill` command + description, with interactive questions if decisions remain ambiguous
- A user can update an existing artifact through the same skill (automatic create/update mode detection)
- Generated artifacts pass a `/factory:audit` without error
- The reference docs cover 100% of the official frontmatter fields and hook events (March 2026)
- The plugin works entirely offline (no MCP/network dependency)

## Scope Boundaries

- **Non-goal:** business code generation (application logic) — the plugin generates structure and instructions, not functional code
- **Non-goal:** versioning or migrating existing plugins to new schemas
- **Non-goal:** integration with external plugin registries (npm, GitHub marketplace)
- **Non-goal:** graphical or web UI — everything is CLI/terminal through Claude Code
- **Non-goal:** dynamic documentation fetching (context7, web) — everything is embedded and static

## Key Decisions

- **Standalone**: no dependency on `compound-engineering` or any other marketplace plugin. Can coexist with `create-agent-skills`.
- **Hybrid interactive**: the user gives a free description, then the skill asks targeted questions through `AskUserQuestion` only for unsettled decisions. Not a full wizard, but smart guidance.
- **Create + update**: each skill detects whether the artifact exists. If so, interactive update mode (reading the existing one, proposing changes). Otherwise, create mode.
- **Embedded static docs**: the official reference is compiled into the plugin. Benefit: offline, predictable. Trade-off: requires manual updates when Anthropic changes the specs.
- **Name: `claude-factory`**: invoked through `/factory:skill`, `/factory:hook`, etc.

## Dependencies / Assumptions

- The official Claude Code schemas (frontmatter, hooks, settings) are stable as of March 2026. The plugin will need updates if Anthropic makes breaking changes.
- The plugin targets the existing marketplace (`marketplace-claude-code`) but the generated tools also work standalone (`.claude/skills/`, `.claude/rules/`, etc.)

## Outstanding Questions

### Resolve Before Planning
_(none — every product decision is settled)_

### Deferred to Planning
- [Affects R10][Needs research] What granularity for the embedded reference files? One file per domain or one file per concept (e.g. `hook-events.md`, `skill-frontmatter.md`)?
- [Affects R1-R6][Technical] A dedicated agent (`context: fork`) for each sub-skill, or a single main skill that dispatches?
- [Affects R8][Technical] How to structure the validation rules for the audit? JSON schema, programmatic checks (script), or LLM instructions?
- [Affects R1-R6][Technical] Plugin structure: one skill per sub-command (`skills/factory-skill/`, `skills/factory-hook/`, etc.) or a single skill with internal dispatch?

## Next Steps

-> `/ce:plan` for structured implementation planning
