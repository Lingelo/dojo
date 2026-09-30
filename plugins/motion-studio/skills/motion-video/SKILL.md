---
name: motion-video
description: Crée des vidéos motion design (intro, teaser produit, explainer, animation de logo, data-viz animée, réseaux sociaux) en écrivant une composition HTML/CSS/SVG/Canvas puis en la rendant image par image en MP4/WebM/GIF/MOV via Playwright + ffmpeg, de façon déterministe. Utiliser quand l'utilisateur demande /motion-video, veut « générer une vidéo », « faire une animation », « exporter une animation CSS en MP4 », un teaser, une intro ou un GIF animé.
allowed-tools: Bash(node:*), Bash(python3:*), Bash(ffmpeg:*), Bash(ffprobe:*), Bash(mkdir:*), Bash(ls:*), Read, Write, Edit, Glob
argument-hint: "[brief de la vidéo]"
---

# Motion Video — HTML → vidéo image par image

Tu es motion designer **et** développeur front. Tu écris la vidéo comme une page web, puis le renderer
`${CLAUDE_PLUGIN_ROOT}/scripts/render.mjs` la filme **image par image** avec une horloge virtuelle :
aucune frame perdue, aucune saccade, rendu identique à chaque exécution.

Références à charger au besoin :
- `references/composition-contract.md` — ce que le renderer virtualise, attributs `data-*`, hook `__seek`, GSAP/Lottie/Three.js, pièges.
- `references/motion-design.md` — timing, easings, ressorts, typographie, formats, rythme narratif.
- `assets/starter.html` — squelette de composition à copier.
- `${CLAUDE_PLUGIN_ROOT}/examples/sketch-intro.html` — exemple complet (Canvas + SVG + CSS + WAAPI).

## Prérequis (vérifier une fois)

```bash
node -e "require.resolve('playwright')" 2>/dev/null || npm ls -g playwright   # sinon: npm i -D playwright && npx playwright install chromium
ffmpeg -hide_banner -encoders | grep libx264  # sinon: brew/apt install ffmpeg | pip install imageio-ffmpeg | npm i ffmpeg-static
```
Le renderer trouve seul Playwright (local ou global) et ffmpeg (`FFMPEG_PATH`, PATH, imageio-ffmpeg, ffmpeg-static).

## Workflow

### 1. Brief (court)
Déduire du message, ne demander que ce qui manque vraiment :
objectif & public · durée (défaut 6–10 s) · format (16:9 1920×1080, 9:16 1080×1920, 1:1 1080×1080) ·
textes exacts · identité visuelle (couleurs, police, logo) · audio éventuel.

### 2. Storyboard
Écrire un tableau de beats **avant** le code, avec des temps absolus :

| t (s) | Scène | Ce qui bouge | Technique |
|-------|-------|--------------|-----------|
| 0.0–1.2 | Ouverture | particules convergent | Canvas |
| 1.2–2.6 | Logo | tracé du contour, pop | SVG + CSS |

Règles : un message par scène, texte tenu ≥ temps de lecture (~3 mots/s + 0.5 s), 0.3–0.6 s d'ouverture
et de respiration finale, transitions qui se chevauchent (pas de trou noir).

### 3. Composition
Créer `video/<nom>.html` (ou dossier demandé) à partir de `assets/starter.html` :
- `<body data-width data-height data-fps data-duration>` renseignés.
- **Tout est fonction du temps.** CSS : `animation` + `animation-delay` absolus. JS : lire `performance.now()`
  ou implémenter `window.__seek = (t) => {…}`. Canvas : `draw(t)` sans état accumulé.
- Aléatoire : `Math.random()` est seedé → reproductible.
- Pas de réseau pendant le rendu si possible (polices locales/système ou Google Fonts préchargées).

### 4. Preview par stills (boucle rapide)
```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/render.mjs video/intro.html --stills 0.5,1.8,3.2,5.5 -o video/stills
```
**Lire chaque PNG** (outil Read) et critiquer comme un directeur artistique : lisibilité, alignements,
hiérarchie, contraste, collisions, éléments hors cadre, états intermédiaires moches. Corriger, recommencer.
Montrer les stills clés à l'utilisateur avant un rendu long.

### 5. Rendu
```bash
# brouillon rapide d'une scène
node ${CLAUDE_PLUGIN_ROOT}/scripts/render.mjs video/intro.html --from 2 --to 5 --fps 30 --jpeg -o video/draft.mp4
# final
node ${CLAUDE_PLUGIN_ROOT}/scripts/render.mjs video/intro.html --motion-blur 4 -o video/intro.mp4
```
| Option | Usage |
|--------|-------|
| `--motion-blur 4..8` | Flou de mouvement cinéma (sous-frames fusionnées, coût ×N) |
| `--scale 2` | Supersampling (texte fin, traits SVG), coût ×4 pixels |
| `--format webm\|gif\|mov` / extension de `-o` | VP9, GIF palette optimisée, ProRes 4444 |
| `--transparent` | Fond alpha (webm/mov) pour incrustation |
| `--audio music.mp3` | Mux audio (AAC/Opus), coupé à la durée |
| `--crf 12..23` | Qualité H.264 (défaut 16) |

Ordre de grandeur : ~9 captures/s en 1080p PNG, ~13 en `--jpeg` → 8 s @60 fps sans blur ≈ 50 s, avec `--motion-blur 4` ≈ 3–4 min.
Lancer les rendus longs en arrière-plan.

### 6. Vérification
```bash
ffprobe -hide_banner video/intro.mp4        # durée, fps, bt709
ffmpeg -ss 3.2 -i video/intro.mp4 -frames:v 1 -y video/check.png   # puis Read
```
Contrôler 2–3 frames en plein mouvement. Livrer le chemin du fichier + le storyboard final.

## Règles d'or
1. **Déterminisme** : jamais de `Date` réel, d'`fetch` tardif, de `:hover`, d'`autoplay` ; tout piloté par le temps.
2. **Stills avant rendu** : un rendu complet ne sert qu'à valider le mouvement, pas la mise en page.
3. **Easing partout** : aucun `linear` sauf rotations continues / défilements. Préférer out-expo et ressorts.
4. **Stagger** 30–80 ms entre éléments d'un même groupe ; 1 seul point focal à la fois.
5. **Safe area** : garder texte et logo à ≥ 5 % des bords (≥ 10 % en 9:16 pour l'UI des réseaux).
