# Motion design principles (cheat sheet)

## Durations

| Movement | Duration |
|---|---|
| Micro (icon, bullet, pop) | 200–400 ms |
| Text / card entrance | 500–900 ms |
| Scene transition | 600–1200 ms |
| Title hold | reading time + 0.5 s (≈ 3 words/s) |
| Stagger between sibling elements | 30–80 ms (letters 25–45 ms) |

## Easings (tokens)

```css
--out-expo:   cubic-bezier(0.16, 1, 0.3, 1);     /* entrances: fast, then settles */
--in-out:     cubic-bezier(0.65, 0, 0.35, 1);    /* moves from point A to B */
--in-expo:    cubic-bezier(0.7, 0, 0.84, 0);     /* exits: accelerates and disappears */
--back-out:   cubic-bezier(0.34, 1.56, 0.64, 1); /* slight overshoot */
/* damped spring, through linear() (Chrome 113+) */
--spring: linear(0, 0.009, 0.035 2.1%, 0.141, 0.281 6.7%, 0.723 12.9%, 0.938 16.7%, 1.017, 1.077, 1.121,
  1.149 24.3%, 1.159, 1.163, 1.161, 1.154 29.9%, 1.129 32.8%, 1.051 39.6%, 1.017 43.1%, 0.991, 0.977 51%,
  0.974 53.8%, 0.975 57.1%, 0.997 69.8%, 1.003 76.9%, 1);
```
Spring in JS (closed form, for Canvas / `__seek`):
```js
const spring = (t, { k = 170, c = 26, m = 1 } = {}) => {        // t in s → 0..~1
  const w0 = Math.sqrt(k / m), z = c / (2 * Math.sqrt(k * m));
  if (z < 1) { const wd = w0 * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t)); }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
};
```

## The 12 principles, screen version
- **Anticipation**: a small pull-back (−4 %) before a big movement.
- **Follow-through / overlap**: children arrive after the parent (stagger), nothing stops dead.
- **Arcs**: combine X and Y translations with different easings for curved paths.
- **Squash & stretch**, light, on pops (scale 1.08 → 1).
- **Staging**: a single focal point; tone down (opacity .4, blur) whatever is not speaking.
- **Parallax**: 2–3 planes at different speeds give depth cheaply.

## Narrative structure (10–30 s)
1. **Hook** (0–1.5 s): strong movement or question.
2. **Reveal**: logo / title / product.
3. **Proof**: 2–4 points (cards, counting numbers, animated UI).
4. **Call to action**: tagline + URL, held ≥ 2 s.
5. **Exit**: 0.4–0.8 s fade or a cut on the beat.

## Formats

| Use | Size | fps | Note |
|---|---|---|---|
| YouTube / presentation | 1920×1080 | 60 (UI) / 30 (soft) | 16:9 |
| Reels / TikTok / Shorts | 1080×1920 | 30 | 10 % top/bottom safe area |
| LinkedIn / Instagram feed | 1080×1080 or 1080×1350 | 30 | burned-in subtitles |
| README / docs | ≤ 960 px wide | 20–30 | GIF (`-o x.gif`) or muted looping MP4 |

## Video typography (1080p)
- Title 96–160 px, subtitle 40–56 px, body ≥ 28 px; negative letter-spacing on titles (-0.02 to -0.04em).
- Contrast ≥ 7:1 on animated backgrounds; soft shadow rather than outline.
- At most ~7 words per screen.

## Color & rendering
- Slightly tinted dark background (#0b0d12) rather than pure black; 1 accent color + 1–2 secondary ones.
- Halo/glow: `radial-gradient` or `globalCompositeOperation = 'lighter'` on Canvas.
- Subtle vignette to center the eye.
- Motion blur (`--motion-blur 4`) on any fast movement: it is what makes it look like "video" and not
  "web page".

## Camera in a 3D scene

- **A subject following a winding path** (switchbacks, a spiral): do not chase it — the camera swings 180° at
  every hairpin and the picture becomes unreadable. Frame each stop with a fixed shot, and move between two
  shots in a straight line (lift it with a small arc if the line grazes the ground).
- **A decorative element earns its place with a shot designed for it.** Placed "somewhere in the scene", it ends
  up hidden by the fog, the banks or the foreground (Kaizen: a mirror pond moved four times, never readable).
  Decide the shot first, then put the element in it.
- **Keep the camera's corridors clear**: when placing decor procedurally (trees, rocks), exclude the volume the
  camera flies through, or a branch will cross the lens.
- **Contact sheet before full render**: `--stills … --sheet` assembles the stills in one image to review a whole
  storyboard at a glance.

