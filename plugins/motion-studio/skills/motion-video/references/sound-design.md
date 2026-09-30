# Son synchronisé

Deux directions, combinables. Dans les deux cas la synchro est **exacte à l'échantillon près** : les
cues sont horodatés avec le temps virtuel du renderer, puis mixés en JS (48 kHz) et normalisés à −14 LUFS.

## 1. Le son suit l'image (bruitages)

### Déclaratif : `data-sfx` sur un élément animé
Le son part **au démarrage de l'animation** de l'élément (naissance + `animation-delay` / `delay` WAAPI).
```html
<h1 class="title" data-sfx="whoosh" data-sfx-gain=".6">Titre</h1>
<path class="logo" data-sfx="impact" …/>
<span data-sfx="tick?pitch=1.2" data-sfx-pan="auto">A</span>
```
| Attribut | Rôle |
|----------|------|
| `data-sfx` | Son synthétisé (`pop`, `whoosh?dur=.8`…) ou fichier (`sfx/click.wav`, relatif à la composition) |
| `data-sfx-on` | Nom(s) d'animation déclencheurs (`rise,leave`) ; défaut = la première animation de l'élément |
| `data-sfx-gain` | Volume 0..1+ |
| `data-sfx-pan` | −1 (gauche) … 1 (droite), ou `auto` = position horizontale de l'élément |
| `data-sfx-offset` | Décalage en s (ex. `-0.05` pour anticiper un impact) |

### Impératif : `window.__sfx(src, { at, gain, pan, align, id })`
```js
__sfx('riser?dur=2', { at: 2.1, align: 'end' });   // se TERMINE à 2.1 s (montée vers l'impact)
__sfx('glitch', { gain: .4 });                       // maintenant (temps virtuel courant)
```
Idempotent (clé `src@at` ou `id`) : on peut l'appeler depuis `__seek` ou un rAF à chaque frame.
Utiliser `window.__sfx?.(…)` pour que la page reste jouable dans un navigateur normal.

### Pistes : `<audio src="voix.mp3" data-start="1.5" data-volume=".9">`
Mixée à partir de `data-start` (voix off, jingle). Jamais `autoplay`.

## 2. L'image suit le son (musique)

`--audio music.mp3` mixe la piste **et** l'analyse (tempo, beats, onsets, énergie) puis injecte
`window.__audio` avant les scripts de la page :

| API | Retour |
|-----|--------|
| `__audio.bpm`, `.beats[]`, `.onsets[]` | Tempo, grille de temps (s), attaques détectées (s) |
| `__audio.level(t)` / `.bass(t)` | Énergie globale / basses 0..1 à l'instant t (100 Hz, interpolé) |
| `__audio.beat(t)` | `{ index, since, phase 0..1, pulse }` — `pulse` = 1 sur le beat, décroît vite |
| `__audio.nextBeat(t)` | Premier beat ≥ t (caler une entrée sur la musique) |

```js
const a = window.__audio;
setTimeout(showCards, (a ? a.nextBeat(3.6) : 3.6) * 1000);          // entrée calée sur un temps
el.style.scale = 1 + 0.05 * (a ? a.beat(t).pulse : 0);               // pulsation sur le beat
glow = base * (1 + a.bass(t));                                         // halo qui respire avec la basse
```
Précision de l'analyse : ±10 ms sur une musique rythmée. Pour une grille exacte : `--beats beats.json`
(`{ "bpm": 120, "beats": [...] }`, produit par `sfx.mjs bed` ou saisi à la main).

## Bibliothèque de sons synthétisés (`scripts/sfx.mjs`)

`node sfx.mjs list` — tous générés en code, déterministes, sans licence :
`pop` · `tick` · `click` · `whoosh` · `swoosh` · `riser` · `impact` · `chime` · `glitch` · `kick` · `hat` · `pad`.
Paramètres en query string : `whoosh?dur=1.2&from=200&to=3000`, `tick?pitch=1.3`, `chime?note=76`.

Musique de fond sur grille de tempo (pad + kick + hat + basse, i–VI–III–VII) :
```bash
node sfx.mjs bed --bpm 120 --duration 8 --start 2.1 -o bed.wav > bed.json   # drums entrent à 2.1 s
```

## Grammaire sonore (ce qui marche)

| Événement visuel | Son | Astuce |
|------------------|-----|--------|
| Révélation logo / titre | `riser` (align end) → `impact` | Le riser se termine *exactement* sur l'impact |
| Élément qui traverse / transition | `whoosh` (durée ≈ mouvement) | Commencer 50–100 ms avant le mouvement |
| Apparition de cartes, icônes | `pop` pitch croissant | Stagger sur les croches (`60/bpm/2`) |
| Lettres, compteurs | `tick` gain .3, pitch croissant, pan auto | Faible volume, sinon mitraillette |
| Tagline / CTA / succès | `chime` | Sur un temps fort de la musique |
| Erreur, rupture | `glitch` | Avec un glitch visuel de 2–4 frames |

- Mixer les bruitages **sous** la musique (gain .3–.7), l'impact seul peut être à 1.
- Pas plus de 2–3 sons simultanés ; laisser respirer entre deux actions.
- Couper les entrées sur les temps forts (beat 1 de la mesure) ; les détails sur les croches.
