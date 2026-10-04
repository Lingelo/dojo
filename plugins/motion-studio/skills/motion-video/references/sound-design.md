# Synced sound

Two directions, which can be combined. In both cases the sync is **sample-accurate**: cues are
timestamped with the renderer's virtual time, then mixed in JS (48 kHz) and normalized to −14 LUFS.

## 1. Sound follows picture (sound effects)

### Declarative: `data-sfx` on an animated element
The sound fires **when the element's animation starts** (birth + `animation-delay` / WAAPI `delay`).
```html
<h1 class="title" data-sfx="whoosh" data-sfx-gain=".6">Title</h1>
<path class="logo" data-sfx="impact" …/>
<span data-sfx="tick?pitch=1.2" data-sfx-pan="auto">A</span>
```
| Attribute | Role |
|---|---|
| `data-sfx` | Synthesized sound (`pop`, `whoosh?dur=.8`…) or file (`sfx/click.wav`, relative to the composition) |
| `data-sfx-on` | Name(s) of the triggering animation(s) (`rise,leave`); default = the element's first animation |
| `data-sfx-gain` | Volume 0..1+ |
| `data-sfx-pan` | −1 (left) … 1 (right), or `auto` = horizontal position of the element |
| `data-sfx-offset` | Offset in s (e.g. `-0.05` to anticipate an impact) |

### Imperative: `window.__sfx(src, { at, gain, pan, align, id })`
```js
__sfx('riser?dur=2', { at: 2.1, align: 'end' });   // ENDS at 2.1 s (rise toward the impact)
__sfx('glitch', { gain: .4 });                       // now (current virtual time)
```
Idempotent (key `src@at` or `id`): it can be called from `__seek` or a rAF on every frame.
Use `window.__sfx?.(…)` so the page stays playable in a normal browser.

### Tracks: `<audio src="voice.mp3" data-start="1.5" data-volume=".9">`
Mixed from `data-start` (voice-over, jingle). Never `autoplay`.

## 2. Picture follows sound (music)

`--audio music.mp3` mixes the track **and** analyzes it (tempo, beats, onsets, energy), then injects
`window.__audio` before the page's scripts:

| API | Returns |
|---|---|
| `__audio.bpm`, `.beats[]`, `.onsets[]` | Tempo, time grid (s), detected attacks (s) |
| `__audio.level(t)` / `.bass(t)` | Overall / bass energy 0..1 at time t (100 Hz, interpolated) |
| `__audio.beat(t)` | `{ index, since, phase 0..1, pulse }` — `pulse` = 1 on the beat, decays fast |
| `__audio.nextBeat(t)` | First beat ≥ t (align an entrance on the music) |

```js
const a = window.__audio;
setTimeout(showCards, (a ? a.nextBeat(3.6) : 3.6) * 1000);          // entrance aligned on a beat
el.style.scale = 1 + 0.05 * (a ? a.beat(t).pulse : 0);               // pulse on the beat
glow = base * (1 + a.bass(t));                                         // halo breathing with the bass
```
Analysis accuracy: ±10 ms on rhythmic music. For an exact grid: `--beats beats.json`
(`{ "bpm": 120, "beats": [...] }`, produced by `sfx.mjs bed` or typed by hand).

## Library of synthesized sounds (`scripts/sfx.mjs`)

`node sfx.mjs list` — all generated in code, deterministic, license-free:
`pop` · `tick` · `click` · `whoosh` · `swoosh` · `riser` · `impact` · `chime` · `glitch` · `kick` · `hat` · `pad`.
Parameters as a query string: `whoosh?dur=1.2&from=200&to=3000`, `tick?pitch=1.3`, `chime?note=76`.

Background music on a tempo grid (pad + kick + hat + bass, i–VI–III–VII):
```bash
node sfx.mjs bed --bpm 120 --duration 8 --start 2.1 -o bed.wav > bed.json   # drums come in at 2.1 s
```

## Sound grammar (what works)

| Visual event | Sound | Tip |
|---|---|---|
| Logo / title reveal | `riser` (align end) → `impact` | The riser ends *exactly* on the impact |
| Element crossing / transition | `whoosh` (duration ≈ movement) | Start 50–100 ms before the movement |
| Cards, icons appearing | `pop` with rising pitch | Stagger on the eighth notes (`60/bpm/2`) |
| Letters, counters | `tick` gain .3, rising pitch, pan auto | Low volume, otherwise machine-gun |
| Tagline / CTA / success | `chime` | On a strong beat of the music |
| Error, break | `glitch` | With a 2–4-frame visual glitch |

- Mix the sound effects **under** the music (gain .3–.7); the impact alone can be at 1.
- No more than 2–3 simultaneous sounds; let it breathe between two actions.
- Put entrances on the strong beats (beat 1 of the bar); details on the eighth notes.
