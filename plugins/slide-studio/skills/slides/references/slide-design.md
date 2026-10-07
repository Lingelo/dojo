# Slide design — what makes a deck work

## Storyline first
- **Start from the ending**: what should the audience think, decide or do afterwards? Every slide serves
  that sentence; a slide that does not is cut or moved to an appendix.
- **Structure**: situation → complication → resolution (problem → what we did → results → ask), or the
  pyramid (answer first, then the three reasons). A decision deck opens on the recommendation.
- **Assertion titles**: the title is the message ("Review time explodes past 1,000 lines"), not the
  topic ("Review time"). Reading only the titles must tell the whole story: check it in the storyline table.
- **Length**: ~1 slide per 1–2 minutes spoken. 10 minutes ≈ 6–10 slides. A deck read alone (sent as
  PDF) may carry fuller sentences, still one message per slide.

## Density
- ≤ 50 words on screen, 3–6 bullets of ≤ 12 words, no paragraph over 3 lines. What you would say goes
  in the notes.
- A slide that does not fit is **two slides**, never a smaller font. The type scale (body 36 px at
  1920 px wide) is set for a room; `check` warns below 20 px.
- One focal point: the eye must know where to land in under 3 seconds. One highlight per slide.

## Rhythm
- Alternate dense and airy slides: after two content slides, a `statement`, a `big-number`, a `quote`
  or an `image`. `check` warns on three identical layouts in a row.
- `section` slides (with `data-bg="accent"`) mark chapters in decks over ~12 slides; the `agenda` can
  come back with `li.is-current`.
- Progressive reveal (`.step`) for an argument built point by point, not for every list.

## Data on slides
- One chart = one message, written as the title. Highlight the bar or the point that carries it
  (`.is-highlight`), keep the rest neutral; label values directly, no legend when avoidable.
- Bars start at zero; `--v` = value ÷ max. Always a `.source` (who, when, scope).
- One number that matters → `big-number`; 2–4 indicators → `kpis` with the direction (`.up/.down`) and
  its meaning (`.good/.bad`: going down can be good).
- Rounded figures (3.4×, 47 min), units in `<small>`.

## Visuals
- Real images over clip art: product screenshots, photos, diagrams. A screenshot is cropped on the part
  that matters. Every `<img>` has an `alt`.
- Diagrams: inline SVG drawn with `currentColor` and `var(--accent)` so they follow the theme; ≤ 7 boxes.
- Full-bleed images (`image`, `.media.bleed`) bring air; the template puts a scrim under the caption.

## Code
- ≤ 14 lines, the part that matters; highlight the line being discussed with `<mark>`; elide the rest
  with a comment (`// …`). A long file belongs in a link, not a slide.

## Visual review grid (sheet and PNGs)
1. Titles alone tell the story; each states one message.
2. One focal point per slide, hierarchy readable in 3 s.
3. Same margins and title height across content slides; nothing awkward near the edges.
4. Color: the accent only on what matters; enough contrast (check passes).
5. Rhythm: no run of look-alike slides; chapters visible on the sheet.
6. Nothing left from the template: sample texts, placeholders, "Deck title" in the footer.
