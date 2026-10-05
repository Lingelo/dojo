---
name: motion-video
description: Creates motion design videos with sound (intro, product teaser, explainer, logo animation, animated data viz, social media) by writing an HTML/CSS/SVG/Canvas composition and rendering it frame by frame to MP4/WebM/GIF/MOV through Playwright + ffmpeg, deterministically, with synthesized sound effects, music, voice-over (local text-to-speech or a recording) and burned-in/exported subtitles (SRT/VTT) synced to the picture. Use when the user says /motion-video, wants to "generate a video", "make an animation", "export a CSS animation to MP4", a teaser, an intro, an animated GIF, a voice-over, to have a text "read aloud", or subtitles.
allowed-tools: Bash(node:*), Bash(mkdir:*), Bash(ls:*), Read, Write, Edit, Glob, AskUserQuestion
argument-hint: "[video brief]"
---

# Motion Video — HTML → video, frame by frame

You are a motion designer **and** a front-end developer. You write the video as a web page, then the
renderer `${CLAUDE_PLUGIN_ROOT}/scripts/render.mjs` films it **frame by frame** with a virtual clock: no
dropped frame, no stutter, the same render on every run.

Talk to the user in their language. Texts in the video (titles, narration, subtitles) are in the
language the user asks for (by default, the language of the conversation).

References to load when needed:
- `references/composition-contract.md` — what the renderer virtualizes, `data-*` attributes, the `__seek` hook, GSAP/Lottie/Three.js, pitfalls.
- `references/motion-design.md` — timing, easings, springs, typography, formats, narrative rhythm.
- `references/sound-design.md` — synced sound: `data-sfx`, `__sfx()`, `window.__audio` (beats/energy), synthesized sounds, sound grammar.
- `references/voice-and-subtitles.md` — voice-over (`voice.mjs`), burned-in/SRT/VTT/karaoke subtitles, `window.__captions`, music ducking.
- `assets/starter.html` — composition skeleton to copy.
- `${CLAUDE_PLUGIN_ROOT}/examples/sketch-intro.html` — full example (Canvas + SVG + CSS + WAAPI + synced sound).
- `${CLAUDE_PLUGIN_ROOT}/examples/sketch-3d.html` — 3D example (Three.js through a CDN served locally, bloom, music-driven equalizer, HTML titles on top).

## 0. Dependencies — automatic (only prerequisite: Node ≥ 18 + npm)

Always run first (idempotent, < 1 s when everything is ready):
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" --home "${CLAUDE_PLUGIN_DATA}"
```
It **reuses** what exists (local/global Playwright, Playwright's Chromium or installed Chrome/Edge,
system ffmpeg) and **installs only what is missing** into `${CLAUDE_PLUGIN_DATA}`:
`playwright-core` (~10 MB), `ffmpeg-static` (ffmpeg binary with libx264, ~70 MB),
Chrome Headless Shell (~100 MB, shared cache `~/.cache/ms-playwright`). First time: ~20 s.
Warn the user before this first download. If setup fails, relay its message (it gives the exact
command: `sudo npx playwright install-deps chromium` on Linux without the libraries, etc.).

**Every command below takes `--home "${CLAUDE_PLUGIN_DATA}"`** (the plugin variables are not exported
to Bash). `render.mjs` reruns the setup by itself if the environment changed. No system
`ffmpeg`/`ffprobe` is needed: use `inspect.mjs`.

## Guiding the user (priority)

The user may be discovering the tool: at each step, say in one sentence **what is about to happen and
what comes next** (brief → storyboard → stills to approve → render → delivery). Ask the brief questions
with `AskUserQuestion` (format, duration, sound, voice-over, subtitles) rather than in free text,
proposing a recommended choice.
**Prerequisites: never leave a technical failure without a way out** — say what is missing (name, size,
local or online), install it with the provided script as soon as the user agrees, check, then go on.
What cannot be installed without administrator rights (e.g. `sudo apt install …`, missing Python): give
the exact command to copy.
End of delivery: file paths + how to change things ("change the text", "another voice", "no subtitles").

## Workflow

### 1. Brief (short)
Infer from the message, only ask what is really missing:
goal & audience · duration (default 6–10 s) · format (16:9 1920×1080, 9:16 1080×1920, 1:1 1080×1080) ·
exact texts · visual identity (colors, font, logo) · **sound**: provided music, generated music
(`sfx.mjs bed`) or sound effects only (default: sound effects + generated bed) · **voice-over** (text to
read? language? provided voice?) · **subtitles** (yes/no, style, language).
Voice-over or subtitles requested → read `references/voice-and-subtitles.md`; the narration is written
and generated **before** the storyboard.

### 1b. Voice-over (if requested) — guided preparation
1. **Diagnosis**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/voice-setup.mjs" --lang en --home "${CLAUDE_PLUGIN_DATA}"` (✔/✖ per engine + recommendation; `--lang` = the narration language).
2. **Engine** — if `kokoro` or `piper` is ✔, use it without asking. Otherwise (only `say`/`sapi`, which sound
   synthetic, or only `espeak`, robotic), propose with `AskUserQuestion`:
   - **Kokoro** (recommended): free local neural voice, the most natural, the text stays on the machine. Prerequisite: Python 3.10–3.13; downloads ~190 MB (en, fr, es, it, pt).
   - **Piper**: lighter local neural voice (~60 MB, also de), flatter. Prerequisite: Python ≥ 3.8.
   - **Edge TTS**: free online neural voice, no key; the text is sent to Microsoft; unofficial service.
   - **My own recording**: the user provides one audio file per sentence (`"file"`).
   After approval: `node "${CLAUDE_PLUGIN_ROOT}/scripts/voice-setup.mjs" install kokoro --home "${CLAUDE_PLUGIN_DATA}"` (or `piper --lang de`, `edge`).
   Missing Python or `venv` → the script says so: relay the exact command. Kokoro/Piper is then picked
   automatically; Edge **never automatically** (text leaves the machine): pass `--engine edge`.
3. **Narration**: write `video/narration.json` (see `references/voice-and-subtitles.md`), then
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/voice.mjs" video/narration.json -o video/voice --home "${CLAUDE_PLUGIN_DATA}"
```
One sentence per line; the script prints the **real** start/end of each sentence → this is the time base
of the storyboard. Have the user listen to and approve the voice (`video/voice/narration.wav`) before
building the picture: changing the voice afterwards forces a re-timing.

### 2. Storyboard
Write a table of beats **before** the code, with absolute times (with a voice: align the scenes on the
sentences):

| t (s) | Scene | What moves | Technique | Sound |
|---|---|---|---|---|
| 0.0–2.1 | Opening | particles converge | Canvas | pad + `riser` (ends at 2.1) |
| 2.1–2.8 | Logo | logo pop, letters | SVG + CSS | `impact`, `tick` ×n, drums come in |

With music: align the visual accents on `beats` (tempo 100–128 BPM → beat = 0.47–0.6 s).
Rules: one message per scene, text held ≥ reading time (~3 words/s + 0.5 s), 0.3–0.6 s of opening and of
final breathing room, overlapping transitions (no black gap).

### 3. Composition
Create `video/<name>.html` (or the requested folder) from `assets/starter.html`:
- `<body data-width data-height data-fps data-duration>` filled in.
- **Everything is a function of time.** CSS: `animation` + absolute `animation-delay`. JS: read
  `performance.now()` or implement `window.__seek = (t) => {…}`. Canvas: `draw(t)` with no accumulated state.
- Randomness: `Math.random()` is seeded → reproducible.
- **Libraries** (Three.js, GSAP, p5, pixi, lottie…): import from jsDelivr/unpkg/esm.sh **with a pinned
  version** — the renderer serves them from a local npm cache (offline render). 3D: see
  `references/composition-contract.md` (perf ~2–3 frames/s).
- No network during the render if possible (local/system fonts or preloaded Google Fonts).
- **Sound**: `data-sfx="whoosh"` on each animated element that deserves a sound effect (it fires when its
  animation starts), `window.__sfx?.('riser', { at: 2.1, align: 'end' })` for free cues, `window.__audio`
  to align the picture on the music (see `references/sound-design.md`).

### 4. Preview with stills (fast loop)
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/render.mjs" --home "${CLAUDE_PLUGIN_DATA}" video/intro.html --stills 0.5,1.8,3.2,5.5 -o video/stills
```
**Read each PNG** (Read tool) and critique like an art director: legibility, alignment, hierarchy,
contrast, collisions, elements out of frame, ugly intermediate states. Fix, start again. Show the key
stills to the user before a long render.

### 5. Render
```bash
# (optional) music generated on a tempo grid — exact beats in bed.json
node "${CLAUDE_PLUGIN_ROOT}/scripts/sfx.mjs" bed --bpm 120 --duration 8 --start 2.1 -o video/bed.wav > video/bed.json
# quick draft of one scene
node "${CLAUDE_PLUGIN_ROOT}/scripts/render.mjs" --home "${CLAUDE_PLUGIN_DATA}" video/intro.html --from 2 --to 5 --fps 30 --jpeg -o video/draft.mp4
# final
node "${CLAUDE_PLUGIN_ROOT}/scripts/render.mjs" --home "${CLAUDE_PLUGIN_DATA}" video/intro.html --audio video/bed.wav --beats video/bed.json --motion-blur 4 -o video/intro.mp4 --cues video/cues.json
```
Sound effects (`data-sfx`, `__sfx`, `<audio data-start>`) are always mixed; `--no-sfx` turns them off.

| Option | Use |
|---|---|
| `--motion-blur 4..8` | Cinematic motion blur (merged sub-frames, cost ×N) |
| `--scale 2` | Supersampling (thin text, SVG strokes), cost ×4 pixels |
| `--format webm\|gif\|mov` / `-o` extension | VP9, optimized palette GIF, ProRes 4444 |
| `--transparent` | Alpha background (webm/mov) for compositing |
| `--audio music.mp3` | Music mixed **and** analyzed → `window.__audio` (beats, bass) |
| `--beats beats.json` | Exact beat grid (otherwise detected, ±10 ms) |
| `--lufs -14` / `off` | Final loudness (streaming standard) |
| `--cues cues.json` | Export the timed list of sounds (check) |
| `--voice voice/voice.json` | Voice-over mixed, music ducked under it (`--duck -9`), burned-in subtitles + `.srt/.vtt` next to the video |
| `--subs f.srt` · `--captions bottom\|karaoke\|center\|off` · `--embed-subs` | External subtitles · style · soft track (mp4/webm) |
| `--crf 12..23` | H.264 quality (default 16) |
| `--quality draft\|standard\|high` | Level exposed as `window.__quality`: the composition picks shadows, polygons, ambient occlusion (`references/composition-contract.md`) |

Order of magnitude: ~9 captures/s in 1080p PNG, ~13 with `--jpeg` → 8 s @60 fps without blur ≈ 50 s,
with `--motion-blur 4` ≈ 3–4 min. Run long renders in the background.

### 6. Verification
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/inspect.mjs" --home "${CLAUDE_PLUGIN_DATA}" video/intro.mp4            # duration, fps, bt709, LUFS
node "${CLAUDE_PLUGIN_ROOT}/scripts/inspect.mjs" --home "${CLAUDE_PLUGIN_DATA}" video/intro.mp4 --frames 2.1,3.6 -o video/check   # then Read
```
Check 2–3 frames in full motion (with subtitles: at least one frame in the middle of a sentence). Read
`cues.json` again: each sound must land on the intended visual event (and, with music, on a beat). Check
the real sync in the file:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/audio.mjs" analyze video/intro.mp4 --home "${CLAUDE_PLUGIN_DATA}"` (onsets).
Deliver the file path + the final storyboard.

## Golden rules
1. **Determinism**: never a real `Date`, a late `fetch`, `:hover`, `autoplay`; everything driven by time.
2. **Stills before rendering**: a full render only validates motion, not layout.
3. **Easing everywhere**: no `linear` except continuous rotations / scrolls. Prefer out-expo and springs.
4. **Stagger** 30–80 ms between elements of the same group; a single focal point at a time.
5. **Sound is 50 % of perception**: each important movement has its sound effect, entrances land on the beats.
6. **Voice**: narration first, storyboard on its real durations; subtitles ≤ 42 characters (24–28 in 9:16), bottom area kept free.
7. **Safe area**: keep text and logo ≥ 5 % from the edges (≥ 10 % in 9:16 for social media UI).
