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

**Preuve de revue.** Un hook `PostToolUse` sur l'outil `Agent` consigne chaque relecteur de code
Kaizen réellement lancé. `review record` exige au moins un relecteur lancé depuis la revue précédente
de la branche. Deux exceptions : la revue légère (diff de la branche ≤ 20 lignes, relue sans
sous-agents) et la mise à jour après correctifs (≤ `max_unreviewed_lines` depuis l'arbre relu).

**Renonciation confirmée par l'utilisateur.** `node $K review waive --reason "hotfix validé par X"`
ne fait qu'afficher un code. La renonciation ne prend effet que lorsque **vous** tapez
`kaizen waive <code>` dans la conversation (hook `UserPromptSubmit`, 30 minutes, usage unique) ;
Claude ne peut pas la confirmer à votre place. `ship` la rappelle dans une section « Revue écartée »
de la PR. État : `node $K review status`.

Ces fichiers d'état ne s'écrivent que par le CLI et les hooks : un hook `PreToolUse` refuse leur
écriture directe et l'appel manuel des hooks de preuve. C'est une protection contre l'oubli et la
dérive, pas contre un agent décidé à contourner le dispositif.

### `pr`

| Clé | Défaut | Rôle |
|---|---|---|
| `max_lines` | `400` | plafond de lignes modifiées (ajouts + suppressions) pour une PR relisible : `node $K size`, tranches du plan, `ship` |
| `ignore` | lockfiles, `*.min.*`, `*.snap`, `*.generated.*`, `dist/**`, `vendor/**` | fichiers non comptés |

La valeur de 400 lignes suit les pratiques de Google (une PR courte se relit vite et cache moins de
bugs) et le constat de DORA 2025 : l'IA grossit les PR, et la revue devient le goulot.

### `deploy` — déploiement et retour arrière

Facultatif. Les commandes avec lesquelles `/kaizen:deploy` met en production : Kaizen ne connaît
aucune plateforme et ne devine jamais une commande.

| Clé | Défaut | Rôle |
|---|---|---|
| `environments.<env>.command` | — | déploie ; reçoit `KAIZEN_ENV`, `KAIZEN_REF`, `KAIZEN_SHA` |
| `environments.<env>.rollback` | — | revient en arrière (vers le déploiement précédent par défaut) |
| `environments.<env>.url` | — | adresse de l'environnement, montrée pendant la surveillance |
| `environments.<env>.protected` | `true` pour `production` | exige un code que **vous** tapez (`kaizen deploy <code>`) ; la commande brute est refusée par un hook |
| `watch_minutes` | `15` | durée de la surveillance des signaux après un déploiement |
| `auto_rollback` | `false` | retour arrière automatique dès qu'un seuil est franchi |
| `push_tags` | `true` | pousse les tags `deploy/<env>/…` et `rollback/<env>/…` (source des métriques DORA réelles) |
| `flags.on` / `flags.off` | — | commandes de feature flag, avec `{flag}` et `{env}` (`kaizen.mjs deploy flag on|off <nom>`) |
| `metrics_env` | `production` | environnement dont les déploiements alimentent `/kaizen:metrics` |

```json
"deploy": {
  "environments": {
    "staging":    { "command": "make deploy ENV=staging", "rollback": "make rollback ENV=staging" },
    "production": { "command": "make deploy ENV=production", "rollback": "make rollback ENV=production", "url": "https://shop.example" }
  },
  "flags": { "on": "unleash toggle {flag} --env {env} --on", "off": "unleash toggle {flag} --env {env} --off" }
}
```

### `monitor` — signaux de production

Facultatif. Les signaux que `/kaizen:monitor` et `/kaizen:deploy` comparent à leurs seuils.

| Clé | Défaut | Rôle |
|---|---|---|
| `signals.<nom>.type: "http"` + `url`, `expect` | `expect: 200` | health-check natif, sans outil |
| `signals.<nom>.command` | — | toute commande dont le dernier mot affiché est un nombre (Prometheus, Datadog, CloudWatch, SQL, logs) ; `{env}` remplacé |
| `signals.<nom>.max` / `min` | — | seuils ; remplacés par ceux du plan livré (`` `nom` > seuil `` dans sa section « Déploiement et retour arrière ») |
| `signals.<nom>.env` | tous | limite le signal à un ou plusieurs environnements |
| `interval_seconds` | `60` | intervalle entre deux échantillons |
| `consecutive` | `2` | échantillons hors seuil de suite pour retenir une violation |

### `models` — le bon modèle pour chaque tâche

Chaque agent a un **rôle**, chaque rôle un modèle (`haiku`, `sonnet`, `opus`, ou `inherit` = celui de
la session). Les défauts dépendent du profil :

| Rôle | Agents | `lean` | `standard` | `full` |
|---|---|---|---|---|
| `research` | repo, learnings, git-historian, docs, flow-analyst | haiku | sonnet | sonnet |
| `review` | correctness, testing, performance, reliability, api-contract, maintainability, standards | sonnet | sonnet | opus |
| `review_critical` | security, data-migration, adversarial | sonnet | opus | opus |
| `plan_review` | plan-coherence, plan-feasibility, plan-scope, plan-design | haiku | sonnet | opus |
| `plan_review_critical` | plan-security, plan-adversarial | sonnet | opus | opus |
| `implement` | sous-agents de `work` (unités indépendantes) | sonnet | sonnet | inherit |

Principe : la lecture en volume coûte peu d'erreurs ; les jugements dont l'erreur coûte cher
(sécurité, migrations, décisions de plan) ont le modèle le plus fort.

Ajustez par rôle ou par agent :

```json
"models": {
  "roles": { "review_critical": "opus", "research": "haiku" },
  "agents": { "performance-reviewer": "opus" }
}
```

`node $K models` affiche la politique effective et signale les valeurs invalides. La revue enregistre
le modèle réellement demandé pour chaque relecteur (`review status`), et `/kaizen:metrics` mesure le
coût des cycles : de quoi vérifier qu'un modèle plus économe ne dégrade pas la qualité.

### `packs`

Liste des Kaizen Packs déclarés. Voir [Kaizen Packs](packs.md).

## Fichiers d'état (non versionnés)

`.kaizen/state/` contient un `.gitignore` qui l'ignore entièrement :

| Fichier | Rôle |
|---|---|
| `gate.json` | état du garde-fou (actif, plan, session, nombre de blocages) |
| `cycles.jsonl` | un cycle `work`/`autopilot` par ligne, écrit par `gate off` : plan, durée, blocages, tokens de la session principale et des sous-agents par rôle (lu par `metrics` → `cycle_cost`) |
| `deployments.jsonl` | déploiements, retours arrière et flags lancés depuis cette machine (les tags git font foi) |
| `deploy-approvals.json` | approbations de déploiement protégé en attente ou confirmées, 30 min |
| `monitor.jsonl` | échantillons des signaux (`monitor check` / `watch`), pour la chronologie des post-mortems |
| `reviews.json` | dernière revue enregistrée par branche (arbre relu, verdict, relecteurs, renonciation) |
| `agent-runs.jsonl` | sous-agents lancés pendant le cycle en cours (hook sur l'outil `Agent`) : rôle, modèle, id — pour ventiler `cycle_cost` ; effacé par `gate off` |
| `review-evidence.json` | relecteurs de code réellement lancés (hook sur l'outil `Agent`), 12 h |
| `waivers.json` | renonciations en attente de confirmation par l'utilisateur, 30 min |
| `pr/<owner>-<repo>-<n>.json` | ce que `watch-pr` a déjà traité (fils, commentaires, checks) |
| `reviews/<horodatage>/` | retours bruts des relecteurs d'une revue |

Supprimer `.kaizen/state/` est sans danger : le seul effet est d'oublier le travail en cours.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `CLAUDE_PLUGIN_DATA` | dossier de cache du plugin (clones des packs git). Fourni par Claude Code. |
| `KAIZEN_GH` | binaire à utiliser à la place de `gh` (tests) |
