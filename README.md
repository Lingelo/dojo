# Dojo

A Claude Code plugin marketplace, providing an AI-assisted SDLC (Kaizen), motion design as code (Motion Studio) and presentation decks as HTML (Slide Studio).

## Available plugins

| Plugin | Description | Components |
|---|---|---|
| [**kaizen**](plugins/kaizen/README.md) | AI-assisted SDLC (adapted from Compound Engineering): engineering constitution enforced as checks, brainstorm → plan (traceability, threats, rollback, PR-sized slices) → doc-review → work (quality gate) → multi-agent review → ship → watch-pr, UI polish, learnings/ADRs/postmortems read back every cycle, DORA metrics and cycle cost, release; review enforced by a hook before any push, watched deployment with rollback (`/kaizen:deploy`, `/kaizen:monitor`), lean/standard/full profiles, `/kaizen:help` to find your way | 23 skills, 21 agents, hooks (incl. secret scan before commit), CLI, Playwright MCP |
| [**motion-studio**](plugins/motion-studio/README.md) | Motion design as code: HTML/CSS/SVG/Canvas → MP4/WebM/GIF frame by frame, synced sound, voice-over and subtitles (Playwright + ffmpeg) | Skill, scripts |
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
/plugin install slide-studio@dojo
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
/kaizen:help                                    # what it is, where the repo stands, which command to run
/kaizen:setup audit                             # what the project lacks (CI, secrets, deployment…), fixed by priority
/kaizen:setup                                   # config, profile (by the repo's stakes), detected deployment
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

## Structure

```
dojo/
├── .claude-plugin/
│   └── marketplace.json      # Marketplace registry
├── .github/workflows/        # CI (kaizen.yml: Kaizen tests on Linux, macOS, Windows; slide-studio.yml: same for Slide Studio)
├── docs/                     # This repo's own brainstorms, plans and learnings
├── plugins/
│   ├── kaizen/               # AI-assisted SDLC: skills, agents, hooks, zero-dependency CLI
│   ├── motion-studio/        # Motion design videos from HTML (Playwright + ffmpeg)
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
