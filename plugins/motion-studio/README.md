# Motion Studio Plugin

Motion design en code pour Claude Code : Claude écrit la vidéo comme une page web (HTML, CSS, SVG, Canvas 2D/WebGL,
WAAPI, GSAP…), puis un renderer la filme **image par image** dans Chromium headless et l'encode avec ffmpeg.

Pas de capture temps réel (`recordVideo` de Playwright = 25 fps variables, WebM compressé) : le temps est
**virtualisé**, chaque frame est calculée exactement, le rendu est reproductible au pixel près.

## Installation

```json
{
  "enabledPlugins": {
    "motion-studio@angelo-plugins": true
  }
}
```

Dépendances (non fournies) :
- **Playwright** + Chromium : `npm i -D playwright && npx playwright install chromium` (ou installation globale)
- **ffmpeg** avec libx264 : `brew install ffmpeg` / `apt install ffmpeg` / `pip install imageio-ffmpeg` / `npm i ffmpeg-static` (ou `FFMPEG_PATH`)

## Skill

### /motion-video

```bash
/motion-video Intro 6s de notre produit, 16:9, fond sombre, accent orange, logo SVG fourni
```

Workflow : brief → storyboard (beats horodatés) → composition HTML → **stills de contrôle relus par Claude**
→ brouillon rapide → rendu final → vérification des frames.

## Renderer

```bash
node plugins/motion-studio/scripts/render.mjs composition.html [options]

  -o out.mp4 | .webm | .gif | .mov     --fps 60      --duration 8
  --motion-blur 4    --scale 2    --transparent    --audio music.mp3
  --stills 0.5,2,4   --from 2 --to 5   --jpeg      --crf 16    --seed 42
```

Comment ça marche, pour chaque frame :
1. un script injecté avant la page remplace `performance.now`, `Date`, `requestAnimationFrame`,
   `setTimeout/setInterval` et `Math.random` (seedé) par une horloge virtuelle ;
2. l'horloge avance jusqu'à `t` (timers échus, puis un tick rAF), `window.__seek(t)` est appelé s'il existe ;
3. toutes les animations CSS / transitions / WAAPI sont mises en pause et positionnées à `t − naissance`,
   les SVG SMIL via `setCurrentTime`, les `<video>` via `currentTime` ;
4. capture CDP `Page.captureScreenshot` → pipe PNG → ffmpeg (H.264 bt709 `crf 16`, VP9, GIF palette, ProRes 4444) ;
5. motion blur = N sous-frames fusionnées (`tmix`), supersampling = `deviceScaleFactor` + downscale Lanczos.

## Exemple

`examples/sketch-intro.html` — 8 s, 1920×1080, 60 fps, mélange Canvas (particules), SVG (tracé + SMIL),
CSS keyframes (ressort `linear()`), WAAPI déclenché par timer.

```bash
node plugins/motion-studio/scripts/render.mjs plugins/motion-studio/examples/sketch-intro.html --motion-blur 4 -o sketch-intro.mp4
# → 1920×1080 60 fps, 8 s, ~4.8 Mo, ≈ 3.5 min de rendu (1920 captures)
```

## Écosystème (état de l'art, sept. 2026)

| Projet | Approche | Ce qu'on en retient |
|--------|----------|---------------------|
| [HyperFrames](https://github.com/heygen-com/hyperframes) (HeyGen, Apache-2.0) | HTML + attributs `data-start/duration`, adaptateurs GSAP/Lottie/Three/WAAPI, plugin Claude Code officiel | Contrat « seekable », CLI `snapshot/check/render`, lint des compositions |
| [claude-motion-design](https://github.com/howseen-ai/claude-motion-design) | Skill : tout dérive de `seek(t)`, Playwright + ffmpeg, motion blur `tmix`, calage sur le beat | Stills d'approbation avant rendu, ressorts en forme close, loudness -14 LUFS |
| [launch-video-skills](https://github.com/anudeepadi/launch-video-skills) | Skill vidéo de lancement SaaS, HTML/CSS → Playwright → ffmpeg + TTS local | Scènes par templates, voix off sans API |
| Remotion | React + composants, rendu frame par frame | Modèle `useCurrentFrame()`, mais licence commerciale et stack React |
| timesnap / timecut | Override du temps JS dans Puppeteer | L'idée d'horloge virtuelle (non maintenus) |

Ce plugin prend l'approche la plus légère : **zéro framework imposé**, un seul script Node, et la
virtualisation du temps couvre n'importe quelle page (CSS pur, SVG, Canvas, GSAP…) sans adaptateur.
Pour des projets longs avec montage multi-pistes, HyperFrames reste le choix plus complet.
