# Motion Studio Plugin

Motion design en code pour Claude Code : Claude écrit la vidéo comme une page web (HTML, CSS, SVG, Canvas 2D/WebGL,
WAAPI, GSAP…), puis un renderer la filme **image par image** dans Chromium headless et l'encode avec ffmpeg,
avec un **son synchronisé à l'échantillon près** (bruitages synthétisés + musique analysée).

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

### Dépendances : automatiques

Seul prérequis : **Node ≥ 18 + npm**. Au premier `/motion-video` (ou premier rendu), `scripts/setup.mjs`
détecte ce qui existe et installe **uniquement ce qui manque** dans `${CLAUDE_PLUGIN_DATA}`
(`~/.claude/plugins/data/motion-studio-…`, conservé entre mises à jour, supprimé à la désinstallation) :

| Besoin | Réutilisé si présent | Sinon installé automatiquement |
|--------|----------------------|--------------------------------|
| Pilotage navigateur | `playwright` / `playwright-core` du projet ou global | `playwright-core` (npm, ~10 Mo) |
| Navigateur | Chromium de Playwright (cache partagé avec le MCP Playwright), Chrome ou Edge installés | Chrome Headless Shell (~100 Mo) |
| Encodage vidéo/audio | `ffmpeg` du PATH, `imageio-ffmpeg`, `FFMPEG_PATH` | `ffmpeg-static` (binaire statique libx264/AAC/VP9/Opus, macOS/Linux/Windows, ~70 Mo) |

Premier lancement sur machine vierge : ~20 s. Ensuite < 1 s (résultat mémorisé dans `env.json`, revalidé à chaque rendu).

```bash
node plugins/motion-studio/scripts/setup.mjs            # installer / réparer
node plugins/motion-studio/scripts/setup.mjs --check    # diagnostic seul
```
Variables : `MOTION_STUDIO_HOME` (dossier des deps), `MOTION_STUDIO_NO_INSTALL=1` (jamais d'installation auto),
`MOTION_STUDIO_ISOLATED=1` (ignorer les installations système), `CHROMIUM_PATH`, `FFMPEG_PATH`.
Seul cas non automatisable : Linux sans les bibliothèques système de Chromium → `sudo npx playwright install-deps chromium` (le setup l'indique).

> **Et le MCP Playwright ?** Il n'est pas adapté au rendu : chaque frame serait un appel d'outil passant par
> le modèle (1 920 appels pour 8 s), sans script d'initialisation pour l'horloge virtuelle ni flux vers ffmpeg.
> Il reste utile pour *explorer* une page ; et s'il a déjà téléchargé Chromium, `setup.mjs` le réutilise.

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
  --beats beats.json --lufs -14 --cues cues.json   --no-sfx
  --voice voice.json --duck -9  --subs f.srt  --captions bottom|karaoke|center|off  --embed-subs

node plugins/motion-studio/scripts/sfx.mjs list | <son> -o x.wav | bed --bpm 120 --duration 8
node plugins/motion-studio/scripts/audio.mjs analyze music.mp3     # tempo, beats, onsets
node plugins/motion-studio/scripts/voice-setup.mjs [install piper|edge]   # moteurs de voix
node plugins/motion-studio/scripts/voice.mjs narration.json -o voice/       # voix off + sous-titres
```

Comment ça marche, pour chaque frame :
1. un script injecté avant la page remplace `performance.now`, `Date`, `requestAnimationFrame`,
   `setTimeout/setInterval` et `Math.random` (seedé) par une horloge virtuelle ;
2. l'horloge avance jusqu'à `t` (timers échus, puis un tick rAF), `window.__seek(t)` est appelé s'il existe ;
3. toutes les animations CSS / transitions / WAAPI sont mises en pause et positionnées à `t − naissance`,
   les SVG SMIL via `setCurrentTime`, les `<video>` via `currentTime` ;
4. capture CDP `Page.captureScreenshot` → pipe PNG → ffmpeg (H.264 bt709 `crf 16`, VP9, GIF palette, ProRes 4444) ;
5. motion blur = N sous-frames fusionnées (`tmix`), supersampling = `deviceScaleFactor` + downscale Lanczos.

## Son synchronisé

| Direction | Mécanisme |
|-----------|-----------|
| **Le son suit l'image** | `data-sfx="whoosh"` sur un élément animé → cue au démarrage exact de son animation ; `window.__sfx('riser', {at: 2.1, align: 'end'})` ; `<audio data-start>` |
| **L'image suit le son** | `--audio music.mp3` est analysé (tempo, beats, onsets, énergie basses) et exposé en `window.__audio` : `nextBeat(t)`, `beat(t).pulse`, `bass(t)` |

Les cues sont horodatés en temps virtuel pendant le rendu, puis mixés en JS à l'échantillon près (48 kHz),
normalisés à −14 LUFS et muxés (AAC / Opus / PCM). Les bruitages sont **synthétisés en code** (`sfx.mjs` :
pop, tick, click, whoosh, swoosh, riser, impact, chime, glitch, kick, hat, pad + générateur de musique `bed`),
donc sans banque de sons ni licence. Détails : `skills/motion-video/references/sound-design.md`.

## Voix off et sous-titres

| Besoin | Commande |
|--------|----------|
| Faire **lire** un texte | `node scripts/voice.mjs narration.json -o voice/` → `narration.wav`, `voice.json` (timeline réelle), `subs.srt/.vtt` |
| Mixer la voix (musique baissée dessous) + sous-titres incrustés | `node scripts/render.mjs comp.html --voice voice/voice.json` |
| Sous-titres d'un `.srt/.vtt` existant, style karaoké, piste souple | `--subs fr.srt --captions karaoke --embed-subs` |

Moteurs de voix : `say` (macOS), SAPI (Windows), **Piper** (neuronal, local, gratuit — recommandé), **Edge TTS** (neuronal,
en ligne, gratuit sans clé, le texte part chez Microsoft : jamais choisi automatiquement) et eSpeak NG (robotique). Installation guidée :
`node scripts/voice-setup.mjs` (état), `... install piper|edge|espeak` (venv Python privé + voix, sans sudo ; prérequis : Python ≥ 3.8).
Une ligne peut aussi référencer un enregistrement existant (`"file"`). Les durées de chaque phrase sont **mesurées** sur l'audio : le storyboard se cale dessus, les sous-titres
suivent (temps par mot estimés pour le karaoké). Les `.srt`/`.vtt` sont écrits à côté de la vidéo.
`window.__captions` expose cues, mot actif et `speaking(t)` aux compositions. Détails : `skills/motion-video/references/voice-and-subtitles.md`.

## Exemple

`examples/sketch-intro.html` — 8 s, 1920×1080, 60 fps, mélange Canvas (particules), SVG (tracé + SMIL),
CSS keyframes (ressort `linear()`), WAAPI déclenché par timer, et 21 sons synchronisés : riser → impact
sur le logo, tic par lettre (spatialisé), pop par carte **calé sur les croches de la musique**, carillon
sur un temps fort ; le halo respire avec la basse et le logo pulse sur chaque beat.

```bash
cd plugins/motion-studio/examples
node ../scripts/sfx.mjs bed --bpm 120 --duration 8 --start 2.1 -o bed.wav > bed.json
node ../scripts/render.mjs sketch-intro.html --audio bed.wav --beats bed.json --motion-blur 4
# → 1920×1080 60 fps + AAC stéréo −14 LUFS, 8 s, ≈ 3.5 min de rendu (1920 captures)
```

## Pourquoi un navigateur (Playwright) ?

C'est l'approche de tout l'écosystème (HyperFrames, Remotion, claude-motion-design) : seul un vrai moteur
de rendu calcule fidèlement CSS, SVG, polices, filtres et Canvas. Playwright n'est qu'une fine couche de
pilotage (lancement de Chromium + session CDP) ; il est remplaçable par Puppeteer ou CDP brut sans rien changer
au principe. Le cœur, c'est l'horloge virtuelle. Les alternatives sans navigateur (node-canvas, resvg, ffmpeg
`drawtext`) ne couvrent qu'une technique chacune et perdent le CSS.

### Exemple 3D

`examples/sketch-3d.html` — Three.js (WebGL) : cristal, coque filaire, onde de choc à l'impact, anneau de 72 barres
piloté par la musique (basses + niveau), bloom qui respire sur les beats, caméra en vol puis en orbite, titres HTML
superposés avec tics spatialisés. Three.js est importé depuis jsDelivr ; au rendu, ces URLs (jsDelivr, unpkg, esm.sh)
sont servies depuis un cache npm local → rendu hors ligne, version figée, page toujours ouvrable dans un navigateur.

```bash
node ../scripts/render.mjs sketch-3d.html --audio bed.wav --beats bed.json --motion-blur 2
# WebGL headless = CPU : ~2.4 captures/s en 1080p avec bloom (≈ 7 min pour 8 s @60 fps, blur ×2)
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
