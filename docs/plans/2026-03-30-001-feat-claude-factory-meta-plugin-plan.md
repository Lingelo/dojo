---
title: "feat: Claude Factory meta-plugin for Claude Code tooling"
type: feat
status: active
date: 2026-03-30
origin: docs/brainstorms/2026-03-30-claude-factory-requirements.md
---

# feat: Claude Factory — Meta-plugin for creating Claude Code tools

> Historical document: the `claude-factory` plugin is no longer in this marketplace.

## Overview

Standalone plugin for the `marketplace-claude-code` marketplace to create any kind of Claude Code tool (skills, hooks, agents, commands, rules), maintain CLAUDE.md files, audit existing artifacts and look up the official documentation — all offline, with embedded static documentation.

## Problem Statement / Motivation

Creating Claude Code tools requires knowing the frontmatter schemas, naming conventions, hook events, exit codes and file structure. This knowledge is scattered and keeps changing. The plugin reduces the friction between "I have an idea" and "the tool works" while guaranteeing compliance with the official specs of March 2026. (see origin: `docs/brainstorms/2026-03-30-claude-factory-requirements.md`)

## Proposed Solution

A `claude-factory` plugin with **9 independent skills** sharing an **embedded static reference docs** base. Each skill takes a natural-language description and generates the matching artifacts.

### Plugin architecture

```
plugins/claude-factory/
  .claude-plugin/plugin.json
  README.md
  references/                          # R10 — Embedded official documentation
    skill-spec.md                      # Complete frontmatter, string substitutions, best practices
    hook-spec.md                       # Complete events (25+), types, exit codes, JSON output
    agent-spec.md                      # Frontmatter, constraints, invocation methods
    command-spec.md                    # Format, relation to skills
    rule-spec.md                       # Path-scoping, glob patterns, precedence
    settings-spec.md                   # settings.json schema, permission rule syntax
    claude-md-spec.md                  # Structure, imports, limits, best practices
    plugin-spec.md                     # plugin.json schema, marketplace registration
  templates/                           # Generation templates
    skill-simple.md                    # Basic SKILL.md template
    skill-router.md                    # Router SKILL.md template (multi-workflow)
    hook-command.json                  # hooks.json template, command type
    hook-script.js                     # Node.js hook script template
    hook-script.sh                     # Bash hook script template
    agent.md                           # Agent .md template
    command.md                         # Command .md template
    rule-global.md                     # Rule template without path-scoping
    rule-scoped.md                     # Rule template with paths frontmatter
    plugin.json                        # plugin.json template
    readme.md                          # Plugin README.md template
  skills/
    skill/SKILL.md                     # R1 — /factory:skill
    hook/SKILL.md                      # R2 — /factory:hook
    agent/SKILL.md                     # R3 — /factory:agent
    command/SKILL.md                   # R4 — /factory:command
    rule/SKILL.md                      # R5 — /factory:rule
    plugin/SKILL.md                    # R6 — /factory:plugin
    claude-md/SKILL.md                 # R7 — /factory:claude-md
    audit/SKILL.md                     # R8 — /factory:audit
    docs/SKILL.md                      # R9 — /factory:docs
```

### Technical decisions (questions settled by the SpecFlow analysis)

**Target path resolution (Q1)**: inferred from the CWD.
- If the CWD is inside `plugins/<name>/` → write into that plugin
- If the CWD contains `.claude-plugin/marketplace.json` → ask which plugin to target
- Otherwise → write into `.claude/skills/`, `.claude/rules/`, `.claude/agents/` (standalone)
- The user can pass an explicit path as an argument: `/factory:skill path/to/target "description"`

**Naming (Q3)**: inferred by the LLM from the description, kebab-case. The user can override it with a prefix: `/factory:skill my-name "description"`.

**Collision (Q2)**: if an artifact already exists at the target path, the skill shows a clear error with the existing path and suggests an alternative name. No implicit overwrite.

**Incremental additions (Q5)**: `/factory:hook` in an existing plugin detects the existing `hooks.json` and **appends** a new hook entry to the array. Same for the `marketplace.json` registration.

**Plugin context (Q4)**: detected by the presence of `marketplace.json` or `.claude-plugin/plugin.json` in the CWD's parents.

**CLAUDE.md scope (Q6)**: targets the CLAUDE.md closest to the CWD. If there is none, offers to create it at the project root.

**Audit type detection (Q7)**: convention-based — `SKILL.md` = skill, `hooks.json` = hook, `agents/*.md` = agent, etc. If ambiguous, ask.

**Language (Q8)**: the generated content follows the language of the user's description. Technical frontmatter fields stay in English.

**Dry-run (Q9)**: not in v1. Each skill shows a summary of what will be created BEFORE writing (without blocking).

**Self-audit (Q10)**: not automatic. The skill mentions `/factory:audit` as a recommended step after generation.

## Technical Considerations

### Shared references pattern

Each skill's SKILL.md references the relevant docs through relative imports. Example for `skills/skill/SKILL.md`:

```markdown
---
name: skill
description: Scaffold a Claude Code skill from natural language description. Use when creating /commands, SKILL.md files, or extending Claude Code capabilities.
allowed-tools: Read, Write, Glob, Grep, Bash, AskUserQuestion
---

# Factory: Create Skill

Reference: @../../references/skill-spec.md
Templates: @../../templates/skill-simple.md, @../../templates/skill-router.md

[Instructions for generation...]
```

This lets each skill load only the relevant references without duplicating content.

### Reference docs: content to compile

Each reference file is a **structured compilation** of Anthropic's official documentation (March 2026), organized for quick lookup by the LLM:

| File | Key content |
|---|---|
| `skill-spec.md` | 20+ frontmatter fields, string substitutions ($ARGUMENTS, ${CLAUDE_SKILL_DIR}), dynamic context (!`cmd`), best practices |
| `hook-spec.md` | 25+ events (PreToolUse → SessionEnd), 4 types (command/http/prompt/agent), exit codes, JSON output schema, env vars |
| `agent-spec.md` | Complete frontmatter (15+ fields), built-in agents, constraints (no nesting), invocation methods |
| `command-spec.md` | Format, merge with skills, precedence |
| `rule-spec.md` | paths frontmatter, glob syntax, unconditional vs scoped, precedence |
| `settings-spec.md` | Permission rules (`ToolName(pattern)`), hooks config, env, model, managed settings |
| `claude-md-spec.md` | Locations, precedence, imports (@path), 200-line guideline, AGENTS.md compat |
| `plugin-spec.md` | plugin.json schema, marketplace.json format, categories |

### No scripts — everything is LLM instructions

The plugin contains **no Node.js or Bash script** for generation. The SKILL.md files contain detailed instructions that Claude carries out with the standard tools (Read, Write, Glob, Grep, Bash). The templates are a base the LLM adapts.

Possible exception: the audit (R8) could benefit from a JSON schema validation script, but v1 uses LLM instructions only.

## System-Wide Impact

- **Interaction graph**: each skill creates files. `/factory:plugin` can modify `marketplace.json`. `/factory:claude-md` modifies CLAUDE.md. No interaction with hooks or external services.
- **Error propagation**: errors are malformed files or invalid paths. The LLM detects and fixes them in the flow.
- **State lifecycle risks**: the only risk is a partial generation if Claude is interrupted. The written files are independent, no critical multi-file transaction.
- **API surface parity**: no API. Everything is CLI through Claude Code skills.

## Acceptance Criteria

### R1-R5: Unit scaffolds
- [ ] `/factory:skill "description"` generates `SKILL.md` with valid frontmatter and actionable instructions
- [ ] `/factory:hook "description"` generates a valid `hooks.json` + script for the command type
- [ ] `/factory:agent "description"` generates an agent `.md` with complete frontmatter and system prompt
- [ ] `/factory:command "description"` generates a command `.md` — suggests converting to a skill if relevant
- [ ] `/factory:rule "description"` generates a rule `.md` with path-scoping if applicable
- [ ] Each scaffold detects the context (marketplace plugin vs standalone) for the target path
- [ ] Collision detected → clear error, no overwrite

### R6: Full plugin
- [ ] `/factory:plugin "description"` generates the full structure (plugin.json, README, sub-components)
- [ ] Proposes registration in marketplace.json if the marketplace context is detected

### R7: CLAUDE.md
- [ ] `/factory:claude-md` without argument → analyzes the closest CLAUDE.md
- [ ] Identifies: missing sections, >200 lines, contradictions, missing imports
- [ ] Proposes a concrete restructuring
- [ ] Without an existing CLAUDE.md → generates one from scratch based on the project analysis

### R8: Audit
- [ ] `/factory:audit path` detects the artifact type automatically
- [ ] Checks compliance against the embedded schemas
- [ ] Structured report with errors, warnings, suggestions

### R9: Docs
- [ ] `/factory:docs "query"` returns the relevant reference from the static docs
- [ ] Covers 100% of the skill and agent frontmatter fields and hook events (March 2026)

### R10: Embedded documentation
- [ ] 8 complete, structured reference files
- [ ] 11 templates covering every artifact type
- [ ] Works 100% offline

### Overall quality
- [ ] Generated artifacts pass `/factory:audit` without error
- [ ] Each skill shows a summary of what will be created before writing
- [ ] Plugin registered in marketplace.json, "development" category
- [ ] Complete README.md with usage examples for each sub-command

## Implementation Phases

### Phase 1: Foundation (references + templates + plugin skeleton)

**Goal**: create the knowledge base that feeds every generator.

**Files to create**:
- `plugins/claude-factory/.claude-plugin/plugin.json`
- `plugins/claude-factory/README.md` (placeholder, completed in Phase 5)
- `plugins/claude-factory/references/skill-spec.md`
- `plugins/claude-factory/references/hook-spec.md`
- `plugins/claude-factory/references/agent-spec.md`
- `plugins/claude-factory/references/command-spec.md`
- `plugins/claude-factory/references/rule-spec.md`
- `plugins/claude-factory/references/settings-spec.md`
- `plugins/claude-factory/references/claude-md-spec.md`
- `plugins/claude-factory/references/plugin-spec.md`
- `plugins/claude-factory/templates/skill-simple.md`
- `plugins/claude-factory/templates/skill-router.md`
- `plugins/claude-factory/templates/hook-command.json`
- `plugins/claude-factory/templates/hook-script.js`
- `plugins/claude-factory/templates/hook-script.sh`
- `plugins/claude-factory/templates/agent.md`
- `plugins/claude-factory/templates/command.md`
- `plugins/claude-factory/templates/rule-global.md`
- `plugins/claude-factory/templates/rule-scoped.md`
- `plugins/claude-factory/templates/plugin.json`
- `plugins/claude-factory/templates/readme.md`

**Exit criterion**: the references cover 100% of the official March 2026 specs. The templates work and are valid.

### Phase 2: Core generators (R1-R5)

**Goal**: the 5 unit scaffolding skills.

**Files to create**:
- `plugins/claude-factory/skills/skill/SKILL.md`
- `plugins/claude-factory/skills/hook/SKILL.md`
- `plugins/claude-factory/skills/agent/SKILL.md`
- `plugins/claude-factory/skills/command/SKILL.md`
- `plugins/claude-factory/skills/rule/SKILL.md`

**Each SKILL.md follows the same structure**:
1. Frontmatter (`name`, `description` with triggers, `allowed-tools`)
2. Import of the relevant references through `@../../references/`
3. Instructions for parsing the user's description
4. Context detection logic (marketplace vs standalone)
5. Collision detection logic
6. Generation instructions with the template as a base
7. Post-generation summary + `/factory:audit` suggestion

**Exit criterion**: each skill generates a valid artifact from a natural-language description.

### Phase 3: Plugin scaffold (R6)

**Goal**: generating a complete plugin.

**File to create**:
- `plugins/claude-factory/skills/plugin/SKILL.md`

**Specific logic**:
- Analyzes the description to identify the needed sub-components (skills? hooks? agents? MCP?)
- Generates the full structure by orchestrating the templates
- Detects the marketplace and proposes registration
- Generates a README.md suited to the created plugin

**Exit criterion**: `/factory:plugin "a security plugin that blocks sensitive files"` generates a working plugin with hooks, scripts, plugin.json and README.

### Phase 4: Maintenance and validation (R7, R8)

**Files to create**:
- `plugins/claude-factory/skills/claude-md/SKILL.md`
- `plugins/claude-factory/skills/audit/SKILL.md`

**claude-md**: structural analysis (line count, sections, imports, contradictions), comparison against `claude-md-spec.md`, concrete restructuring suggestions, generation from scratch if none exists.

**audit**: artifact type detection by path convention, validation of required and optional fields against the embedded specs, structured report (errors/warnings/info).

**Exit criterion**: `/factory:audit` correctly detects the errors in a deliberately malformed artifact.

### Phase 5: Reference documentation (R9) + finalization

**Files to create**:
- `plugins/claude-factory/skills/docs/SKILL.md`

**Files to update**:
- `plugins/claude-factory/README.md` (complete version with examples)
- `.claude-plugin/marketplace.json` (adding the claude-factory entry)

**docs**: the skill reads the user's query, identifies the domain (skill, hook, agent, etc.), loads the relevant reference from `references/` and returns a targeted excerpt.

**Exit criterion**: `/factory:docs "which hook events can block an action"` returns the exact list of events with `Can Block? Yes`.

## Dependencies & Risks

| Risk | Impact | Mitigation |
|---|---|---|
| The official documentation changes after March 2026 | Generated artifacts not compliant | Version the references (date in the header), add a freshness check in the audit |
| Skills too long (>500 lines) | Lower instruction quality | Use `@` imports to delegate to the references, keep the SKILL.md files concise |
| Variable generation quality | Incorrect or incomplete artifacts | Solid templates + exhaustive references reduce hallucinations. The post-generation audit is the safety net |
| Confusion with `create-agent-skills` | Users do not know which one to use | Clear README on the positioning: `claude-factory` is standalone and covers everything, `create-agent-skills` is specific to compound-engineering |

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-03-30-claude-factory-requirements.md](docs/brainstorms/2026-03-30-claude-factory-requirements.md) — Key decisions: standalone plugin, free prompt (no wizard), embedded static documentation, name `claude-factory`

### Internal References

- Plugin structure convention: `plugins/git/.claude-plugin/plugin.json`
- Skill pattern (simple): `plugins/git/skills/commit/SKILL.md`
- Skill pattern (router): compound-engineering `create-agent-skills/SKILL.md`
- Hook pattern: `plugins/security/hooks/hooks.json`, `plugins/security/scripts/block-sensitive-files.js`
- Agent pattern: `plugins/experts/agents/architect.md`
- Marketplace registry: `.claude-plugin/marketplace.json`

### External References

- [Claude Code Skills](https://code.claude.com/docs/en/skills) — official skill spec
- [Claude Code Hooks](https://code.claude.com/docs/en/hooks) — official hooks spec (25+ events)
- [Claude Code Subagents](https://code.claude.com/docs/en/sub-agents) — official agent spec
- [Claude Code Memory](https://code.claude.com/docs/en/memory) — CLAUDE.md + rules spec
- [Claude Code Settings](https://code.claude.com/docs/en/settings) — settings.json schema
- [Claude Code Plugins](https://code.claude.com/docs/en/plugins-reference) — plugin spec
