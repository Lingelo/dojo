# Configuration

Kaizen se configure par repo, dans deux fichiers JSON :

| Fichier | Versionné ? | Rôle |
|---|---|---|
| `.kaizen/config.json` | oui | réglages d'équipe |
| `.kaizen/config.local.json` | non (ajouté à `.gitignore` par `setup`) | surcharges personnelles, clé par clé |

`config.local.json` l'emporte sur `config.json`, **sauf pour `docs_root`**. L'emplacement des
documents est une décision d'équipe : il n'est lu que dans `config.json`.

Voir la configuration effective : `node $K config`. Créer le fichier : `/kaizen:setup` ou
`node $K init`.

## Exemple complet

```json
{
  "docs_root": "docs",
  "language": "auto",
  "tracker": "auto",
  "profile": "standard",
  "verify": {
    "test": "pnpm vitest run",
    "lint": "pnpm eslint .",
    "typecheck": "pnpm tsc --noEmit",
    "audit": "pnpm audit --audit-level high"
  },
  "gate": {
    "enabled": true, "max_blocks": 3, "timeout_seconds": 600, "budget_seconds": 840, "max_age_hours": 24,
    "targeted": { "test": "pnpm vitest related --run {files}", "lint": "pnpm eslint {files}" }
  },
  "review": { "require_before_push": true, "max_unreviewed_lines": 80 },
  "pr": { "max_lines": 400, "ignore": ["*.lock", "pnpm-lock.yaml", "dist/**", "*.snap"] },
  "packs": [
    { "source": "kaizen-packs/house-rules" },
    { "source": "https://github.com/acme/kaizen-packs", "ref": "v1.2.0", "pack": ["rails"] }
  ]
}
```

## Les clés

### `docs_root`

Défaut : `"docs"`. Dossier racine des documents : `plans/`, `learnings/`, `ideation/`, `adr/`,
`postmortems/` et `metrics/` vivent dessous. Le chemin doit être relatif, rester dans le repo, et ne
pas être `.git`. Une valeur invalide est **refusée**, jamais remplacée en silence par `docs`.
Changez-la si `docs/` est déjà un site de documentation publié, par exemple `"engineering"`.

### `language`

Défaut : `"auto"`, c'est-à-dire la langue de la conversation. Mettez `"fr"` ou `"en"` pour imposer
la langue des **titres de sections** des documents. Les marqueurs `<!-- kaizen:… -->`, les clés de
frontmatter et les identifiants (R1, AE1, KTD1, U1) ne sont jamais traduits.

### `tracker`

Défaut : `"auto"`. Kaizen lit la clé Jira dans le nom de branche (`feat/SHOP-412-…` donne
`SHOP-412`), comme le plugin `git`, et lit les issues GitHub via `gh`. La clé sert dans les messages
de commit (`feat(SHOP-412): …`) et dans le frontmatter des plans.

### `profile`

Défaut : `"standard"`. Règle la **cérémonie** du cycle, jamais les garde-fous déterministes
(garde-fou du hook `Stop`, `verify`, `size`, `plan check`, revue exigée avant `git push`).

| Profil | Pour qui | Ce qui change |
|---|---|---|
| `lean` | première adoption, petite équipe, prototype | plan court (menaces et déploiement seulement sur surface à risque), `doc-review` réduit à `plan check` + cohérence, revue au socle + sécurité si besoin, `autopilot` sans plan écrit pour un changement ≤ ~30 lignes sans risque |
| `standard` | la plupart des équipes | le cycle tel que décrit dans les guides |
| `full` | domaines régulés, équipe rodée | menaces et déploiement toujours, relecteur adversarial systématique sur le plan et dès la revue ciblée |

Le chemin recommandé : commencer en `lean`, puis monter quand l'équipe a pris le rythme. Une valeur
inconnue retombe sur `standard` et est signalée par `node $K config` (`profile_warning`).

### `verify`

Défaut : `{}`, c'est-à-dire **détection automatique**. Ce sont les commandes que lancent
`node $K verify`, `/kaizen:work` et le garde-fou. Vos valeurs s'ajoutent à la détection et la
remplacent clé par clé.

| Clé | Rôle | Lancée par défaut ? |
|---|---|---|
| `test` | tests | oui |
| `lint` | lint | oui |
| `typecheck` | typage | oui |
| `audit` | audit des dépendances (réseau, lent) | **non** : seulement `verify --only audit` (fait par `work` quand des dépendances changent) |
| autre nom | toute vérification à vous | oui |

Stacks détectées :
- Node (npm, pnpm, yarn, bun ; le script de test bidon de `npm init` est ignoré) ;
- Python (pytest, ruff, mypy, via uv ou poetry) ;
- Go, Rust ;
- Maven, Gradle ;
- Ruby (rspec, rubocop) ;
- PHP (phpunit) ;
- `make test`.

Voir ce qui est détecté : `node $K detect`.

> Une commande qui échoue **déjà** sur la branche par défaut fera bloquer le garde-fou à tort.
> `/kaizen:setup` la lance une fois pour le vérifier.

### `gate` — le garde-fou du hook `Stop`

| Clé | Défaut | Rôle |
|---|---|---|
| `enabled` | `true` | `false` désactive le garde-fou pour ce repo |
| `max_blocks` | `3` | après N blocages consécutifs, laisse terminer en exigeant que l'échec soit signalé |
| `timeout_seconds` | `600` | délai maximum par commande de vérification |
| `targeted` | `{}` | commandes **ciblées** pour le garde-fou, avec `{files}` remplacé par les fichiers touchés par la branche (non commité et nouveaux fichiers compris) ; elles remplacent les commandes de même nom à chaque fin de tour. Aucun fichier touché → sautées. La vérification complète reste celle de `work` et `ship` |
| `budget_seconds` | `840` | temps total des vérifications à chaque fin de tour, sous le délai du hook (900 s) ; les commandes qui n'ont pas pu démarrer sont signalées, pas comptées rouges |
| `max_age_hours` | `24` | un garde-fou actif depuis plus longtemps (session interrompue) se désactive tout seul |

Le garde-fou n'agit que s'il a été activé par `/kaizen:work` ou `/kaizen:autopilot` (fichier
`.kaizen/state/gate.json`). Le reste du temps, il ne coûte rien. Il appartient à la **session** qui
l'a posé (un hook `PostToolUse` inscrit son identifiant juste après `gate on`) : une autre session
Claude Code ouverte sur le même repo n'est pas bloquée.

### `review` — la revue exigée avant `git push`

| Clé | Défaut | Rôle |
|---|---|---|
| `require_before_push` | `true` | un hook `PreToolUse` refuse `git push` d'une branche tant qu'aucune revue n'a enregistré l'état poussé |
| `max_unreviewed_lines` | `80` | lignes modifiées tolérées depuis la dernière revue (petits correctifs de CI ou de retours) ; au-delà, nouvelle revue |

Actif seulement dans un repo initialisé (`.kaizen/config.json`), jamais sur la branche par défaut
(gardée par le plugin `git`), ni pour une suppression de branche ou un push de tags.
`/kaizen:review` enregistre l'arbre qu'elle a lu (`node $K review record`), y compris le non commité.
Renoncer à la revue est une décision de l'utilisateur, tracée :
`node $K review waive --reason "hotfix validé par X"`. État : `node $K review status`.

### `pr`

| Clé | Défaut | Rôle |
|---|---|---|
| `max_lines` | `400` | plafond de lignes modifiées (ajouts + suppressions) pour une PR relisible : `node $K size`, tranches du plan, `ship` |
| `ignore` | lockfiles, `*.min.*`, `*.snap`, `*.generated.*`, `dist/**`, `vendor/**` | fichiers non comptés |

La valeur de 400 lignes suit les pratiques de Google (une PR courte se relit vite et cache moins de
bugs) et le constat de DORA 2025 : l'IA grossit les PR, et la revue devient le goulot.

### `packs`

Liste des Kaizen Packs déclarés. Voir [Kaizen Packs](packs.md).

## Fichiers d'état (non versionnés)

`.kaizen/state/` contient un `.gitignore` qui l'ignore entièrement :

| Fichier | Rôle |
|---|---|
| `gate.json` | état du garde-fou (actif, plan, session, nombre de blocages) |
| `cycles.jsonl` | un cycle `work`/`autopilot` par ligne, écrit par `gate off` : plan, durée, blocages, tokens (lu par `metrics` → `cycle_cost`) |
| `reviews.json` | dernière revue enregistrée par branche (arbre relu, verdict, renonciation) |
| `pr/<owner>-<repo>-<n>.json` | ce que `watch-pr` a déjà traité (fils, commentaires, checks) |
| `reviews/<horodatage>/` | retours bruts des relecteurs d'une revue |

Supprimer `.kaizen/state/` est sans danger : le seul effet est d'oublier le travail en cours.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `CLAUDE_PLUGIN_DATA` | dossier de cache du plugin (clones des packs git). Fourni par Claude Code. |
| `KAIZEN_GH` | binaire à utiliser à la place de `gh` (tests) |
