# Experts plugin

A collection of specialized expert agents for in-depth analysis.

## Installation

```bash
/plugin install experts@angelo-plugins
```

## Components

| Type | Name | Description | Model |
|---|---|---|---|
| Agent | `architect` | In-depth architectural analysis and evolution proposals | Opus |

The agent is read-only in spirit (tools: `Glob`, `Grep`, `Read`, `Bash`): it analyzes and recommends, it
does not change your code. It answers in the language of your request.

## Usage

### With ultrathink (recommended for complex analyses)

For maximum depth, use the `ultrathink` keyword:

```
ultrathink Analyze the architecture of the orders module
ultrathink What is the technical debt of this project?
ultrathink How do we move toward a Clean Architecture?
```

> **Opus + ultrathink** = the best combination for complex architectural decisions

### Standard usage

The agent also triggers on architecture questions without ultrathink:

```
Analyze the architecture of the authentication module
How should I split this monolithic service?
Compare the approaches to implement caching
```

You can also call it explicitly: "use the architect agent to…".

## Capabilities

### Structure analysis
- Separation of concerns (SRP)
- Module cohesion and coupling
- God classes and oversized files
- Naming conventions
- Barrel files and re-exports

### Pattern detection
- Architecture patterns (Clean, Hexagonal, DDD, CQRS, Vertical Slice…)
- Anti-patterns (Big Ball of Mud, Spaghetti, Distributed Monolith…)
- Code smells (Long Method, Feature Envy, Shotgun Surgery…)
- DRY/SOLID/YAGNI violations

### Dependency analysis
- Import graph
- Circular dependencies
- Coupling to external libraries
- Contention points
- Outdated/vulnerable dependencies

### Technical debt assessment
- Legacy code
- Unresolved TODOs/FIXMEs
- Missing tests
- Outdated dependencies
- Dead code

### Performance analysis
- N+1 query detection
- Caching strategies
- Pagination
- DB indexes

### Evolution proposals
- Gradual refactoring strategies (Strangler Fig, Branch by Abstraction)
- Comparison of approaches with trade-offs
- Reversible migration plans

## Supported stacks

The agent is **stack-agnostic** and adapts to the detected stack:

| Stack | Analyzed specifics |
|---|---|
| **Node.js** (Hapi, Express, Fastify, NestJS) | Middleware, validation (Joi, Zod), async errors, transactions |
| **ORM** (Sequelize, Prisma, TypeORM, Mongoose) | Models, N+1, migrations, transactions, soft delete |
| **Vue/Nuxt** | Smart/dumb components, Pinia/Vuex, SSR, routing |
| **React/Next** | Components, hooks, Server Components, React Query |
| **PostgreSQL/MySQL** | Schema, indexes, normalization, JSON columns |
| **API design** | REST/GraphQL, versioning, auth, rate limiting |

## Output format

The agent produces a structured report:

1. **Context** - stack, scope, initial question
2. **Executive summary** - main findings in 3-5 sentences
3. **Strengths** - what is done well
4. **Weaknesses** - problems by severity (🔴 Critical, 🟠 Important, 🟡 Minor)
5. **Detailed analysis** - with real code excerpts and locations
6. **Recommendations** - quick wins, medium term, long term
7. **Trade-offs** - comparison table of the options
8. **Direct answer** - actionable summary

## Methodology

The agent follows a rigorous 3-phase methodology:

### Phase 1: Reconnaissance (required)
- Tech stack detection
- Project structure mapping
- Local conventions
- Business context

### Phase 2: In-depth analysis
- The relevant analysis grids
- Concrete examples from the code
- Every dimension explored

### Phase 3: Structured report
- Standard, navigable format
- Prioritized actions
- Documented trade-offs

## Examples

### Module analysis
```
ultrathink Analyze the architecture of the authentication module
and tell me how I could improve its testability
```

### Splitting a service
```
ultrathink I have a 2,000-line UserService,
how do I split it cleanly without breaking anything?
```

### Debt assessment
```
ultrathink Audit the technical debt of the src/legacy folder
with prioritized actions
```

### Comparing approaches
```
I need to implement a cache.
Compare Redis vs in-memory vs file-based for my context
```

### Architectural evolution
```
ultrathink How do I gradually migrate my monolithic API
to a hexagonal architecture?
```

## Tips

- **Use ultrathink** for important decisions - the extra tokens pay back in analysis quality
- **Be precise** in your question to get a targeted analysis
- **Mention the context** (constraints, deadline, team) for pragmatic recommendations
- The agent **never makes recommendations** without having read the code concerned
- To record the outcome as an ADR, pair it with [`/kaizen:decide`](../kaizen/docs/guides/decide.md)

## Sources

This plugin builds on the best practices of:
- [Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- [Extended Thinking Documentation](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)
- [ClaudeLog - UltraThink](https://claudelog.com/faqs/what-is-ultrathink/)
