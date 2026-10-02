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
  "verify": {
    "test": "pnpm vitest run",
    "lint": "pnpm eslint .",
    "typecheck": "pnpm tsc --noEmit",
    "audit": "pnpm audit --audit-level high"
  },
  "gate": { "enabled": true, "max_blocks": 3, "timeout_seconds": 600, "max_age_hours": 24 },
  "pr": { "max_lines": 400, "ignore": ["*.lock", "pnpm-lock.yaml", "dist/**", "*.snap"] },
  "packs": [
    { "source": "kaizen-packs/house-rules" },
    { "source": "https://github.com/acme/kaizen-packs", "ref": "v1.2.0", "pack": ["rails"] }
  ]
}
```

## Les clés

### `docs_root`

Défaut : `"docs"`. Dossier racine des documents : `plans/`, `solutions/`, `ideation/`, `adr/`,
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
| `max_age_hours` | `24` | un garde-fou actif depuis plus longtemps (session interrompue) se désactive tout seul |

Le garde-fou n'agit que s'il a été activé par `/kaizen:work` ou `/kaizen:lfg` (fichier
`.kaizen/state/gate.json`). Le reste du temps, il ne coûte rien.

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
| `gate.json` | état du garde-fou (actif, plan, nombre de blocages) |
| `pr/<owner>-<repo>-<n>.json` | ce que `babysit-pr` a déjà traité (fils, commentaires, checks) |
| `reviews/<horodatage>/` | retours bruts des relecteurs d'une revue |

Supprimer `.kaizen/state/` est sans danger : le seul effet est d'oublier le travail en cours.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `CLAUDE_PLUGIN_DATA` | dossier de cache du plugin (clones des packs git). Fourni par Claude Code. |
| `KAIZEN_GH` | binaire à utiliser à la place de `gh` (tests) |
