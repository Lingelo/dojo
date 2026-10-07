# `/kaizen:tools`

> Pick **the right tool for a step** — MCP server, CLI or built-in — from what your repo and session
> really have, and use it well.

## At a glance

| | |
|---|---|
| **What it does** | Lists the MCP servers and CLIs you can reach (`node $K tools`), classifies your step into one intent, picks the tool (`node $K tools pick <intent>`) and says how to use it |
| **When to use it** | "Playwright MCP or a Playwright test?", "how do I read the Sentry error from here?", "which MCP servers do I have?", "why doesn't the browser open?" |
| **When not to use it** | You already know the tool: use it. Other skills read the same rules on their own |
| **What it produces** | An answer in the conversation. Nothing installed, approved or written |
| **What next** | The step itself, with the chosen tool |

## Examples

```text
/kaizen:tools                                   # what this repo can reach, and the warnings
/kaizen:tools ui-check                          # how to check a UI behavior durably
/kaizen:tools I need to see the error users get on checkout in production
/kaizen:tools check the admin page, it needs my login
```

## How the choice is made

Choosing a tool is a **decision**, not a piece of writing. Claude only classifies the step into one
intent of a fixed vocabulary; the CLI then picks deterministically from what is installed: ordered
preferences, the first available wins, `ask` when nothing fits.

| Intent | Typical pick |
|---|---|
| `see-page` | Playwright MCP server (snapshot before screenshot) |
| `ui-check` | a test in the repo's Playwright suite — the only form `verify` sees |
| `logged-in` | your own browser (Claude in Chrome); never credentials typed by Claude |
| `read-web` · `library-docs` | WebFetch · a docs server (Context7…) at the repo's version |
| `call-api` · `github` | `curl` · `node $K pr …` / `gh`, GitHub MCP as fallback |
| `ticket` · `observability` · `database` · `design` | the matching MCP server, read-only |

The whole table, the principles (deterministic first, cheapest tool that answers, writing is yours) and
how to drive the Playwright MCP server well: [`references/tool-choice.md`](../../references/tool-choice.md).

```bash
node $K tools                       # inventory: servers (scope, status, category), CLIs, warnings
node $K tools intents               # the vocabulary
node $K tools pick see-page --json  # pick, alternatives, missing, fallback
```

`tools` reads `.mcp.json`, `.claude/settings*.json` and `~/.claude.json` (or `$CLAUDE_CONFIG_DIR`),
plus the servers Kaizen ships. It never prints a server's environment, headers or URL credentials. It
does not see claude.ai connectors or other plugins' servers: the skill reconciles with the tools the
session actually loaded.

## Warnings

- **Unpinned server** (`npx pkg`, `@latest`, a Docker image without a tag): runs whatever is published
  when it starts. Pin an exact version.
- **Waiting for approval**: a project server in `.mcp.json` answers only once approved in `/mcp`.
- **Same name in several scopes**: only one is used.

## See also

[polish](polish.md) · [Troubleshooting — the browser does not open](../troubleshooting.md#the-browser-does-not-open-polish-ui-checks) · [Plugin README](../../README.md)
