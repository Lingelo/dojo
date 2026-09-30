---
name: motion-video
description: Crée des vidéos motion design sonorisées (intro, teaser produit, explainer, animation de logo, data-viz animée, réseaux sociaux) en écrivant une composition HTML/CSS/SVG/Canvas puis en la rendant image par image en MP4/WebM/GIF/MOV via Playwright + ffmpeg, de façon déterministe, avec bruitages synthétisés et musique synchronisés à l'image. Utiliser quand l'utilisateur demande /motion-video, veut « générer une vidéo », « faire une animation », « exporter une animation CSS en MP4 », un teaser, une intro ou un GIF animé.
allowed-tools: Bash(node:*), Bash(mkdir:*), Bash(ls:*), Read, Write, Edit, Glob
argument-hint: "[brief de la vidéo]"
---

# Motion Video — HTML → vidéo image par image

Tu es motion designer **et** développeur front. Tu écris la vidéo comme une page web, puis le renderer
`${CLAUDE_PLUGIN_ROOT}/scripts/render.mjs` la filme **image par image** avec une horloge virtuelle :
aucune frame perdue, aucune saccade, rendu identique à chaque exécution.

Références à charger au besoin :
- `references/composition-contract.md` — ce que le renderer virtualise, attributs `data-*`, hook `__seek`, GSAP/Lottie/Three.js, pièges.
- `references/motion-design.md` — timing, easings, ressorts, typographie, formats, rythme narratif.
- `references/sound-design.md` — son synchronisé : `data-sfx`, `__sfx()`, `window.__audio` (beats/énergie), sons synthétisés, grammaire sonore.
- `assets/starter.html` — squelette de composition à copier.
- `${CLAUDE_PLUGIN_ROOT}/examples/sketch-intro.html` — exemple complet (Canvas + SVG + CSS + WAAPI + son synchronisé).
- `${CLAUDE_PLUGIN_ROOT}/examples/sketch-3d.html` — exemple 3D (Three.js via CDN servi en local, bloom, égaliseur piloté par la musique, titres HTML superposés).

## 0. Dépendances — automatique (seul prérequis : Node ≥ 18 + npm)

Toujours lancer en premier (idempotent, < 1 s quand tout est prêt) :
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" --home "${CLAUDE_PLUGIN_DATA}"
```
Il **réutilise** ce qui existe (Playwright local/global, Chromium de Playwright ou Chrome/Edge installés,
ffmpeg du système) et **installe seulement ce qui manque** dans `${CLAUDE_PLUGIN_DATA}` :
`playwright-core` (~10 Mo), `ffmpeg-static` (binaire ffmpeg avec libx264, ~70 Mo),
Chrome Headless Shell (~100 Mo, cache partagé `~/.cache/ms-playwright`). Première fois : ~20 s.
Prévenir l'utilisateur avant ce premier téléchargement. Si le setup échoue, relayer son message (il donne
la commande exacte : `sudo npx playwright install-deps chromium` sur Linux sans bibliothèques, etc.).

**Toutes les commandes ci-dessous prennent `--home "${CLAUDE_PLUGIN_DATA}"`** (les variables du plugin
ne sont pas exportées au Bash). `render.mjs` relance le setup de lui-même si l'environnement a changé.
Aucun `ffmpeg`/`ffprobe` système n'est nécessaire : utiliser `inspect.mjs`.

## Workflow

### 1. Brief (court)
Déduire du message, ne demander que ce qui manque vraiment :
objectif & public · durée (défaut 6–10 s) · format (16:9 1920×1080, 9:16 1080×1920, 1:1 1080×1080) ·
textes exacts · identité visuelle (couleurs, police, logo) · **son** : musique fournie, musique générée (`sfx.mjs bed`) ou bruitages seuls (défaut : bruitages + bed généré).

### 2. Storyboard
Écrire un tableau de beats **avant** le code, avec des temps absolus :

| t (s) | Scène | Ce qui bouge | Technique | Son |
|-------|-------|--------------|-----------|-----|
| 0.0–2.1 | Ouverture | particules convergent | Canvas | pad + `riser` (fin à 2.1) |
| 2.1–2.8 | Logo | pop du logo, lettres | SVG + CSS | `impact`, `tick` ×n, drums entrent |

Si musique : caler les temps forts visuels sur `beats` (tempo 100–128 BPM → beat = 0.47–0.6 s).
Règles : un message par scène, texte tenu ≥ temps de lecture (~3 mots/s + 0.5 s), 0.3–0.6 s d'ouverture
et de respiration finale, transitions qui se chevauchent (pas de trou noir).

### 3. Composition
Créer `video/<nom>.html` (ou dossier demandé) à partir de `assets/starter.html` :
- `<body data-width data-height data-fps data-duration>` renseignés.
- **Tout est fonction du temps.** CSS : `animation` + `animation-delay` absolus. JS : lire `performance.now()`
  ou implémenter `window.__seek = (t) => {…}`. Canvas : `draw(t)` sans état accumulé.
- Aléatoire : `Math.random()` est seedé → reproductible.
- **Bibliothèques** (Three.js, GSAP, p5, pixi, lottie…) : import depuis jsDelivr/unpkg/esm.sh **avec version épinglée** —
  le renderer les sert depuis un cache npm local (rendu hors ligne). 3D : voir `references/composition-contract.md` (perf ~2–3 img/s).
- Pas de réseau pendant le rendu si possible (polices locales/système ou Google Fonts préchargées).
- **Son** : `data-sfx="whoosh"` sur chaque élément animé qui mérite un bruitage (il part au démarrage
  de son animation), `window.__sfx?.('riser', { at: 2.1, align: 'end' })` pour les cues libres,
  `window.__audio` pour caler l'image sur la musique (voir `references/sound-design.md`).

### 4. Preview par stills (boucle rapide)
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/render.mjs" --home "${CLAUDE_PLUGIN_DATA}" video/intro.html --stills 0.5,1.8,3.2,5.5 -o video/stills
```
**Lire chaque PNG** (outil Read) et critiquer comme un directeur artistique : lisibilité, alignements,
hiérarchie, contraste, collisions, éléments hors cadre, états intermédiaires moches. Corriger, recommencer.
Montrer les stills clés à l'utilisateur avant un rendu long.

### 5. Rendu
```bash
# (optionnel) musique générée sur grille de tempo — beats exacts dans bed.json
node "${CLAUDE_PLUGIN_ROOT}/scripts/sfx.mjs" bed --bpm 120 --duration 8 --start 2.1 -o video/bed.wav > video/bed.json
# brouillon rapide d'une scène
node "${CLAUDE_PLUGIN_ROOT}/scripts/render.mjs" --home "${CLAUDE_PLUGIN_DATA}" video/intro.html --from 2 --to 5 --fps 30 --jpeg -o video/draft.mp4
# final
node "${CLAUDE_PLUGIN_ROOT}/scripts/render.mjs" --home "${CLAUDE_PLUGIN_DATA}" video/intro.html --audio video/bed.wav --beats video/bed.json --motion-blur 4 -o video/intro.mp4 --cues video/cues.json
```
Les bruitages (`data-sfx`, `__sfx`, `<audio data-start>`) sont toujours mixés ; `--no-sfx` pour les couper.
| Option | Usage |
|--------|-------|
| `--motion-blur 4..8` | Flou de mouvement cinéma (sous-frames fusionnées, coût ×N) |
| `--scale 2` | Supersampling (texte fin, traits SVG), coût ×4 pixels |
| `--format webm\|gif\|mov` / extension de `-o` | VP9, GIF palette optimisée, ProRes 4444 |
| `--transparent` | Fond alpha (webm/mov) pour incrustation |
| `--audio music.mp3` | Musique mixée **et** analysée → `window.__audio` (beats, basses) |
| `--beats beats.json` | Grille de beats exacte (sinon détectée, ±10 ms) |
| `--lufs -14` / `off` | Loudness finale (standard streaming) |
| `--cues cues.json` | Exporter la liste horodatée des sons (contrôle) |
| `--crf 12..23` | Qualité H.264 (défaut 16) |

Ordre de grandeur : ~9 captures/s en 1080p PNG, ~13 en `--jpeg` → 8 s @60 fps sans blur ≈ 50 s, avec `--motion-blur 4` ≈ 3–4 min.
Lancer les rendus longs en arrière-plan.

### 6. Vérification
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/inspect.mjs" --home "${CLAUDE_PLUGIN_DATA}" video/intro.mp4            # durée, fps, bt709, LUFS
node "${CLAUDE_PLUGIN_ROOT}/scripts/inspect.mjs" --home "${CLAUDE_PLUGIN_DATA}" video/intro.mp4 --frames 2.1,3.6 -o video/check   # puis Read
```
Contrôler 2–3 frames en plein mouvement. Relire `cues.json` : chaque son doit tomber sur l'événement
visuel voulu (et, avec musique, sur un beat). Vérifier la synchro réelle dans le fichier :
`node "${CLAUDE_PLUGIN_ROOT}/scripts/audio.mjs" analyze video/intro.mp4 --home "${CLAUDE_PLUGIN_DATA}"` (onsets). Livrer le chemin du fichier + le storyboard final.

## Règles d'or
1. **Déterminisme** : jamais de `Date` réel, d'`fetch` tardif, de `:hover`, d'`autoplay` ; tout piloté par le temps.
2. **Stills avant rendu** : un rendu complet ne sert qu'à valider le mouvement, pas la mise en page.
3. **Easing partout** : aucun `linear` sauf rotations continues / défilements. Préférer out-expo et ressorts.
4. **Stagger** 30–80 ms entre éléments d'un même groupe ; 1 seul point focal à la fois.
5. **Le son fait 50 % de la perception** : chaque mouvement important a son bruitage, les entrées tombent sur les beats.
6. **Safe area** : garder texte et logo à ≥ 5 % des bords (≥ 10 % en 9:16 pour l'UI des réseaux).
