# Slide Studio plugin

Presentation decks for Claude Code, as **one HTML file**: Claude writes the storyline, picks a layout per
message from a themed template, fills the content, then **audits every slide at its real size** in
headless Chromium and reads the result before delivering. The deck presents itself in any browser and
exports to PDF, PNG per slide or a contact sheet.

## Installation

```json
{
  "enabledPlugins": {
    "slide-studio@dojo": true
  }
}
```

### Dependencies: automatic

Writing a deck needs nothing. `check` and `export` need **Node ≥ 18 + npm** and a Chromium:
`scripts/setup.mjs` reuses what exists (the project's or global `playwright` / `playwright-core`,
Playwright's Chromium, installed Chrome or Edge) and installs **only what is missing** into
`${CLAUDE_PLUGIN_DATA}`: `playwright-core` (~10 MB) and Chrome Headless Shell (~100 MB, shared cache
`~/.cache/ms-playwright`). First run ~20 s, then < 1 s.

```bash
node plugins/slide-studio/scripts/setup.mjs            # install / repair
node plugins/slide-studio/scripts/setup.mjs --check    # diagnosis only
```

| Variable | Role |
|---|---|
| `SLIDE_STUDIO_HOME` | dependency folder (default `${CLAUDE_PLUGIN_DATA}`, or `--home`) |
| `SLIDE_STUDIO_NO_INSTALL=1` | never install automatically |
| `SLIDE_STUDIO_ISOLATED=1` | ignore system installations |
| `CHROMIUM_PATH` | browser to use |

Only case that cannot be automated: Linux without Chromium's system libraries →
`sudo npx playwright install-deps chromium` (setup says so).

## Skill

### /slides

```bash
/slides 10-minute talk for the team offsite on our move to smaller pull requests, paper theme
```

Presentation decks as **one HTML file** built from a themed template (`skills/slides/assets/deck.html`):
19 layouts (title, agenda, section, statement, bullets, split, split-reverse, cards, columns, big-number,
kpis, chart, timeline, comparison, code, quote, image, closing, blank), 3 themes (`ink`, `paper`
and `kaizen`: the Kaizen plugin's washi/sumi/vermilion identity with ensō and 改善 seal) plus a BRAND block for your colors and fonts. The file presents itself in any browser
(→ / ← / Space, step reveals, `O` overview, `N` speaker notes, `F` fullscreen, `#/5` deep links) and
exports to PDF, PNG per slide or a contact sheet.

Workflow: brief → **storyline** (one assertion title per slide, layout chosen per message) →
`slides.mjs new` scaffolds the deck with the sample slide of each chosen layout → Claude replaces the
content → **`slides.mjs check`** audits every slide at its real size → contact sheet + PNGs read by
Claude → PDF.

```bash
node plugins/slide-studio/scripts/slides.mjs layouts
node plugins/slide-studio/scripts/slides.mjs themes --out deck/themes     # one preview per theme, to choose
node plugins/slide-studio/scripts/slides.mjs new deck/deck.html --layouts title,agenda,kpis,chart,closing --theme paper --title "Q3 review"
node plugins/slide-studio/scripts/slides.mjs check deck/deck.html            # exit 1 on errors
node plugins/slide-studio/scripts/slides.mjs export deck/deck.html --pdf deck/deck.pdf --png deck/png --sheet deck/sheet.jpg [--slides 1,3-5] [--scale 2]
```

`check` lays the deck out in headless Chromium and reports, per slide: text overflowing the slide or
spilling out of its column, text running into other text, clipped boxes, text outside the safe area or
under 20 px, WCAG contrast, images not loaded or without `alt`, placeholders and sample text left,
density (words, bullets, code lines); and for the deck: three identical layouts in a row, web fonts
that did not load, script errors. `new` and `layouts` need no dependency; `check` and `export` reuse
Playwright + Chromium (see above). Layout catalog:
[`skills/slides/references/layouts.md`](skills/slides/references/layouts.md).

## Themes

| Theme | Look | For |
|---|---|---|
| `ink` | night background, terracotta accent, Inter | talks projected in a dark room, technical demos |
| `paper` | warm paper, brick red, Inter | sober decks, PDFs read alone, mixed audiences |
| `kaizen` | washi paper with grain, sumi ink, vermilion, Shippori Mincho titles, ensō + 改善 seal | talks about Kaizen and engineering practice (the identity of the [Kaizen plugin](../kaizen/README.md)) |

`slides.mjs themes --out dir` writes one preview per theme; the skill always shows them and asks which
one to use. A brand: any theme + the BRAND block of the template (accent, fonts, logo).

## Structure

```
slide-studio/
├── .claude-plugin/plugin.json
├── package.json                 # playwright-core, installed on demand into ${CLAUDE_PLUGIN_DATA}
├── skills/slides/
│   ├── SKILL.md
│   ├── references/              # layouts catalog, slide design
│   └── assets/deck.html         # deck template: themes, 19 layouts, presenter runtime
├── scripts/
│   ├── slides.mjs               # layouts, themes, new, check, export (PDF / PNG / sheet)
│   └── setup.mjs  deps.mjs      # self-sufficient dependency resolution
└── tests/                       # node --test plugins/slide-studio/tests/*.test.mjs
```

A deck to turn into a video (animated, voice-over): the [Motion Studio plugin](../motion-studio/README.md)
renders HTML pages frame by frame.
