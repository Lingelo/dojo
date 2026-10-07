# Layouts — structure and limits

Every slide: `<section class="slide" data-layout="NAME">…<aside class="notes">…</aside></section>`.
The children below are what the layout styles; optional ones are marked `?`. `slides.mjs new --layouts`
copies the sample of each layout from `assets/deck.html`, the reference for the exact markup.

Shared pieces, usable in any layout: `p.kicker` (small uppercase label above a title), `p.lead`
(subtitle), `.muted`, `.small`, `.source` (citation under data), `.tag`, `<mark>` (accent highlight),
plain `ul`/`ol` (accent bullets / numbers, one nested level), `figure.media` (img / video / svg / canvas,
`object-fit: cover`; `.contain` to fit, `figcaption` overlaid), `.placeholder` (to replace: `check` warns).

## The 19 layouts

| Layout | Use it for | Structure | Limits |
|---|---|---|---|
| `title` | Cover | `.kicker?` `h1` `.lead?` `.meta?` (spans, `strong`) `img.logo?` | title ≤ 8 words |
| `agenda` | Chapters | `.kicker?` `h2` `ol.agenda > li` (text + `small?`); `li.is-current` | ≤ 8 items (2 columns past 5) |
| `section` | Chapter divider | `p.num` `h2` `.lead?` — try `data-bg="accent"` | 1 line of lead |
| `statement` | One strong idea | `p.statement` (with `<mark>`) | ≤ 15 words |
| `bullets` | A short list | `.kicker?` `h2` `.lead?` `ul`/`ol` (`li.step` to reveal) | 3–6 bullets, ≤ 12 words each |
| `split` | Text + visual | `div.text` (kicker, h2, p, ul) + `figure.media` (`.bleed` = edge to edge) | ≤ 40 words of text |
| `split-reverse` | Same, visual first | same, the media goes left | idem |
| `cards` | 2–4 parallel items | `.kicker?` `h2` `div.cards > div.card` (`p.tag`, `h3`, `p`); `.card.is-highlight` | 2–4 cards, ≤ 20 words each |
| `columns` | Same, lighter | `div.columns > div.col` (`h3`, `p`) | 2–4 columns |
| `big-number` | One figure | `.kicker?` `p.stat` (`<small>` for the unit) `div.text` (`h2`, `p`, `p.source`) | ≤ 5 characters in the figure |
| `kpis` | A scorecard | `.kicker?` `h2` `div.kpis > div.kpi` (`p.value` + `<small>` unit, `p.label`, `p.delta.up/.down.good/.bad`) | 2–4 metrics, ≤ 4 digits each |
| `chart` | A trend, a ranking | `.kicker?` `h2` `div.chart` (`ul.bars > li[style="--v:0.4"]` = label span, `span.bar`, `b` value; or an inline `svg`) `+ p.source?` `div.text?` | ≤ 8 bars; one `li.is-highlight` |
| `timeline` | A sequence, a roadmap | `.kicker?` `h2` `ol.timeline > li` (`time`, `h3`, `p`); `.is-done`, `.is-current` | 3–6 milestones |
| `comparison` | Before/after, A vs B | `.kicker?` `h2` `div.compare` = `div.side` + `div.vs` + `div.side.is-highlight` (each: `p.tag`, `h3?`, `ul`) | ≤ 5 bullets per side |
| `code` | A listing | `.kicker?` `h2` `pre > code` + `div.text?`; spans `.c` `.k` `.s` `.n`, `<mark>` = highlighted line | ≤ 14 lines, ≤ 60 columns (≤ 90 without `.text`) |
| `quote` | Testimonial | `blockquote` `p.cite` (`strong` name · role) | ≤ 25 words, attributed |
| `image` | Mood, proof, product | `figure.media` (first) + `.kicker?` `h2` `.lead?` on a dark scrim | caption ≤ 10 words |
| `closing` | Thanks, call to action | `h1` `.lead?` `a.cta?` `div.contact > span` (`strong` + text) | — |
| `blank` | Free canvas | anything, absolutely positioned (`style="position:absolute; left:…"`) | stay in the safe area |

`--v` on a bar is its length from 0 to 1 (value ÷ the largest value). `split` / `split-reverse` take
`style="--left: 3fr; --right: 2fr"` to change the ratio.

## Modifiers (any slide)

| Attribute / class | Effect |
|---|---|
| `data-bg="accent"` | Accent background, text in `--accent-ink` (section, statement, closing) |
| `data-bg="inverse"` | Ink and background swapped (a dark slide in a light deck) |
| `data-bg="surface"` | Slightly raised background |
| `data-align="center"` | Centered text and blocks (statement, quote, closing) |
| `data-chrome="off"` / `"on"` | Hide / force the footer (deck name · n / total). Off by default on title, section, statement, image, closing |
| `class="step"` on an element | Revealed on the next key press when presenting; always visible in exports |
| `data-check="off"` on an element | Excluded from `slides.mjs check` (decorative text placed on purpose outside the safe area) |
| `<aside class="notes">` | Speaker notes (key `N`), never on the slide |
| `<html data-footer="…">` | Footer text (default: `<title>`) |

## Themes and brand

`<html data-theme="ink|paper|slate|neon">`. Tokens: `--bg --surface --line --ink --muted --accent
--accent-ink --good --bad`, fonts `--font-display --font-body --font-mono`, type scale `--fs-hero` …
`--fs-micro`, safe area `--pad-x --pad-y`, `--radius`. Override them in the **BRAND** block
(`html[data-theme] { … }`), never per slide. A custom font: add its `<link>` (Google Fonts) or an
`@font-face` with a local file next to the deck, then set `--font-display` / `--font-body`.
`--accent-ink` is the text color on the accent: check its contrast (`slides.mjs check` measures it).

## Other formats

4:3: `--slide-w: 1440px` in `:root` and `@page { size: 1440px 1080px }`; layouts keep working, but keep
to 3 cards / KPIs per row. Square 1080×1080 for social posts: `--slide-w: 1080px; --slide-h: 1080px;
--pad-x: 88px`, then `export --png`.
