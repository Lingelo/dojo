# Composition contract

A composition is a self-contained HTML page. The renderer (`scripts/render.mjs`) opens it in headless
Chromium, **replaces time** before any script runs, then for each frame:

1. advances the virtual clock to `t` (fires the due `setTimeout`/`setInterval` in order, then one `requestAnimationFrame` tick);
2. calls `window.__seek(t_in_seconds)` if it exists (and waits for its promise);
3. pauses and positions **all** CSS animations / transitions / WAAPI (`document.getAnimations()`), SVG SMIL (`setCurrentTime`) and `<video>/<audio>` (`currentTime`, waiting for `seeked`);
4. waits for `document.fonts.ready`, captures the frame through CDP (`Page.captureScreenshot`) and pushes it into ffmpeg.

## Configuration (`<body>` or `<html>`)

| Attribute | Default | Role |
|---|---|---|
| `data-width` / `data-height` | 1920 / 1080 | Viewport in CSS px |
| `data-fps` | 60 | Output frame rate |
| `data-duration` | — (required) | Duration in seconds |
| `data-seed` | 42 | Seed of `Math.random` |
| `data-quality` | standard | Render level exposed as `window.__quality` (see below) |

The CLI options (`--width`, `--fps`, …) take precedence over these attributes.

## What is virtualized

| API | Behavior |
|---|---|
| `performance.now()` | virtual ms since load (0 at the 1st frame) |
| `Date`, `Date.now()` | fixed epoch 2025-01-01T00:00:00Z + virtual time |
| `requestAnimationFrame` | 1 call per frame, with the virtual timestamp |
| `setTimeout` / `setInterval` / `requestIdleCallback` | run at the exact virtual time |
| `Math.random` | seeded mulberry32 PRNG |
| CSS animations / transitions / `element.animate()` | local time = `t − birth` (birth = virtual instant of creation) |
| SVG SMIL (`<animate>`, `<animateTransform>`…) | `svg.setCurrentTime(t − birth)` |
| `<video>` / `<audio>` | `currentTime = t − data-start` |

## Render level (`--quality draft|standard|high`)

The renderer exposes `window.__quality` before any script. The composition decides what each level costs;
**same scene at every level, only the finesse changes** (otherwise a draft validates nothing):
```js
const QUALITY = window.__quality ?? 'standard';   // browser preview: standard
const HQ = QUALITY === 'high';
if (QUALITY === 'draft') renderer.shadowMap.enabled = false;            // iterate fast
const tube = new THREE.TubeGeometry(curve, HQ ? 2400 : 900, 0.05, HQ ? 20 : 10);
if (HQ) { sun.shadow.mapSize.set(4096, 4096); /* + EffectComposer with GTAOPass (contact shadows) */ }
```
- **Explicit, never inferred from the machine** (`hardwareConcurrency`, speed measurement…): same option =
  same frames everywhere; only the render time varies from one machine to another.
- **Polygons alone do not show**: subdividing without adding shape (noise octave, chamfer, missing pieces)
  changes nothing on screen. Add *shape*, not just triangles.
- **The lever depends on the materials**: a matte scene (stone, paper, sand) gains from ambient occlusion
  (`GTAOPass`) and fine shadows; an environment map (`RoomEnvironment`) lights it twice, fills the shadows
  and washes it out — it is for shiny materials (metal, lacquer, glass). Compare with stills.
- **Never judge light on a draft**: `draft` switches shadows off, so the picture looks flat and unlit. Judge
  framing and timing in `draft`; light, materials and reflections in `standard` / `high` stills only.
- **Cost is per effect, measure it**: `high` can cost about what `standard` does (more polygons, finer shadows) or
  ten times more as soon as it adds full-screen passes — each screen-space reflection (`SSRPass`), planar mirror
  (`Reflector`) or ambient occlusion pass re-renders the scene. Kaizen video: 0.1–0.2 frame/s in `high` with SSR
  + a mirror + GTAO + an 8k shadow map, ~6 h for 80 s. Time 30 frames (`--from/--to`) before a full `high` render.

## Story time ≠ real time (slowing down to read)

To give reading time without re-timing every constant: write the composition in **story time** and let a
table play through it more slowly during the passages to read. Sounds and voice follow the same table.
```js
const READ = [[3.6, 8.3], [13.5, 17.5]], SLOW = 0.68, RAMP = 0.5;   // story intervals to read, speed
const speedAt = (s) => 1 - (1 - SLOW) * Math.max(0, ...READ.map(([a, b]) => sstep(clamp((s - a) / RAMP)) * sstep(clamp((b - s) / RAMP))));
// REAL[i] = ∫ ds / speedAt(s) (step-by-step table) → realAt(s) by interpolation, storyAt(t) by bisection
window.__seek = (t) => sceneAt(storyAt(t));
const sfx = (src, at) => window.__sfx?.(src, { at: realAt(at) });  // sounds written in story time
```
Set `data-duration` to `realAt(end)`, and the `"at"` of `narration.json` to `realAt(start of each line)`.
Full example: `media/kaizen/source/kaizen-presentation.html`.

## Recipes per technology

**Pure CSS** — declarative timeline with absolute `animation-delay`; `animation-fill-mode: both|forwards`.
```css
.title { opacity: 0; animation: rise .8s cubic-bezier(.16,1,.3,1) 1.2s forwards; }
```

**Canvas 2D / WebGL** — rAF loop that draws **as a function of `t`**, not of an incremented state:
```js
function draw(ms) { const t = ms / 1000; /* positions = f(t) */ requestAnimationFrame(draw); }
requestAnimationFrame(draw);
```
A stateful simulation (physics) also works since each frame receives exactly 1 tick, but `--from` then
skips the previous ticks: prefer closed forms.

**`__seek` hook (the most robust)** — compute everything from `t`:
```js
window.__seek = (t) => { el.style.transform = `translateX(${easeOut(clamp(t / 2)) * 400}px)`; };
```

**GSAP** — works as is (it reads rAF + `performance.now`). For strict control:
```js
const tl = gsap.timeline({ paused: true }); /* … */
window.__seek = (t) => tl.seek(t, false);
```

**Lottie** — `lottie.loadAnimation({ autoplay: false, … })` then `window.__seek = t => anim.goToAndStop(t * 1000, false)`.

**Three.js / 3D** — full example: `examples/sketch-3d.html` (3D equalizer, bloom, camera, sound).
```html
<script type="importmap">{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/" } }</script>
<script type="module">
  import * as THREE from 'three';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(devicePixelRatio);            // --scale 2 = supersampling
  function draw(ms) { const t = ms / 1000; /* camera, objects = f(t) */ renderer.render(scene, camera); requestAnimationFrame(draw); }
  requestAnimationFrame(draw);
</script>
```
- **Libraries through a CDN, offline render**: any `cdn.jsdelivr.net/npm/…`, `unpkg.com/…` or `esm.sh/…`
  URL is served by the renderer from a local npm cache (`<home>/libs`, installed on first use). The page
  stays viewable as is in a browser; the render does not depend on the network. **Always pin the version**
  (`three@0.170.0`). Also works for GSAP, p5, pixi.js, lottie-web, d3, anime.js…
- **Local assets (HDRI, glTF, textures, JSON)**: reference them with relative paths. The renderer serves the
  composition's folder at `http://composition.local/` (not `file://`, where Chrome blocks `fetch()` and taints
  WebGL textures), so `RGBELoader`, `GLTFLoader`, `TextureLoader` and `fetch()` work. Assets in a parent
  folder: `--root <dir>` (it must contain the composition; nothing outside it is served, nor any hidden path such as
  `.git` or a dotfile — point it at an assets folder, not at the root of a repository). To preview the
  page in a browser, serve the folder too (`npx serve`, `python3 -m http.server`): `file://` will not load them.
- **Wait for async assets**: set `window.__ready = (async () => { …await loaders… })()` in the page. The
  renderer awaits it before the first frame (a rejection stops the render with its message). Without it,
  only fonts and `<img>` are awaited, and the first frames would render without the HDRI / models.
- **Performance**: headless WebGL is computed by the CPU (SwiftShader): ~2–3 frames/s in 1080p with bloom
  (vs ~9 in 2D). Drafts with `--fps 30 --jpeg --from/--to`, `--motion-blur 2` max for the final, no
  real-time shadows or huge geometry. Run 3D renders in the background.
- **Bloom** (`UnrealBloomPass`): the threshold applies in linear space — an sRGB color of 0.6 is ~0.3.
  Threshold 0.1–0.2, strength 0.4–0.6; check with stills (bloom burns the picture fast). "Glowing"
  elements in `MeshBasicMaterial({ toneMapped: false })`.
- **Framing**: `camera.setViewOffset(W, H, dx, dy, W, H)` shifts the subject to make room for HTML titles
  on top (sharper than 3D text, and `data-sfx` works on them).
- **Determinism**: no `THREE.Clock` (read `t`). Careful: Three.js consumes `Math.random` for the UUID of
  **each object created** (and some modules, like `EffectComposer`'s `Pass.js`, create some at import).
  Adding an object or an import higher up shifts the whole seeded sequence; and objects created depending
  on `__quality` give a different sequence per level. For stable positions, draw from a **hash**
  (`fract(sin(i·k)·43758.5)`).
- `preserveDrawingBuffer: true` avoids black frames at capture.
- **Per-vertex values must be continuous**: an attribute computed per vertex (distance to a path, "nearest X",
  a layer mask) is interpolated across each triangle. If it jumps between two neighbouring vertices — because
  the "nearest" candidate switches — the jump is drawn as a sawtooth along the triangle edges. Use a metric that
  stays continuous (a min over every candidate, each one penalised smoothly) rather than the value of the nearest one.
- **Painted sky behind a misty scene**: a cylinder or sphere with `MeshBasicMaterial({ side: BackSide, fog: false,
  depthWrite: false })` stays crisp while `scene.fog` swallows the 3D (fog only applies to materials with `fog: true`).
- **Text drawn in a canvas texture** (a sign, a kanji plate) uses the system fonts, not the page's `@font-face`
  unless it is loaded: `await document.fonts.load('700 76px "My Font"')` before `fillText`, with the font file
  next to the composition. Otherwise CJK and special glyphs differ per OS (or render as boxes).
- **Screen-space reflections** (`SSRPass`, three r170): it renders the scene itself — put it first, no `RenderPass`
  before it; `GTAOPass` then composites over its output (`SSRPass → GTAOPass → OutputPass`). Its mask is binary
  (the selected meshes, `metalness == 0` → no reflection) with one global `opacity`; a graded mask (wet puddles
  strong, lacquer weak) needs a patch of its shader, which is tied to that three version. SSR only reflects what is
  on screen: the edges of the frame have nothing to reflect. A planar mirror (`Reflector`) is exact but costs a
  second render of the scene per frame.
- **Procedural geometry without UVs**: project scanned PBR textures in world space (triplanar). Reference
  implementation: `media/kaizen/source/pbr.js` (scan + tint, desaturation, moss in crevices, clearcoat
  varnish, via `onBeforeCompile`; static objects only, the texture is pinned to the world).
- **Heavy assets** (2k scans, HDRIs): do not commit them, nor LFS — a script downloads them and checks a pinned md5
  per file (reproducible, offline once fetched). Example: `media/kaizen/source/fetch-assets.mjs`.

**Embedded video** — `<video src="clip.mp4" data-start="2.5" muted playsinline preload="auto">`: never `autoplay`.

## Common pitfalls

- **Fonts**: a network font not loaded at the 1st frame → layout jump. Use a local `@font-face`, or
  `<link rel="preload" as="font">`; the renderer waits for `document.fonts.ready` but not for a CSS
  injected late.
- **Class-triggered transitions**: OK (birth = the timer's instant), but the transition must exist in the
  style *before* the class is added.
- **`vw`/`vh`**: allowed, but the composition is designed for a fixed size → prefer px for precision.
- **Infinite animations**: accepted, they are seeked modulo their iteration.
- **Thin text / 1px strokes**: `--scale 2` removes the flicker; avoid strokes < 2px in 1080p.
- **Backgrounds**: always set `background` on `html, body`, otherwise white (or transparent with `--transparent`).
- **Gradients on large dark areas**: banding in H.264 → add a light grain (canvas noise 2–3 %) or `--crf 12`.
