# Claude Code Marketplace

A plugin marketplace for Claude Code, providing development tools and workflows.

## Available plugins

| Plugin | Description | Components |
|---|---|---|
| [**kaizen**](plugins/kaizen/README.md) | AI-assisted SDLC (adapted from Compound Engineering): engineering constitution enforced as checks, brainstorm → plan (traceability, threats, rollback, PR-sized slices) → doc-review → work (quality gate) → multi-agent review → ship → watch-pr, UI polish, learnings/ADRs/postmortems read back every cycle, DORA metrics and cycle cost, release; review enforced by a hook before any push, watched deployment with rollback (`/kaizen:deploy`, `/kaizen:monitor`), lean/standard/full profiles, `/kaizen:help` to find your way | 23 skills, 21 agents, hooks, CLI |
| [**security**](plugins/security/README.md) | Blocks access to sensitive files + scans commits for secrets (~30 types) + circuit breaker utility | Hooks, utility |
| [**notifications-system**](plugins/notifications-system/README.md) | System sounds and OS notifications when Claude finishes or needs you | Hooks |
| [**git**](plugins/git/README.md) | Conventional commits with the Jira key from the branch + safe push (blocks main/master) | Skills |
| [**playwright**](plugins/playwright/README.md) | Playwright MCP + E2E test agents (planner, generator, healer) | MCP, agents |
| [**statusline**](plugins/statusline/README.md) | Statusline with cost, context, 5-hour window, burn rate and multi-plan support | Skill |
| [**experts**](plugins/experts/README.md) | Architect agent for deep code analysis and evolution proposals | Agent |
| [**frustration-detector**](plugins/frustration-detector/README.md) | Detects frustration (FR/EN) and adapts Claude's style (less talk, more action) | Hook |
| [**motion-studio**](plugins/motion-studio/README.md) | Motion design as code: HTML/CSS/SVG/Canvas → MP4/WebM/GIF frame by frame, synced sound, voice-over and subtitles (Playwright + ffmpeg) | Skill, scripts |

Everything is in English. Claude still answers in the language you write in.

## Installation

### 1. Add the marketplace

```bash
/plugin marketplace add <YOUR_GIT_URL>
```

Or interactively:
```bash
/plugin
# Go to the "Marketplaces" tab > "Add marketplace"
# Paste the URL of your git repository
```

### 2. Install the plugins

**Interactive (recommended):**
```bash
/plugin
# Go to the "Discover" tab and select the plugins to install
```

**Direct installation:**
```bash
/plugin install security@angelo-plugins
/plugin install notifications-system@angelo-plugins
/plugin install git@angelo-plugins
/plugin install playwright@angelo-plugins
/plugin install statusline@angelo-plugins
/plugin install experts@angelo-plugins
/plugin install frustration-detector@angelo-plugins
/plugin install motion-studio@angelo-plugins
/plugin install kaizen@angelo-plugins
```

## Team configuration

Add to your project's `.claude/settings.json` to configure every team member automatically:

```json
{
  "extraKnownMarketplaces": {
    "angelo-plugins": {
      "source": {
        "source": "git",
        "url": "<YOUR_GIT_URL>"
      }
    }
  },
  "enabledPlugins": {
    "security@angelo-plugins": true,
    "git@angelo-plugins": true
  }
}
```

## Managing plugins

| Command | Description |
|---|---|
| `/plugin` | Open the interactive plugin manager |
| `/plugin install name@marketplace` | Install a plugin |
| `/plugin uninstall name@marketplace` | Remove a plugin |
| `/plugin enable name@marketplace` | Enable a disabled plugin |
| `/plugin disable name@marketplace` | Disable without removing |
| `/plugin marketplace list` | List the registered marketplaces |
| `/plugin marketplace update` | Update the metadata |

## Usage examples

### Kaizen

<a href="plugins/kaizen/docs/media/kaizen-presentation.mp4"><img src="plugins/kaizen/docs/media/kaizen-presentation.jpg" alt="Kaizen presented in 80 seconds" width="100%"></a>

![The Kaizen loop](plugins/kaizen/docs/media/diagrams/kaizen-loop.svg)

```bash
/kaizen:help                                    # what it is, where the repo stands, which command to run
/kaizen:setup audit                             # what the project lacks (CI, secrets, deployment…), fixed by priority
/kaizen:setup                                   # config, profile (lean to start), detected deployment
/kaizen:constitution                            # the project's non-negotiable principles
/kaizen:brainstorm orders CSV export            # WHAT to build → docs/plans/…-plan.md
/kaizen:plan                                    # HOW → units, tests, rollback + plan review
/kaizen:work                                    # test first, quality gate, multi-agent review
/kaizen:ship                                    # reviewable PR, then /kaizen:watch-pr until "ready"
/kaizen:learn                                   # the learning, read back by the next plan
/kaizen:autopilot                               # or chain everything after the brainstorm
/kaizen:deploy production                       # approved, watched production release, rollback ready
```

Documentation: [getting started](plugins/kaizen/docs/getting-started.md) ·
[guides per skill](plugins/kaizen/docs/README.md) ·
[configuration](plugins/kaizen/docs/configuration.md) ·
[troubleshooting](plugins/kaizen/docs/troubleshooting.md) ·
[how it works](plugins/kaizen/docs/README.md#how-it-works) ·
[CLI reference](plugins/kaizen/docs/reference/cli.md).

### Security plugin
Two automatic protections through `PreToolUse` hooks:
- **Sensitive file blocking** — prevents access to `.env`, `credentials.json`, `.pem`, keys, cloud
  credentials, etc.
- **Secret scanner** — scans `git commit` for ~30 types of secrets (Anthropic, OpenAI, AWS, GitHub,
  GitLab, Slack, Stripe…) and blocks if API keys or tokens are found in the staged files; also blocks
  `git commit --no-verify`.

No command needed - it works automatically through hooks.

> **Security note**: this plugin uses **`PreToolUse` hooks** rather than `deny` rules in
> `settings.json`. Deny rules have [known bugs](https://github.com/anthropics/claude-code/issues/6699)
> where they are sometimes ignored. Hooks with exit code 2 guarantee reliable blocking.

### Git plugin
```bash
/commit
# Analyzes the changes and creates a conventional commit with the branch's Jira key

/push
# Pushes the commits (BLOCKED on main/master)
```

### Statusline
```bash
/statusline-setup
# Sets up the statusline with cost tracking and multi-plan support (Pro, Max5, Max20, pay-as-you-go)
```
Requires `jq` and optionally `ccusage`.

### Experts
```bash
# The agent triggers on architecture questions
Analyze the architecture of the orders module
How should I split this monolithic service?
What is the technical debt of this project?
```
Opus agent for deep analysis and evolution proposals (best with `ultrathink`).

### Playwright
The plugin includes a Playwright MCP server and 3 specialized agents for E2E tests:
- **Planner** — explores the application and designs the test scenarios
- **Generator** — generates the Playwright test code
- **Healer** — debugs and fixes failing tests

### Notifications system
A sound and an OS notification when Claude finishes a response (`Stop`) or asks for a permission
(`Notification`). macOS, Linux and Windows; configurable in `~/.claude/config/notifications.json`.

### Frustration Detector
Detects frustration in your prompts automatically and adapts Claude's style:
- **Anger** (`wtf`, `fuck`, `putain`…) → silent action mode, zero fluff
- **Impatience** (`just do it`, `finis`…) → code only, no explanation
- **Confusion** (`I'm stuck`, `ça marche pas`…) → brief diagnosis + immediate fix
- **Sarcasm** (`I'll use Cursor`, `merci pour rien`…) → immediate action, no apologies

Works in French and English (~200 detected terms). No command needed.

### Motion Studio
```bash
/motion-video 8-second 16:9 teaser for our API launch, dark style, orange accent
```
Storyboard → HTML/CSS/SVG/Canvas composition → control stills → frame-by-frame MP4 render (virtual
clock, motion blur, supersampling) with synced sound effects, music, voice-over and subtitles.
Dependencies (Playwright, Chromium, ffmpeg) installed automatically on first use.

## Structure

```
marketplace-claude-code/
├── .claude-plugin/
│   └── marketplace.json      # Marketplace registry
├── .github/workflows/        # CI (kaizen.yml: Kaizen tests on Linux, macOS, Windows)
├── docs/                     # This repo's own brainstorms, plans and learnings
├── plugins/
│   ├── kaizen/               # AI-assisted SDLC: skills, agents, hooks, zero-dependency CLI
│   ├── security/             # Sensitive file protection + secret scanner + circuit breaker
│   ├── notifications-system/ # System sound + OS notifications
│   ├── git/                  # Commits + safe push
│   ├── playwright/           # MCP + E2E test agents
│   ├── statusline/           # Custom statusline
│   ├── experts/              # Architect agent
│   ├── frustration-detector/ # Frustration detection + style adaptation
│   └── motion-studio/        # Motion design videos from HTML (Playwright + ffmpeg)
├── CLAUDE.md
└── README.md
```

## Contributing

1. Create a new plugin in `plugins/your-plugin/`
2. Add `.claude-plugin/plugin.json` with the metadata (`name`, `version`, `description`, `author`)
3. Add commands, agents, skills or hooks as needed
4. Register it in `.claude-plugin/marketplace.json`
5. Add a `README.md` documenting your plugin, in English

Kaizen has a test suite: `node --test plugins/kaizen/tests/*.test.mjs`.

## License

MIT
