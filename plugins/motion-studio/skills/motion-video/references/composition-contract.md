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

**Three.js / 3D** — exemple complet : `examples/sketch-3d.html` (égaliseur 3D, bloom, caméra, son).
```html
<script type="importmap">{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/" } }</script>
<script type="module">
  import * as THREE from 'three';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(devicePixelRatio);            // --scale 2 = supersampling
  function draw(ms) { const t = ms / 1000; /* caméra, objets = f(t) */ renderer.render(scene, camera); requestAnimationFrame(draw); }
  requestAnimationFrame(draw);
</script>
```
- **Bibliothèques via CDN, rendu hors ligne** : toute URL `cdn.jsdelivr.net/npm/…`, `unpkg.com/…` ou `esm.sh/…`
  est servie par le renderer depuis un cache npm local (`<home>/libs`, installé au 1er usage). La page reste
  visible telle quelle dans un navigateur ; le rendu ne dépend pas du réseau. **Toujours épingler la version** (`three@0.170.0`).
  Vaut aussi pour GSAP, p5, pixi.js, lottie-web, d3, anime.js…
- **Performance** : le WebGL headless est calculé par le CPU (SwiftShader) : ~2–3 images/s en 1080p avec bloom
  (vs ~9 en 2D). Brouillons en `--fps 30 --jpeg --from/--to`, `--motion-blur 2` max au final, pas d'ombres temps réel
  ni de géométrie énorme. Lancer les rendus 3D en arrière-plan.
- **Bloom** (`UnrealBloomPass`) : le seuil s'applique en linéaire — une couleur sRGB 0.6 vaut ~0.3. Seuil 0.1–0.2,
  force 0.4–0.6 ; vérifier par stills (le bloom brûle vite l'image). Les éléments « lumineux » en
  `MeshBasicMaterial({ toneMapped: false })`.
- **Cadrage** : `camera.setViewOffset(W, H, dx, dy, W, H)` décale le sujet pour laisser la place aux titres HTML
  superposés (plus net que du texte 3D, et `data-sfx` fonctionne dessus).
- **Déterminisme** : positions aléatoires via `Math.random()` (seedé) ; pas de `THREE.Clock` (lire `t`).
- `preserveDrawingBuffer: true` évite des frames noires à la capture.

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
