# Playwright plugin

Bundled Playwright MCP server + AI agents for end-to-end tests: planning, generation and repair.

## Installation

```bash
/plugin install playwright@angelo-plugins
```

Prerequisite: Node.js with `npx` (the MCP server is downloaded on first use).

The plugin installs automatically:
- the Playwright MCP server (`@playwright/mcp`), which gives Claude a real browser (navigate, click,
  type, snapshot, screenshot, console, network);
- three specialized agents (planner, generator, healer).

## Agents

### Planner (green) — `playwright-test-planner`

Creates complete test plans by exploring web applications.

**Use when:** you need test scenarios for a web page or application.

```
"I need test scenarios for our checkout at https://mystore.com/checkout"
```

**Capabilities:**
- navigate and explore web interfaces;
- map user journeys and critical paths;
- design test scenarios (happy path, edge cases, error handling);
- produce a structured test plan document.

### Generator (blue) — `playwright-test-generator`

Creates robust, reliable Playwright test code.

**Use when:** you have a test plan and need the implementation.

```
"Write a test that logs into localhost:3000 as admin@test.com and checks the dashboard loads"
```

**Capabilities:**
- generate Playwright test files;
- simulate real user interactions, step by step in the browser;
- add the right assertions and validations;
- follow testing best practices.

### Healer (red) — `playwright-test-healer`

Debugs and fixes failing Playwright tests.

**Use when:** tests fail and need a diagnosis and a repair.

```
"user-registration.spec.ts is broken since the last changes"
```

**Capabilities:**
- run the tests and analyze the failures;
- identify root causes (selectors, timing, logic, data);
- apply fixes systematically;
- check that the repairs work.

All three agents run on the `sonnet` model.

## Bundled MCP server

The Playwright MCP server is configured automatically when the plugin is installed (`.mcp.json`):

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

The agents' test tools (`generator_setup_page`, `generator_write_test`, `test_run`, `test_debug`,
`test_list`…) come from Playwright Test's own MCP server (`playwright-test`), set up in a project by
`npx playwright init-agents --loop=claude`. Without it, the agents fall back to the browser tools of the
bundled server and to the project's test command.

## Used by

The [Kaizen](../kaizen/README.md) plugin uses Playwright in `/kaizen:polish`, `/kaizen:work` and
`/kaizen:autopilot` to see and verify the UI.

## Structure

```
playwright/
├── .claude-plugin/
│   └── plugin.json
├── .mcp.json              # Playwright MCP configuration
├── agents/
│   ├── playwright-test-planner.md
│   ├── playwright-test-generator.md
│   └── playwright-test-healer.md
└── README.md
```
