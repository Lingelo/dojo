# Principes de motion design (aide-mémoire)

## Durées

| Mouvement | Durée |
|-----------|-------|
| Micro (icône, puce, pop) | 200–400 ms |
| Entrée d'un texte / carte | 500–900 ms |
| Transition de scène | 600–1200 ms |
| Tenue d'un titre | temps de lecture + 0.5 s (≈ 3 mots/s) |
| Stagger entre éléments frères | 30–80 ms (lettres 25–45 ms) |

## Easings (tokens)

```css
--out-expo:   cubic-bezier(0.16, 1, 0.3, 1);     /* entrées : rapide puis se pose */
--in-out:     cubic-bezier(0.65, 0, 0.35, 1);    /* déplacements d'un point A à B */
--in-expo:    cubic-bezier(0.7, 0, 0.84, 0);     /* sorties : accélère et disparaît */
--back-out:   cubic-bezier(0.34, 1.56, 0.64, 1); /* léger dépassement */
/* ressort amorti, via linear() (Chrome 113+) */
--spring: linear(0, 0.009, 0.035 2.1%, 0.141, 0.281 6.7%, 0.723 12.9%, 0.938 16.7%, 1.017, 1.077, 1.121,
  1.149 24.3%, 1.159, 1.163, 1.161, 1.154 29.9%, 1.129 32.8%, 1.051 39.6%, 1.017 43.1%, 0.991, 0.977 51%,
  0.974 53.8%, 0.975 57.1%, 0.997 69.8%, 1.003 76.9%, 1);
```
Ressort en JS (forme close, pour Canvas / `__seek`) :
```js
const spring = (t, { k = 170, c = 26, m = 1 } = {}) => {        // t en s → 0..~1
  const w0 = Math.sqrt(k / m), z = c / (2 * Math.sqrt(k * m));
  if (z < 1) { const wd = w0 * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t)); }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
};
```

## Les 12 principes, version écran
- **Anticipation** : petit recul (−4 %) avant un grand mouvement.
- **Follow-through / overlap** : les enfants arrivent après le parent (stagger), rien ne s'arrête net.
- **Arcs** : combiner translate X et Y avec des easings différents pour des trajectoires courbes.
- **Squash & stretch** léger sur les pops (scale 1.08 → 1).
- **Staging** : un seul point focal ; atténuer (opacity .4, blur) ce qui ne parle pas.
- **Parallaxe** : 2–3 plans à vitesses différentes donnent de la profondeur à peu de frais.

## Structure narrative (10–30 s)
1. **Hook** (0–1.5 s) : mouvement fort ou question.
2. **Révélation** : logo / titre / produit.
3. **Preuve** : 2–4 points (cartes, chiffres qui comptent, UI animée).
4. **Call-to-action** : tagline + URL, tenue ≥ 2 s.
5. **Sortie** : fondu 0.4–0.8 s ou cut sur le beat.

## Formats

| Usage | Taille | fps | Remarque |
|-------|--------|-----|----------|
| YouTube / présentation | 1920×1080 | 60 (UI) / 30 (doux) | 16:9 |
| Reels / TikTok / Shorts | 1080×1920 | 30 | safe area 10 % haut/bas |
| LinkedIn / Instagram feed | 1080×1080 ou 1080×1350 | 30 | sous-titres incrustés |
| README / doc | ≤ 960 px de large | 20–30 | GIF (`-o x.gif`) ou MP4 muet en boucle |

## Typographie vidéo (1080p)
- Titre 96–160 px, sous-titre 40–56 px, corps ≥ 28 px ; interlettrage négatif sur les titres (-0.02 à -0.04em).
- Contraste ≥ 7:1 sur fonds animés ; ombre douce plutôt que contour.
- Max ~7 mots par écran.

## Couleur & rendu
- Fond sombre légèrement teinté (#0b0d12) plutôt que noir pur ; 1 couleur d'accent + 1–2 secondaires.
- Halo/glow : `radial-gradient` ou `globalCompositeOperation = 'lighter'` sur Canvas.
- Vignette discrète pour centrer le regard.
- Motion blur (`--motion-blur 4`) sur tout mouvement rapide : c'est ce qui fait « vidéo » et pas « page web ».
