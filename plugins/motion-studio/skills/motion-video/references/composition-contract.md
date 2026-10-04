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
| `data-quality` | standard | Niveau de rendu exposé en `window.__quality` (voir plus bas) |

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

## Niveau de rendu (`--quality draft|standard|high`)

Le renderer expose `window.__quality` avant tout script. La composition décide ce que chaque niveau coûte ;
**même scène à tous les niveaux, seule la finesse change** (sinon un brouillon ne valide rien) :
```js
const QUALITY = window.__quality ?? 'standard';   // aperçu navigateur : standard
const HQ = QUALITY === 'high';
if (QUALITY === 'draft') renderer.shadowMap.enabled = false;            // itérer vite
const tube = new THREE.TubeGeometry(curve, HQ ? 2400 : 900, 0.05, HQ ? 20 : 10);
if (HQ) { sun.shadow.mapSize.set(4096, 4096); /* + EffectComposer avec GTAOPass (ombres de contact) */ }
```
- **Explicite, jamais déduit de la machine** (`hardwareConcurrency`, mesure de vitesse…) : même option = mêmes
  images partout ; seule la durée du rendu varie d'une machine à l'autre.
- **Des polygones seuls ne se voient pas** : subdiviser sans ajouter de forme (octave de bruit, chanfrein,
  pièces manquantes) ne change rien à l'écran. Ajouter de la *forme*, pas seulement des triangles.
- **Le levier dépend des matières** : une scène mate (pierre, papier, sable) gagne avec l'occlusion ambiante
  (`GTAOPass`) et des ombres fines ; une carte d'environnement (`RoomEnvironment`) l'éclaire en double, remplit
  les ombres et la délave — elle sert aux matières brillantes (métal, laque, verre). Comparer par stills.
- Ordre de grandeur mesuré (Mac Apple Silicon, scène kaizen) : `high` ≈ `standard` en vitesse ; ne pas
  supposer que « high = lent », mesurer avec `--from/--to`.

## Temps du récit ≠ temps réel (ralentir pour lire)

Pour donner du temps de lecture sans recaler toutes les constantes : écrire la composition en **temps du récit**
et laisser une table le parcourir plus lentement pendant les passages à lire. Sons et voix suivent la même table.
```js
const READ = [[3.6, 8.3], [13.5, 17.5]], SLOW = 0.68, RAMP = 0.5;   // intervalles du récit à lire, vitesse
const speedAt = (s) => 1 - (1 - SLOW) * Math.max(0, ...READ.map(([a, b]) => sstep(clamp((s - a) / RAMP)) * sstep(clamp((b - s) / RAMP))));
// REAL[i] = ∫ ds / speedAt(s) (table pas à pas) → realAt(s) par interpolation, storyAt(t) par dichotomie
window.__seek = (t) => sceneAt(storyAt(t));
const sfx = (src, at) => window.__sfx?.(src, { at: realAt(at) });  // sons écrits en temps du récit
```
Mettre `data-duration` à `realAt(fin)`, et les `"at"` de `narration.json` à `realAt(début de chaque réplique)`.
Exemple complet : `plugins/kaizen/docs/media/source/kaizen-presentation.html`.

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
- **Déterminisme** : pas de `THREE.Clock` (lire `t`). Attention : Three.js consomme `Math.random` pour l'UUID de
  **chaque objet créé** (et certains modules, comme `Pass.js` d'`EffectComposer`, en créent dès l'import). Ajouter un
  objet ou un import plus haut décale toute la séquence seedée ; et des objets créés selon `__quality` donnent une
  séquence différente par niveau. Pour des positions stables, tirer d'un **hachage** (`fract(sin(i·k)·43758.5)`).
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
