# Voix off et sous-titres

Deux briques indépendantes, combinables avec le son synchronisé (`sound-design.md`) :

| Besoin | Outil | Résultat |
|--------|-------|----------|
| Faire **lire** un texte (voix off) | `scripts/voice.mjs` | `narration.wav` + `voice.json` (timeline réelle) + `subs.srt/.vtt` |
| **Sous-titres** incrustés | `render.mjs --voice voice.json` ou `--subs fichier.srt` | texte brûlé dans l'image + `.srt/.vtt` à côté de la vidéo |

## 1. Voix off

Écrire le script (`video/narration.json`) — **une phrase par ligne**, courte (le minutage intra-ligne est estimé) :
```json
{ "lang": "fr", "voice": "Thomas", "rate": 1, "gap": 0.35, "start": 0.4,
  "lines": [
    "Bienvenue dans Motion Studio.",
    { "text": "Tout s'écrit comme une page web.", "pause": 0.6 },
    { "id": "cta", "text": "Essayez-le.", "at": 9.5 },
    { "text": "Texte affiché", "file": "ma-voix.wav" }
  ] }
```
| Champ | Rôle |
|-------|------|
| `lang` | `fr`, `en`, `es`… (choix de la voix par défaut) |
| `voice` | Nom de voix du moteur (`Thomas`, `Amelie`, `fr`, nom SAPI…) — facultatif |
| `rate` | Vitesse (1 = normal, 0.9 = posé) ; par ligne possible |
| `gap` / `pause` | Silence après chaque ligne (défaut 0.35 s) / pour une ligne |
| `start` | Début de la 1re ligne (défaut 0.4 s) |
| `at` | Temps absolu d'une ligne (ex. caler sur une scène) — prévient en cas de chevauchement |
| `file` | Enregistrement existant (n'importe quelle voix / service) au lieu de synthétiser ; `text` sert au sous-titre |
| `caption` | Texte du sous-titre s'il diffère de ce qui est dit (ex. chiffres, sigles à épeler) |
| `engine` | Moteur imposé (`piper`, `say`…) : à épingler pour qu'une voix publiée reste la même sur toute machine (`auto` choisit `say` sur Mac) |

**Prononciation** : une voix française lit les anglicismes à la française (« brainstorm » → « brin-storm »).
Réécrire *ce qui est dit* phonétiquement et garder l'orthographe dans `caption` :
`{ "text": "Le brène-storm définit…", "caption": "Le brainstorm définit…" }`. Faire écouter 3–4 variantes
(`say -v Thomas -o v1.aiff "…"`, ou le moteur final) à l'utilisateur : la meilleure graphie dépend du moteur.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/voice.mjs" engines                       # moteurs détectés
node "${CLAUDE_PLUGIN_ROOT}/scripts/voice.mjs" video/narration.json -o video/voice --home "${CLAUDE_PLUGIN_DATA}"
```
Sortie : le début/fin **réels** de chaque ligne. **Construire le storyboard sur ces temps** (pas
l'inverse) : la scène « logo » commence quand la phrase « voici… » commence. Les lignes sont mises en
cache (hash du texte + voix) : relancer est instantané tant que le texte ne change pas.
Un fichier texte brut (une ligne = une phrase) est aussi accepté à la place du JSON.

### Moteurs et installation guidée

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/voice-setup.mjs" --lang fr                 # état + recommandation
node "${CLAUDE_PLUGIN_ROOT}/scripts/voice-setup.mjs" install piper --lang fr   # puis edge | espeak
```
| Moteur | Où | Qualité | Prérequis / installation |
|--------|----|---------|--------------------------|
| `say` | macOS | bonne (`Thomas`, `Amelie`) | préinstallé |
| `sapi` | Windows | correcte | préinstallé |
| `piper` | **local**, gratuit, tous OS | **très bonne** (neuronal) | Python ≥ 3.8 ; `install piper` crée un venv privé, `pip install piper-tts`, télécharge la voix (~60 Mo : fr, en, es, de, it). Sans sudo. |
| `edge` | **en ligne**, gratuit, sans clé | très bonne (`fr-FR-DeniseNeural`, `fr-FR-HenriNeural`, `en-US-AriaNeural`…) | Python ≥ 3.8 ; `install edge`. Le **texte part chez Microsoft**, service non officiel (peut changer). Jamais choisi en `auto` : `--engine edge` ou `"engine": "edge"` dans le script. |
| `espeak` | Linux | robotique, dépannage | `sudo apt install espeak-ng` (le script le fait seul si root/sudo sans mot de passe, sinon donne la commande) |

Choix `auto` (moteurs locaux uniquement) : piper > say > sapi > espeak. Forcer avec `--engine`. Les paquets Python sont dans
`${CLAUDE_PLUGIN_DATA}/voice-venv`, les voix Piper dans `${CLAUDE_PLUGIN_DATA}/voices` (désinstallés avec le plugin).
Autre voix Piper : poser un `.onnx` (+ `.onnx.json`) dans `voices/` ou `PIPER_MODEL=/chemin/voix.onnx`.
Avec `espeak` seul, **prévenir** que la voix sera mécanique et proposer Piper. Pour une voix de qualité « studio » :
l'utilisateur fournit un enregistrement (champ `file`).

## 2. Sous-titres

```bash
# voix off + sous-titres (style par défaut : bas de l'écran)
node "${CLAUDE_PLUGIN_ROOT}/scripts/render.mjs" video/intro.html --voice video/voice/voice.json -o video/intro.mp4
# karaoké (mot courant mis en accent), piste souple en plus, sans voix off
node "${CLAUDE_PLUGIN_ROOT}/scripts/render.mjs" video/intro.html --subs video/fr.srt --captions karaoke --embed-subs -o video/intro.mp4
```
| Option | Rôle |
|--------|------|
| `--voice voice.json` | Mixe la narration au-dessus, **baisse la musique** pendant qu'elle parle (`--duck -9` dB, `off`), sous-titres repris de `voice.json` |
| `--subs f.srt\|.vtt\|.json` | Sous-titres d'une source externe (remplace ceux de `voice.json`). JSON : `[{ "start": 1, "end": 3, "text": "…" }]` |
| `--captions bottom\|karaoke\|center\|off` | Style incrusté ; `off` = rien d'incrusté (la page dessine ses propres sous-titres) |
| `--embed-subs` | Ajoute aussi une piste souple activable dans le lecteur (mp4 `mov_text`, webm `webvtt`) |

Toujours produits à côté de la vidéo : `<sortie>.srt` et `<sortie>.vtt` (recalés si `--from/--to`).
Les `.srt` peuvent être traduits puis ré-incrustés via `--subs`. Pas de sous-titres dans un GIF.

L'incrustation est pilotée par le temps virtuel (fondu de 0,12 s, aucun état) ; elle hérite de la police
du `body` et de `--accent` (variable CSS de `:root`) pour le mot actif. Taille ≈ 4,6 % de la hauteur ;
en 9:16 elle remonte à 17 % du bas pour éviter l'interface des réseaux. Garder cette zone libre dans la composition.
Ajuster la longueur des cues avec `"maxChars"` dans le script (défaut 42 ; **24–28 en 9:16**).

### Sous-titres dessinés par la composition (`--captions off`, ou en plus)

`window.__captions` est injecté avant la page quand des sous-titres existent :

| API | Retour |
|-----|--------|
| `__captions.cues[]` | `{ start, end, text, words: [{ w, start, end }] }` |
| `__captions.at(t)` / `.word(t)` | cue / mot actif à t (ou `null`) |
| `__captions.line(t)` | ligne **dite** active (`{ id, text, start, end }`) — l'image suit la voix |
| `__captions.speaking(t)` | `true` pendant la parole (ex. baisser une animation d'arrière-plan) |

```js
window.__seek = (t) => {
  const c = window.__captions?.at(t);
  cap.textContent = c ? c.text : '';
  mouth.style.scale = window.__captions?.speaking(t) ? 1 : 0.6;
};
```
Les temps par mot sont **estimés** (proportionnels aux lettres) : précis à ~100 ms sur une phrase courte, pas un alignement
forcé. Pour un karaoké exact, garder des lignes courtes.

## Règles

1. **Texte d'abord** : rédiger la narration (~2,5 mots/s en français parlé), puis `voice.mjs`, puis storyboard sur la durée réelle.
2. Un sous-titre ≤ 42 caractères, 1–2 lignes, ≥ 1 s à l'écran ; ne pas dupliquer un gros titre déjà lisible à l'écran.
3. Laisser 0,4 s avant la 1re phrase et 0,5 s après la dernière : `data-duration` ≥ `voice.duration + 0,5`.
4. Les bruitages se mixent sous la voix : gain .3–.5 pendant la narration, pas de riser qui couvre une phrase.
5. Vérifier par stills **à l'intérieur d'une phrase** (`--stills`) : lisibilité, contraste, zone sûre, pas de collision avec le contenu.
