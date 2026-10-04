---
name: setup
description: Initialise ou vérifie Kaizen dans un repo — crée .kaizen/config.json et les dossiers docs/plans, docs/learnings, docs/ideation, détecte la stack et les commandes de vérification du garde-fou, règle langue et tracker, rend le corpus de leçons trouvable depuis CLAUDE.md, crée un Kaizen Pack (pack:<nom>) et lance un bilan de santé. Utiliser pour « installe/configure kaizen », « crée un pack de règles », « vérifie la config kaizen », /kaizen:setup.
allowed-tools: Bash(node:*), Bash(git:*), Read, Write, Edit, Glob, AskUserQuestion
argument-hint: "[pack:<nom>] [check]"
---

# Setup — préparer le repo pour la boucle Kaizen

Lis `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

Prérequis : Node ≥ 18 et un dépôt git. Sinon, dis ce qui manque et arrête.

## `check` — bilan de santé seul (aucune écriture)

`node "$K" root`, `node "$K" config`, `node "$K" detect`, `node "$K" learnings validate`,
`node "$K" packs`, `node "$K" constitution check`, `node "$K" gate status`, `node "$K" review status` → rapport : ✔/⚠ par point, avec la correction proposée.
Un garde-fou resté actif sans travail en cours (`gate status` actif) → propose `gate off`.

## Installation (défaut)

1. **Initialiser** — `node "$K" init` (idempotent : ne réécrit pas une config existante). Montre ce qui
   a été créé.
2. **Vérifications** — montre les commandes détectées (`test`, `lint`, `typecheck`). Demande (une
   question) : **les garder** (Recommandé) · **les ajuster** (écris alors `verify` dans
   `.kaizen/config.json`, ex. `{"test": "pnpm vitest run", "lint": "pnpm eslint ."}`) · **désactiver le
   garde-fou** (`gate.enabled: false`). Rien de détecté → demande les commandes ou désactive.
   Lance une fois `node "$K" verify` pour vérifier qu'elles tournent ; une commande qui échoue déjà
   sur la branche par défaut est signalée (le garde-fou bloquerait à tort).
3. **Langue** — `language: auto` suit la conversation ; propose de la fixer (`fr`, `en`) si l'équipe
   écrit ses livrables dans une langue précise.
4. **Tracker** — `tracker: auto` (clé Jira lue dans la branche, issues GitHub via `gh`) ; ajuste si
   l'équipe utilise autre chose.
5. **Emplacement** — `docs_root: docs` par défaut. Si `docs/` est déjà un site de documentation
   publié, propose un autre dossier (ex. `.kaizen/docs` ou `engineering/`) avant tout premier
   livrable.
6. **Trouvabilité** — avec accord, ajoute à `CLAUDE.md` (existant seulement ; sinon propose `/init`
   d'abord) une courte section :

   ```markdown
   ## Kaizen
   - Avant de planifier ou de déboguer, cherche les leçons du projet dans `docs/learnings/`
     (frontmatter : module, tags, symptoms, applies_when).
   - Plans dans `docs/plans/` ; boucle : /kaizen:brainstorm → plan → work → review → learn.
   ```
7. **Constitution** — `CONSTITUTION.md` absente → propose `/kaizen:constitution` (Recommandé) : sans
   elle, plan et revue n'ont que les règles génériques. Présente → `node "$K" constitution check`.
8. **Taille des PR** — `pr.max_lines` (400 par défaut) : demande si l'équipe a un autre plafond.
9. **Profil** — demande (une question) : **lean** (Recommandé pour une première adoption : cérémonie
   minimale, garde-fous gardés) · **standard** · **full** (domaines régulés, équipe rodée). Écris
   `profile` dans `.kaizen/config.json`. Rappelle que la revue est exigée avant tout `git push` d'une
   branche (`review.require_before_push`) et que seule l'équipe peut choisir de l'assouplir.
10. **Bilan** — termine par le bilan de santé ci-dessus et la commande à lancer ensuite
   (`/kaizen:brainstorm <idée>` ou `/kaizen:ideate`).

## `pack:<nom>` — créer un Kaizen Pack

1. `node "$K" pack new <nom>` crée `kaizen-packs/<nom>/` (README + dossier `research/` de stockage) et
   le déclare dans `.kaizen/config.json`. Refuse d'écrire dans un dossier non vide.
2. Si l'utilisateur a décrit une première règle, écris-la : `kaizen-packs/<nom>/<slug>.md`

   ```markdown
   ---
   title: Les pages reçoivent leurs données en props serveur, jamais par un endpoint JSON parallèle
   applies_when:
     - ajouter une page qui a besoin de données serveur
     - ajouter ou modifier un endpoint consommé par les pages de l'application
   tags: [routes, props, api]
   ---

   <la règle, sa raison, et l'exception éventuelle — sans biographie ni historique>
   ```

   `applies_when` décrit des **situations**, avec les mots qu'une demande de fonctionnalité
   utiliserait (« ajouter une page… »), pas des étiquettes de sujet (« architecture »). Une situation
   par ligne ; deux ou trois conditions concrètes valent mieux qu'une abstraite. Deux règles d'un même
   pack ne prescrivent pas la même chose.
3. `node "$K" packs` pour montrer le pack résolu et ses éventuels avertissements.

Packs partagés entre repos : déclare une source git épinglée (`{"source":
"https://github.com/org/packs", "ref": "v1.2.0", "pack": ["rails"]}`) ; elle est clonée en cache dans
les données du plugin (`node "$K" packs --refresh` pour la mettre à jour).
