# Contrat de composition

Une composition est une page HTML autonome. Le renderer (`scripts/render.mjs`) l'ouvre dans Chromium
headless, **remplace le temps** avant l'exécution du moindre script, puis pour chaque frame :

1. avance l'horloge virtuelle jusqu'à `t` (déclenche les `setTimeout`/`setInterval` échus dans l'ordre, puis un tick `requestAnimationFrame`) ;
2. appelle `window.__seek(t_en_secondes)` s'il existe (et attend sa promesse) ;
3. met en pause et positionne **toutes** les animations CSS / transitions / WAAPI (`document.getAnimations()`), les SVG SMIL (`setCurrentTime`) et les `<video>/<audio>` (`currentTime`, attente de `seeked`) ;
4. attend `document.fonts.ready`, capture la frame via CDP (`Page.captureScreenshot`) et la pousse dans ffmpeg.

## Configuration (`<body>` ou `<html>`)

| Attribut | Défaut | Rôle |
|----------|--------|------|
| `data-width` / `data-height` | 1920 / 1080 | Viewport en px CSS |
| `data-fps` | 60 | Cadence de sortie |
| `data-duration` | — (obligatoire) | Durée en secondes |
| `data-seed` | 42 | Graine de `Math.random` |

Les options CLI (`--width`, `--fps`, …) priment sur ces attributs.

## Ce qui est virtualisé

| API | Comportement |
|-----|--------------|
| `performance.now()` | ms virtuelles depuis le chargement (0 à la 1re frame) |
| `Date`, `Date.now()` | époque fixe 2025-01-01T00:00:00Z + temps virtuel |
| `requestAnimationFrame` | 1 appel par frame, avec le timestamp virtuel |
| `setTimeout` / `setInterval` / `requestIdleCallback` | exécutés au temps virtuel exact |
| `Math.random` | PRNG mulberry32 seedé |
| Animations CSS / transitions / `element.animate()` | temps local = `t − naissance` (naissance = instant virtuel de création) |
| SVG SMIL (`<animate>`, `<animateTransform>`…) | `svg.setCurrentTime(t − naissance)` |
| `<video>` / `<audio>` | `currentTime = t − data-start` |

## Recettes par technologie

**CSS pur** — timeline déclarative avec `animation-delay` absolus ; `animation-fill-mode: both|forwards`.
```css
.title { opacity: 0; animation: rise .8s cubic-bezier(.16,1,.3,1) 1.2s forwards; }
```

**Canvas 2D / WebGL** — boucle rAF qui dessine **en fonction de `t`**, pas d'un état incrémenté :
```js
function draw(ms) { const t = ms / 1000; /* positions = f(t) */ requestAnimationFrame(draw); }
requestAnimationFrame(draw);
```
Une simulation à état (physique) fonctionne aussi puisque chaque frame reçoit exactement 1 tick,
mais `--from` saute alors les ticks précédents : préférer les formes closes.

**Hook `__seek` (le plus robuste)** — tout calculer depuis `t` :
```js
window.__seek = (t) => { el.style.transform = `translateX(${easeOut(clamp(t / 2)) * 400}px)`; };
```

**GSAP** — fonctionne tel quel (il lit rAF + `performance.now`). Pour un contrôle strict :
```js
const tl = gsap.timeline({ paused: true }); /* … */
window.__seek = (t) => tl.seek(t, false);
```

**Lottie** — `lottie.loadAnimation({ autoplay: false, … })` puis `window.__seek = t => anim.goToAndStop(t * 1000, false)`.

**Three.js** — `renderer.render(scene, camera)` dans le rAF ou dans `__seek` ; pour la capture, ajouter
`preserveDrawingBuffer: true` si des frames sortent noires.

**Vidéo embarquée** — `<video src="clip.mp4" data-start="2.5" muted playsinline preload="auto">` : jamais `autoplay`.

## Pièges fréquents

- **Polices** : une police réseau non chargée au 1er frame → saut de mise en page. Utiliser `@font-face` local,
  ou `<link rel="preload" as="font">` ; le renderer attend `document.fonts.ready` mais pas un CSS injecté tard.
- **Transitions déclenchées par classe** : OK (naissance = instant du timer), mais la transition doit exister
  dans le style *avant* l'ajout de classe.
- **`vw`/`vh`** : autorisés, mais la composition est pensée pour une taille fixe → préférer px pour la précision.
- **Animations infinies** : acceptées, elles sont seekées modulo leur itération.
- **Texte fin / traits 1px** : `--scale 2` supprime le scintillement ; éviter les traits < 2px en 1080p.
- **Fonds** : toujours définir `background` sur `html, body`, sinon blanc (ou transparent avec `--transparent`).
- **Gradients sur grands aplats sombres** : banding en H.264 → ajouter un léger grain (canvas noise 2–3 %) ou `--crf 12`.
