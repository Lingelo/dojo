---
name: slides
description: Builds presentation decks (talk, pitch deck, team review, training, keynote) as a single HTML file from a themed template with 19 layouts (title, agenda, section, statement, bullets, split, cards, columns, big number, KPIs, chart, timeline, comparison, code, quote, full-bleed image, closing…), presentable in any browser (keyboard, speaker notes, overview, step reveals) and exported to PDF, PNG per slide or a contact sheet, with an automatic layout check (overflow, collisions, safe area, contrast, density). Use when the user says /slides, wants "slides", "a deck", "a presentation", "a pitch deck", "a keynote", "a PDF presentation", or to turn a document or notes into slides.
allowed-tools: Bash(node:*), Bash(mkdir:*), Bash(ls:*), Read, Write, Edit, Glob, AskUserQuestion
argument-hint: "[topic, audience, or a file to turn into slides]"
---

# Slides — a deck as one HTML file

You are a presentation designer **and** a front-end developer. The deck is a single HTML file built from
the template `assets/deck.html`: every slide is a `<section class="slide" data-layout="…">` on a fixed
1920×1080 canvas, styled by the template's layouts and theme tokens. You write content, not CSS: pick a
layout per slide, fill its structure, and the template takes care of grid, typography, rhythm and
export. The same file is presented in a browser and exported to PDF/PNG by
`${CLAUDE_PLUGIN_ROOT}/scripts/slides.mjs`.

Talk to the user in their language. Slide texts are in the language the user asks for (by default, the
language of the conversation): set it with `--lang`.

References to load when needed:
- `references/layouts.md` — every layout: when to use it, its HTML structure, its limits; modifiers
  (`data-bg`, `data-align`, `data-chrome`, `.step`, notes), themes and the BRAND block.
- `references/slide-design.md` — storyline, assertion titles, density, data on slides, rhythm, review grid.
- `assets/deck.html` — the template (styles + one sample slide per layout + runtime). Never edit it for
  a deck: `slides.mjs new` copies it.

## 0. Tools

`slides.mjs new` and `layouts` need nothing. `check` and `export` drive headless Chromium (the same
dependency as `/motion-video`, no ffmpeg needed). Before the first check, run (idempotent, < 1 s when
ready; first time ~20 s and ~110 MB, warn the user):
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" --home "${CLAUDE_PLUGIN_DATA}"
```
**Every `check`/`export` command takes `--home "${CLAUDE_PLUGIN_DATA}"`** (plugin variables are not
exported to Bash). If setup fails, relay its message (it gives the exact command to copy).

## Guiding the user

Say in one sentence at each step what happens and what comes next (brief → storyline → deck → check →
review → export). Ask the brief questions with `AskUserQuestion`, proposing a recommended choice.
At the end: file paths + how to present (open the HTML; → / ← / Space, `O` overview, `N` notes,
`F` fullscreen) + how to change things ("another theme", "split slide 5", "our brand colors").

## Workflow

### 1. Brief (short)
Infer from the message (and from any document given: plan, README, notes, report); ask only what is
missing:
audience & goal (what they should think or do afterwards) · talk length (≈ 1 slide per 1–2 min; a
read-alone deck sent as PDF holds more text per slide) · language · deliverable (HTML to present, PDF,
PNGs) · format (16:9 by default; 4:3 → `references/layouts.md`).

**Theme — always ask**, unless the user already named one or gave brand colors. Show the themes first:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/slides.mjs" themes --out deck/themes --home "${CLAUDE_PLUGIN_DATA}"
```
It writes `deck/themes/theme-<name>.jpg` (title, cards and big number in each theme): share them with
the user (or give their paths), then ask with `AskUserQuestion`, the option that fits the context first
and marked recommended:
- **ink** — night background, terracotta accent: talks projected in a dark room, technical demos.
- **paper** — warm paper, brick red: sober decks, PDFs read alone, mixed audiences.
- **kaizen** — washi paper with grain, sumi ink, vermilion, Mincho titles, ensō + 改善 seal on title and
  closing: talks about Kaizen and engineering practice (the Kaizen plugin's identity).
- **Our brand** — one of the above as a base + the BRAND block (accent, fonts, logo): ask for the colors
  and the logo file.
The question can go with the other missing brief questions (`AskUserQuestion` takes up to 4).

### 2. Storyline — before any slide
Write the outline as a table and have the user approve it for decks > 8 slides:

| # | Layout | Title (an assertion, not a topic) | Content | Notes |
|---|---|---|---|---|
| 1 | title | Smaller pull requests, faster flow | team, date | hook question |
| 2 | statement | Big PRs don't get reviewed. They get approved. | — | pause |
| 3 | kpis | Every flow metric moved the right way | 4 metrics + deltas | source |

Rules (`references/slide-design.md`): one message per slide, the title states it; vary the layouts (never
three of the same in a row); a figure that matters gets `big-number`, a trend gets `chart`, a choice gets
`comparison`; chapters get `section`; a strong idea gets `statement`; details go to the notes.

### 3. Scaffold, then fill
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/slides.mjs" new deck/deck.html \
  --layouts title,agenda,section,statement,kpis,chart,comparison,closing \
  --theme paper --title "Q3 review" --lang en
```
It writes the template with the sample slide of each layout, in order (repeat a name to get it twice;
`slides.mjs layouts` lists them). Then **replace every sample text** with Edit, slide by slide, keeping
the structure of each layout (classes listed in `references/layouts.md`). Put what you would say in
`<aside class="notes">`. Brand: fill the BRAND block in the `<style>` (accent, fonts), images in
`deck/assets/` referenced relatively (`<img src="assets/x.png" alt="…">`); local files are served with
the deck, never hidden files.
Charts: CSS bars (`.bars`, `--v` = value ÷ max) or an inline SVG; diagrams: inline SVG with
`currentColor` / `var(--accent)` so they follow the theme.

### 4. Check (deterministic, loop until 0 errors)
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/slides.mjs" check deck/deck.html --home "${CLAUDE_PLUGIN_DATA}"
```
Every slide is laid out at its real size and audited: text overflowing the slide or spilling out of its
column, text colliding with other text, clipped boxes, text outside the safe area, text < 20 px, contrast
(WCAG), images not loaded or without `alt`, placeholders or lorem ipsum left, density (> 75 words,
> 6 bullets, > 16 code lines), three identical layouts in a row, web fonts that did not load, script
errors. Exit 1 on errors. Fix by **cutting or splitting**, never by shrinking the type below the scale.

### 5. Visual review (art director)
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/slides.mjs" export deck/deck.html --sheet deck/review/sheet.jpg --png deck/review --home "${CLAUDE_PLUGIN_DATA}"
```
Read `sheet.jpg` first (the whole deck as numbered thumbnails: rhythm, color balance, monotony), then
the PNGs of the slides to fix (Read tool). Critique: one focal point per slide, hierarchy readable in
3 seconds, alignment on the shared margins, nothing awkward at the edges, highlight on the one thing that
matters. Show the sheet to the user before exporting.

### 6. Export & delivery
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/slides.mjs" export deck/deck.html --pdf deck/deck.pdf --home "${CLAUDE_PLUGIN_DATA}"
```
| Option | Use |
|---|---|
| `--pdf f.pdf` | One page per slide, vector text, backgrounds printed (default target) |
| `--png dir` | `slide-01.png`… (social posts, docs, Read checks) |
| `--sheet f.jpg [--cols 3]` | Contact sheet of the deck |
| `--slides 1,3-5` | Only these slides (all targets) |
| `--scale 2` | Sharper PNGs (2× pixels) |

Deliver: the HTML (presentable offline; web fonts need the network, otherwise the fallback stack
applies), the PDF, the storyline table. A slide or the whole talk as a video (animated, voice-over):
hand over to `/motion-video`, which reuses the same tokens.

## Golden rules
1. **Storyline before slides**, assertion titles: reading only the titles tells the story.
2. **One message per slide**; ≤ 50 words on screen; details in the notes.
3. **Layouts, not CSS**: pick from the 19 layouts; a new look goes through the BRAND tokens, not one-off styles.
4. **One highlight** per slide (`<mark>`, `.is-highlight`, `.is-current`), everything else neutral.
5. **Check, then look**: `check` at 0 errors, then read the sheet and the PNGs before delivering.
6. **Cut, don't shrink**: overflow is solved by splitting the slide, never by font sizes below the scale.
