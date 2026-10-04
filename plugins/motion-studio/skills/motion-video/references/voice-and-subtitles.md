# Voice-over and subtitles

Two independent building blocks, which can be combined with synced sound (`sound-design.md`):

| Need | Tool | Result |
|---|---|---|
| Have a text **read aloud** (voice-over) | `scripts/voice.mjs` | `narration.wav` + `voice.json` (real timeline) + `subs.srt/.vtt` |
| Burned-in **subtitles** | `render.mjs --voice voice.json` or `--subs file.srt` | text burned into the picture + `.srt/.vtt` next to the video |

## 1. Voice-over

Write the script (`video/narration.json`) — **one sentence per line**, short (timing within a line is
estimated):
```json
{ "lang": "en", "voice": "Samantha", "rate": 1, "gap": 0.35, "start": 0.4,
  "lines": [
    "Welcome to Motion Studio.",
    { "text": "Everything is written like a web page.", "pause": 0.6 },
    { "id": "cta", "text": "Try it.", "at": 9.5 },
    { "text": "Displayed text", "file": "my-voice.wav" }
  ] }
```
| Field | Role |
|---|---|
| `lang` | `en`, `fr`, `es`… (picks the default voice; default `en`) |
| `voice` | Engine voice name (`Samantha`, `Thomas`, `en`, SAPI name…) — optional |
| `rate` | Speed (1 = normal, 0.9 = measured); can be set per line |
| `gap` / `pause` | Silence after each line (default 0.35 s) / for one line |
| `start` | Start of the 1st line (default 0.4 s) |
| `at` | Absolute time of a line (e.g. to align on a scene) — warns on overlap |
| `file` | Existing recording (any voice / service) instead of synthesis; `text` is used for the subtitle |
| `caption` | Subtitle text if it differs from what is said (e.g. numbers, acronyms to spell out) |
| `engine` | Forced engine (`piper`, `say`…): pin it so that a published voice stays the same on every machine (`auto` picks `say` on a Mac) |

**Pronunciation**: a voice reads foreign words with its own language's rules (a French voice says
"brainstorm" as "brin-storm"). Rewrite *what is said* phonetically and keep the spelling in `caption`:
`{ "text": "The brane-storm defines…", "caption": "The brainstorm defines…" }`. Have the user listen to
3–4 variants (`say -v Samantha -o v1.aiff "…"`, or the final engine): the best spelling depends on the
engine.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/voice.mjs" engines                       # detected engines
node "${CLAUDE_PLUGIN_ROOT}/scripts/voice.mjs" video/narration.json -o video/voice --home "${CLAUDE_PLUGIN_DATA}"
```
Output: the **real** start/end of each line. **Build the storyboard on these times** (not the other way
around): the "logo" scene starts when the sentence "here is…" starts. Lines are cached (hash of text +
voice): running again is instant as long as the text does not change.
A plain text file (one line = one sentence) is also accepted instead of the JSON.

### Engines and guided installation

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/voice-setup.mjs" --lang en                 # status + recommendation
node "${CLAUDE_PLUGIN_ROOT}/scripts/voice-setup.mjs" install piper --lang en   # then edge | espeak
```
| Engine | Where | Quality | Prerequisites / installation |
|---|---|---|---|
| `say` | macOS | good (`Samantha`, `Thomas`, `Amelie`) | preinstalled |
| `sapi` | Windows | fair | preinstalled |
| `piper` | **local**, free, every OS | **very good** (neural) | Python ≥ 3.8; `install piper` creates a private venv, `pip install piper-tts`, downloads the voice (~60 MB: en, fr, es, de, it). No sudo. |
| `edge` | **online**, free, no key | very good (`en-US-AriaNeural`, `en-GB-RyanNeural`, `fr-FR-DeniseNeural`…) | Python ≥ 3.8; `install edge`. The **text goes to Microsoft**, unofficial service (may change). Never chosen by `auto`: `--engine edge` or `"engine": "edge"` in the script. |
| `espeak` | Linux | robotic, fallback | `sudo apt install espeak-ng` (the script does it by itself if root/passwordless sudo, otherwise it gives the command) |

`auto` choice (local engines only): piper > say > sapi > espeak. Force one with `--engine`. Python packages
live in `${CLAUDE_PLUGIN_DATA}/voice-venv`, Piper voices in `${CLAUDE_PLUGIN_DATA}/voices` (uninstalled
with the plugin). Another Piper voice: drop an `.onnx` (+ `.onnx.json`) in `voices/` or set
`PIPER_MODEL=/path/voice.onnx`. With `espeak` only, **warn** that the voice will be mechanical and propose
Piper. For a "studio" quality voice: the user provides a recording (`file` field).

## 2. Subtitles

```bash
# voice-over + subtitles (default style: bottom of the screen)
node "${CLAUDE_PLUGIN_ROOT}/scripts/render.mjs" video/intro.html --voice video/voice/voice.json -o video/intro.mp4
# karaoke (current word highlighted), plus a soft track, without voice-over
node "${CLAUDE_PLUGIN_ROOT}/scripts/render.mjs" video/intro.html --subs video/en.srt --captions karaoke --embed-subs -o video/intro.mp4
```
| Option | Role |
|---|---|
| `--voice voice.json` | Mixes the narration on top, **ducks the music** while it speaks (`--duck -9` dB, `off`), subtitles taken from `voice.json` |
| `--subs f.srt\|.vtt\|.json` | Subtitles from an external source (replaces those of `voice.json`). JSON: `[{ "start": 1, "end": 3, "text": "…" }]` |
| `--captions bottom\|karaoke\|center\|off` | Burned-in style; `off` = nothing burned in (the page draws its own subtitles) |
| `--embed-subs` | Also adds a soft track the player can turn on (mp4 `mov_text`, webm `webvtt`) |

Always produced next to the video: `<output>.srt` and `<output>.vtt` (re-timed with `--from/--to`).
The `.srt` files can be translated, then burned in again with `--subs`. No subtitles in a GIF.

Burn-in is driven by virtual time (0.12 s fade, no state); it inherits the `body` font and `--accent`
(CSS variable on `:root`) for the active word. Size ≈ 4.6 % of the height; in 9:16 it moves up to 17 %
from the bottom to avoid social media UI. Keep that area free in the composition. Adjust the cue length
with `"maxChars"` in the script (default 42; **24–28 in 9:16**).

### Subtitles drawn by the composition (`--captions off`, or in addition)

`window.__captions` is injected before the page when subtitles exist:

| API | Returns |
|---|---|
| `__captions.cues[]` | `{ start, end, text, words: [{ w, start, end }] }` |
| `__captions.at(t)` / `.word(t)` | active cue / word at t (or `null`) |
| `__captions.line(t)` | active **spoken** line (`{ id, text, start, end }`) — picture follows voice |
| `__captions.speaking(t)` | `true` while speaking (e.g. tone down a background animation) |

```js
window.__seek = (t) => {
  const c = window.__captions?.at(t);
  cap.textContent = c ? c.text : '';
  mouth.style.scale = window.__captions?.speaking(t) ? 1 : 0.6;
};
```
Word timings are **estimated** (proportional to letters): accurate to ~100 ms on a short sentence, not a
forced alignment. For exact karaoke, keep lines short.

## Rules

1. **Text first**: write the narration (~2.5 words/s spoken), then `voice.mjs`, then the storyboard on the real duration.
2. One subtitle ≤ 42 characters, 1–2 lines, ≥ 1 s on screen; do not duplicate a big title already readable on screen.
3. Leave 0.4 s before the 1st sentence and 0.5 s after the last one: `data-duration` ≥ `voice.duration + 0.5`.
4. Sound effects are mixed under the voice: gain .3–.5 during the narration, no riser covering a sentence.
5. Check with stills **inside a sentence** (`--stills`): legibility, contrast, safe area, no collision with the content.
