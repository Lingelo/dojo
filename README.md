# Dojo

A Claude Code plugin marketplace, providing an AI-assisted SDLC (Kaizen, converging on Addy Osmani's Agent Skills, also shipped here), motion design as code (Motion Studio), presentation decks as HTML (Slide Studio) and a guarded knowledge vault (Kioku).

## Available plugins

| Plugin | Description | Components |
|---|---|---|
| [**kaizen**](plugins/kaizen/README.md) | The engine around Addy Osmani's agent-skills: agent-skills' commands under the `/kaizen:` prefix (`spec` → `plan` → `build` → `test` → `review` → `ship`), and what they do not do — a quality gate that keeps a turn open while checks are red, the review recorded by itself and required before any push, no secret committed, learnings brought back when a spec, a plan or a file they cover is touched, the PR followed to "looks ready" (`/kaizen:watch`), DORA approximations, friction and the cost of each feature or fix (`/kaizen:metrics`) | 4 skills, 9 aliased commands, 8 hook registrations, zero-dependency CLI |
| [**agent-skills**](plugins/agent-skills/README.md) | [Addy Osmani's agent-skills](https://github.com/addyosmani/agent-skills) (MIT), copied unmodified: engineering workflows for AI coding agents from spec to ship (`/spec`, `/plan`, `/build`, `/test`, `/review`, `/ship`…), with rationalization tables and verification gates in every skill. The base Kaizen runs on (its commands are also `/kaizen:<name>`); proposed here by pull request at each upstream change, never edited in this repository | Skills, commands, reviewer personas |
| [**motion-studio**](plugins/motion-studio/README.md) | Motion design as code: HTML/CSS/SVG/Canvas → MP4/WebM/GIF frame by frame, synced sound, voice-over and subtitles (Playwright + ffmpeg) | Skill, scripts |
| [**kioku**](plugins/kioku/README.md) | A guarded knowledge vault on the LLM Wiki pattern: you drop raw sources, Claude maintains a structured wiki. Silos (work, personal…) sealed from each other by a hook, bronze → silver → gold medallion, a gate (deterministic checks + independent reviewer) before any page enters the wiki; `/kioku:setup` creates the vault in an empty folder, `npm run <silo>` opens a session. Developed in [its own repository](https://github.com/Lingelo/kioku), copied here hourly; the vault is your own private repository | Skills, reviewer agent, guard and gate hooks, CLI, local dashboard |
| [**slide-studio**](plugins/slide-studio/README.md) | Presentation decks as one HTML file: 19 layouts, 3 themes (`ink`, `paper`, `kaizen`) + brand tokens, presenter mode (steps, notes, overview), every slide audited in headless Chromium (overflow, collisions, contrast, density), export to PDF/PNG/contact sheet | Skill, scripts |

Everything is in English. Claude still answers in the language you write in.

## Installation

### 1. Add the marketplace

```bash
/plugin marketplace add Lingelo/dojo
```

Or interactively:
```bash
/plugin
# Go to the "Marketplaces" tab > "Add marketplace"
# Enter Lingelo/dojo
```

> **Installed under the marketplace's previous name?** Remove it (`/plugin marketplace remove <old name>`),
> add `Lingelo/dojo`, reinstall the plugins, and use `@dojo` in `enabledPlugins` / `extraKnownMarketplaces`.

### 2. Install the plugins

**Interactive (recommended):**
```bash
/plugin
# Go to the "Discover" tab and select the plugins to install
```

**Direct installation:**
```bash
/plugin install motion-studio@dojo
/plugin install kaizen@dojo
/plugin install agent-skills@dojo    # Addy Osmani's workflows: Kaizen runs on them
/plugin install slide-studio@dojo
/plugin install kioku@dojo           # user scope: kioku vaults enable it themselves
```

## Team configuration

Add to your project's `.claude/settings.json` to configure every team member automatically:

```json
{
  "extraKnownMarketplaces": {
    "dojo": {
      "source": {
        "source": "github",
        "repo": "Lingelo/dojo"
      }
    }
  },
  "enabledPlugins": {
    "kaizen@dojo": true,
    "agent-skills@dojo": true,
    "motion-studio@dojo": true,
    "slide-studio@dojo": true
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

<a href="media/kaizen/kaizen-presentation.mp4"><img src="media/kaizen/kaizen-presentation.jpg" alt="Kaizen presented in 80 seconds" width="100%"></a>

![The Kaizen loop](plugins/kaizen/docs/media/diagrams/kaizen-loop.svg)

```bash
/kaizen:setup                                   # config, verification commands, guard rails; then where you stand
/kaizen:spec orders CSV export                  # WHAT to build → SPEC.md (agent-skills); matching learnings come back
/kaizen:plan                                    # HOW → tasks/plan.md, tasks/todo.md
/kaizen:build auto                              # test first, task by task; the quality gate holds red turns
/kaizen:review                                  # five-axis review, recorded: the push is allowed
/kaizen:ship                                    # go/no-go, then push and open the PR
/kaizen:watch                                   # review comments, CI, branch — until "looks ready"; you merge
/kaizen:learn                                   # the lesson, brought back by the next spec, plan or edit
/kaizen:metrics                                 # are we improving, and at what cost
```

Documentation: [getting started](plugins/kaizen/docs/getting-started.md) ·
[guides](plugins/kaizen/docs/README.md) ·
[configuration](plugins/kaizen/docs/reference/configuration.md) ·
[troubleshooting](plugins/kaizen/docs/troubleshooting.md) ·
[how it works](plugins/kaizen/docs/README.md#how-it-works) ·
[CLI reference](plugins/kaizen/docs/reference/cli.md).

### Motion Studio
```bash
/motion-video 8-second 16:9 teaser for our API launch, dark style, orange accent
```
Storyboard → HTML/CSS/SVG/Canvas composition → control stills → frame-by-frame MP4 render (virtual
clock, motion blur, supersampling) with synced sound effects, music, voice-over and subtitles.
Dependencies (Playwright, Chromium, ffmpeg) installed automatically on first use.

### Slide Studio
```bash
/slides 10-minute talk for the team offsite on our move to smaller pull requests, paper theme
```
Brief → storyline (one assertion title per slide, a layout per message) → deck scaffolded from the
themed template → every slide audited at its real size (`slides.mjs check`) → contact sheet, PNGs and PDF.
The HTML file presents itself in any browser (← / →, `O` overview, `N` notes, `F` fullscreen).
Writing a deck needs nothing; Playwright and Chromium are installed automatically for check and export.

### Kioku
```bash
mkdir my-vault && cd my-vault && claude
/kioku:setup        # silos (e.g. work, personal), organizations registry, optional Plaud; then kioku init
/exit
npm run work        # a query session on the work silo, under the guard
```
The vault is your own private repository; the plugin creates its structure and keeps it current (`kioku upgrade`).
Install the `kioku` command for your terminal once per machine: `sh ~/.claude/plugins/cache/dojo/kioku/*/scripts/install.sh Lingelo/dojo`.
Documentation, threat model and limits: [Lingelo/kioku](https://github.com/Lingelo/kioku).

## Structure

```
dojo/
├── .claude-plugin/
│   └── marketplace.json      # Marketplace registry
├── .github/workflows/        # CI (kaizen.yml: Kaizen tests on Linux, macOS, Windows; slide-studio.yml: same for Slide Studio; sync-kioku.yml: copies kioku hourly; sync-agent-skills.yml: proposes agent-skills updates as pull requests)
├── docs/learnings/           # This repo's own learnings (Kaizen format)
├── plugins/
│   ├── kaizen/               # The engine around agent-skills: 4 skills, aliased commands, hooks, zero-dependency CLI
│   ├── agent-skills/         # Addy Osmani's agent-skills: a copy of addyosmani/agent-skills, proposed by pull request by .github/workflows/sync-agent-skills.yml
│   ├── motion-studio/        # Motion design videos from HTML (Playwright + ffmpeg)
│   ├── kioku/                # Guarded knowledge vault: a copy of Lingelo/kioku, synced by .github/workflows/sync-kioku.yml
│   └── slide-studio/         # Presentation decks as one HTML file, audited and exported (Playwright)
├── CLAUDE.md
└── README.md
```

## Contributing

1. Create a new plugin in `plugins/your-plugin/`
2. Add `.claude-plugin/plugin.json` with the metadata (`name`, `version`, `description`, `author`)
3. Add commands, agents, skills or hooks as needed
4. Register it in `.claude-plugin/marketplace.json`
5. Add a `README.md` documenting your plugin, in English

Test suites: `node --test plugins/kaizen/tests/*.test.mjs` (Kaizen) and
`node --test plugins/slide-studio/tests/*.test.mjs` (Slide Studio).

## License

MIT
