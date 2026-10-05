# Motion Studio plugin

Motion design as code for Claude Code: Claude writes the video like a web page (HTML, CSS, SVG, Canvas
2D/WebGL, WAAPI, GSAP…), then a renderer films it **frame by frame** in headless Chromium and encodes it
with ffmpeg, with **sample-accurate synced sound** (synthesized sound effects + analyzed music), voice-over
and subtitles.

No real-time capture (Playwright's `recordVideo` = variable 25 fps, compressed WebM): time is
**virtualized**, each frame is computed exactly, the render is reproducible to the pixel.

## Installation

```json
{
  "enabledPlugins": {
    "motion-studio@dojo": true
  }
}
```

### Dependencies: automatic

Only prerequisite: **Node ≥ 18 + npm**. On the first `/motion-video` (or first render), `scripts/setup.mjs`
detects what exists and installs **only what is missing** into `${CLAUDE_PLUGIN_DATA}`
(`~/.claude/plugins/data/motion-studio-…`, kept across updates, removed on uninstall):

| Need | Reused if present | Otherwise installed automatically |
|---|---|---|
| Browser automation | the project's or global `playwright` / `playwright-core` | `playwright-core` (npm, ~10 MB) |
| Browser | Playwright's Chromium (cache shared with the Playwright MCP), installed Chrome or Edge | Chrome Headless Shell (~100 MB) |
| Video/audio encoding | `ffmpeg` on the PATH, `imageio-ffmpeg`, `FFMPEG_PATH` | `ffmpeg-static` (static libx264/AAC/VP9/Opus binary, macOS/Linux/Windows, ~70 MB) |

First run on a clean machine: ~20 s. Then < 1 s (result remembered in `env.json`, revalidated on every
render).

```bash
node plugins/motion-studio/scripts/setup.mjs            # install / repair
node plugins/motion-studio/scripts/setup.mjs --check    # diagnosis only
```

| Variable | Role |
|---|---|
| `MOTION_STUDIO_HOME` | dependency folder (default `${CLAUDE_PLUGIN_DATA}`, or `--home`) |
| `MOTION_STUDIO_NO_INSTALL=1` | never install automatically |
| `MOTION_STUDIO_ISOLATED=1` | ignore system installations |
| `CHROMIUM_PATH` | browser to use |
| `FFMPEG_PATH` | ffmpeg to use |
| `PIPER_MODEL` | Piper voice (`.onnx`) to use for the voice-over |

Only case that cannot be automated: Linux without Chromium's system libraries →
`sudo npx playwright install-deps chromium` (setup says so).

> **What about the Playwright MCP?** It is not suited to rendering: each frame would be a tool call going
> through the model (1,920 calls for 8 s), with no init script for the virtual clock and no stream to
> ffmpeg. It stays useful to *explore* a page; and if it already downloaded Chromium, `setup.mjs` reuses it.

## Skill

### /motion-video

```bash
/motion-video 6-second intro for our product, 16:9, dark background, orange accent, SVG logo provided
```

Workflow: brief → (voice-over) → storyboard (timed beats) → HTML composition → **control stills read by
Claude** → quick draft → final render → frame check. Claude talks to you in your language; the texts in
the video follow the language you ask for.

## Renderer

```bash
node plugins/motion-studio/scripts/render.mjs composition.html [options]

  -o out.mp4 | .webm | .gif | .mov     --fps 60      --duration 8
  --motion-blur 4    --scale 2    --transparent    --audio music.mp3
  --stills 0.5,2,4   --from 2 --to 5   --jpeg      --crf 16    --seed 42   --quality draft|standard|high
  --beats beats.json --lufs -14 --cues cues.json   --no-sfx
  --voice voice.json --duck -9  --subs f.srt  --captions bottom|karaoke|center|off  --embed-subs

node plugins/motion-studio/scripts/sfx.mjs list | <sound> -o x.wav | bed --bpm 120 --duration 8
node plugins/motion-studio/scripts/audio.mjs analyze music.mp3     # tempo, beats, onsets
node plugins/motion-studio/scripts/voice-setup.mjs [install kokoro|piper|edge|espeak] [--lang en]   # voice engines
node plugins/motion-studio/scripts/voice.mjs narration.json -o voice/       # voice-over + subtitles
node plugins/motion-studio/scripts/inspect.mjs out.mp4 [--frames 2.1,3.6 -o check/]   # duration, fps, LUFS, frames
```

How it works, for each frame:
1. a script injected before the page replaces `performance.now`, `Date`, `requestAnimationFrame`,
   `setTimeout/setInterval` and `Math.random` (seeded) with a virtual clock;
2. the clock advances to `t` (due timers, then one rAF tick), `window.__seek(t)` is called if it exists;
3. all CSS animations / transitions / WAAPI are paused and positioned at `t − birth`, SVG SMIL through
   `setCurrentTime`, `<video>` through `currentTime`;
4. CDP capture `Page.captureScreenshot` → PNG pipe → ffmpeg (H.264 bt709 `crf 16`, VP9, palette GIF,
   ProRes 4444);
5. motion blur = N merged sub-frames (`tmix`), supersampling = `deviceScaleFactor` + Lanczos downscale.

## Synced sound

| Direction | Mechanism |
|---|---|
| **Sound follows picture** | `data-sfx="whoosh"` on an animated element → cue at the exact start of its animation; `window.__sfx('riser', {at: 2.1, align: 'end'})`; `<audio data-start>` |
| **Picture follows sound** | `--audio music.mp3` is analyzed (tempo, beats, onsets, bass energy) and exposed as `window.__audio`: `nextBeat(t)`, `beat(t).pulse`, `bass(t)` |

Cues are timestamped in virtual time during the render, then mixed in JS sample-accurately (48 kHz),
normalized to −14 LUFS and muxed (AAC / Opus / PCM). Sound effects are **synthesized in code**
(`sfx.mjs`: pop, tick, click, whoosh, swoosh, riser, impact, chime, glitch, kick, hat, pad + the `bed`
music generator), so no sound bank and no license. Details:
[`skills/motion-video/references/sound-design.md`](skills/motion-video/references/sound-design.md).

## Voice-over and subtitles

| Need | Command |
|---|---|
| Have a text **read aloud** | `node scripts/voice.mjs narration.json -o voice/` → `narration.wav`, `voice.json` (real timeline), `subs.srt/.vtt` |
| Mix the voice (music ducked under it) + burned-in subtitles | `node scripts/render.mjs comp.html --voice voice/voice.json` |
| Subtitles from an existing `.srt/.vtt`, karaoke style, soft track | `--subs en.srt --captions karaoke --embed-subs` |

Voice engines: **Kokoro** (neural, local, free, the most natural — recommended), **Piper** (neural, local,
lighter), `say` (macOS), SAPI (Windows), **Edge TTS**
(neural, online, free with no key, the text goes to Microsoft: never chosen automatically) and eSpeak NG
(robotic). Guided installation: `node scripts/voice-setup.mjs` (status), `... install kokoro|piper|edge|espeak`
(private Python venv + voice, no sudo; prerequisite: Python ≥ 3.8, 3.10–3.13 for Kokoro). Default language: English (`--lang`
or `"lang"` in the script for another one: fr, es, de, it…). A line can also reference an existing
recording (`"file"`). The duration of each sentence is **measured** on the audio: the storyboard is
aligned on it, the subtitles follow (word timings estimated for karaoke). The `.srt`/`.vtt` files are
written next to the video. `window.__captions` exposes the cues, the active word and `speaking(t)` to
compositions. Details:
[`skills/motion-video/references/voice-and-subtitles.md`](skills/motion-video/references/voice-and-subtitles.md).

## Examples

### 2D intro

`examples/sketch-intro.html` — 8 s, 1920×1080, 60 fps, mixing Canvas (particles), SVG (stroke + SMIL),
CSS keyframes (`linear()` spring), timer-triggered WAAPI, and 21 synced sounds: riser → impact on the
logo, a tick per letter (spatialized), a pop per card **aligned on the music's eighth notes**, a chime on
a strong beat; the halo breathes with the bass and the logo pulses on every beat.

```bash
cd plugins/motion-studio/examples
node ../scripts/sfx.mjs bed --bpm 120 --duration 8 --start 2.1 -o bed.wav > bed.json
node ../scripts/render.mjs sketch-intro.html --audio bed.wav --beats bed.json --motion-blur 4
# → 1920×1080 60 fps + stereo AAC −14 LUFS, 8 s, ≈ 3.5 min of rendering (1,920 captures)
```

### 3D

`examples/sketch-3d.html` — Three.js (WebGL): crystal, wireframe shell, shock wave at the impact, ring of
72 bars driven by the music (bass + level), bloom breathing on the beats, camera flying in then orbiting,
HTML titles on top with spatialized ticks. Three.js is imported from jsDelivr; at render time, these URLs
(jsDelivr, unpkg, esm.sh) are served from a local npm cache → offline render, pinned version, page still
openable in a browser.

```bash
node ../scripts/render.mjs sketch-3d.html --audio bed.wav --beats bed.json --motion-blur 2
# headless WebGL = CPU: ~2.4 captures/s in 1080p with bloom (≈ 7 min for 8 s @60 fps, blur ×2)
```

### 3D + voice-over + subtitles

[`examples/demo-3d-voice/`](examples/demo-3d-voice/README.md) — 30 s, English voice-over, karaoke
subtitles, music driving the picture; each narration line is pinned to its scene.

### A real production

The [Kaizen presentation video](../kaizen/docs/media/kaizen-presentation.mp4) (source:
[`kaizen-presentation.html`](../kaizen/docs/media/source/kaizen-presentation.html)) was rendered with this
plugin: Three.js scene, story time slowed down for reading, Piper voice-over, burned-in subtitles.

## Why a browser (Playwright)?

It is the approach of the whole ecosystem (HyperFrames, Remotion, claude-motion-design): only a real
rendering engine computes CSS, SVG, fonts, filters and Canvas faithfully. Playwright is only a thin
automation layer (launching Chromium + a CDP session); it could be replaced by Puppeteer or raw CDP
without changing the principle. The core is the virtual clock. Browser-free alternatives (node-canvas,
resvg, ffmpeg `drawtext`) each cover a single technique and lose CSS.

## Ecosystem (state of the art, Sept. 2026)

| Project | Approach | What we take from it |
|---|---|---|
| [HyperFrames](https://github.com/heygen-com/hyperframes) (HeyGen, Apache-2.0) | HTML + `data-start/duration` attributes, GSAP/Lottie/Three/WAAPI adapters, official Claude Code plugin | "Seekable" contract, `snapshot/check/render` CLI, composition lint |
| [claude-motion-design](https://github.com/howseen-ai/claude-motion-design) | Skill: everything derives from `seek(t)`, Playwright + ffmpeg, `tmix` motion blur, beat alignment | Approval stills before rendering, closed-form springs, −14 LUFS loudness |
| [launch-video-skills](https://github.com/anudeepadi/launch-video-skills) | SaaS launch video skill, HTML/CSS → Playwright → ffmpeg + local TTS | Template scenes, voice-over without an API |
| Remotion | React + components, frame-by-frame render | The `useCurrentFrame()` model, but a commercial license and a React stack |
| timesnap / timecut | JS time override in Puppeteer | The virtual clock idea (unmaintained) |

This plugin takes the lightest approach: **no imposed framework**, a single Node script, and time
virtualization covers any page (pure CSS, SVG, Canvas, GSAP…) without an adapter. For long projects with
multi-track editing, HyperFrames remains the more complete choice.

## Structure

```
motion-studio/
├── .claude-plugin/plugin.json
├── package.json                 # runtime deps, installed on demand into ${CLAUDE_PLUGIN_DATA}
├── skills/motion-video/
│   ├── SKILL.md
│   ├── references/              # composition contract, motion design, sound design, voice & subtitles
│   └── assets/starter.html
├── scripts/
│   ├── setup.mjs  deps.mjs      # self-sufficient dependency resolution
│   ├── render.mjs               # virtual clock, capture, encoding, mixing, subtitles
│   ├── sfx.mjs  audio.mjs       # synthesized sounds, music bed, beat/energy analysis
│   ├── voice.mjs  voice-setup.mjs  voice-env.mjs  captions.mjs   # TTS, engines, SRT/VTT
│   └── inspect.mjs              # check a render without a system ffmpeg
└── examples/                    # sketch-intro, sketch-3d, demo-3d-voice
```
