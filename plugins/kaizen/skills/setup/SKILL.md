---
name: setup
description: Installe le SDLC Kaizen dans un repo et l'audite — diagnostic de maturité du projet (audit : CI, tests, secrets, protection de branche, CODEOWNERS, dépendances, déploiement, retour arrière, monitoring, constitution) avec feuille de route priorisée et corrections guidées ; crée .kaizen/config.json et les dossiers de livrables, détecte la stack, les commandes de vérification et la plateforme de déploiement, règle profil, modèles, langue et tracker, crée un Kaizen Pack (pack:<nom>), bilan de santé (check). Utiliser pour « installe/configure kaizen », « mets en place le SDLC », « audite le projet », « qu'est-ce qui manque à ce repo ? », /kaizen:setup.
allowed-tools: Bash(node:*), Bash(git:*), Read, Write, Edit, Glob, AskUserQuestion
argument-hint: "[audit] [pack:<nom>] [check]"
---

# Setup — préparer le repo pour la boucle Kaizen

Lis `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

Prérequis : Node ≥ 18 et un dépôt git. Sinon, dis ce qui manque et arrête.

## `check` — bilan de santé seul (aucune écriture)

`node "$K" root`, `node "$K" config`, `node "$K" detect`, `node "$K" learnings validate`,
`node "$K" packs`, `node "$K" constitution check`, `node "$K" gate status`, `node "$K" review status`,
`node "$K" models` (avertissements) → rapport : ✔/⚠ par point, avec la correction proposée.
Un garde-fou resté actif sans travail en cours (`gate status` actif) → propose `gate off`.

## `audit` — mettre en place le SDLC, dans l'ordre

Pour un projet qui démarre avec Kaizen, ou qui veut savoir ce qui lui manque.

1. `node "$K" audit` (ajoute `--no-github` si `gh` n'est pas authentifié). Montre les domaines et leur
   score, puis la liste **par priorité** : P1 d'abord (ce qui protège : CI, tests, secrets, protection
   de branche, déploiement et retour arrière), puis P2 et P3. Rien de ce qui est vert n'est à refaire.
2. Propose de traiter les points **un par un**, du plus prioritaire, une question à la fois
   (**corriger** (Recommandé) · **plus tard** · **jamais pour ce repo**) :
   - **gabarit** (`scaffold` non nul) → `node "$K" audit fix <id>` (CODEOWNERS : demande d'abord
     `--owner @…`, ne l'invente pas). Montre le fichier écrit ; il reste non commité, à relire ;
   - **déploiement** → `node "$K" deploy detect`, montre les candidats (commandes, retour arrière,
     confiance, notes), fais choisir, puis `node "$K" deploy configure <id>` ; rien de reconnu →
     étape 9 de l'installation ;
   - **monitoring / santé** → déclare au moins le health-check (URL de l'environnement, route de
     santé trouvée), puis `node "$K" monitor check --env <env>` ;
   - **protection de branche** → donne les réglages exacts (PR obligatoire, une approbation, CI
     requise) : c'est un réglage d'administration du dépôt, tu ne le modifies pas ;
   - **skill** (`skill` non nul : constitution, setup) → propose-la, ne l'enchaîne qu'avec accord.
3. Relance `node "$K" audit` à la fin et montre l'avant/après des scores. Ce qui reste est noté avec
   sa raison (« plus tard », « jamais »).

## Installation (défaut)

1. **Initialiser** — `node "$K" init` (idempotent : ne réécrit pas une config existante). Montre ce qui
   a été créé.
2. **Vérifications** — montre les commandes détectées (`test`, `lint`, `typecheck`). Demande (une
   question) : **les garder** (Recommandé) · **les ajuster** (écris alors `verify` dans
   `.kaizen/config.json`, ex. `{"test": "pnpm vitest run", "lint": "pnpm eslint ."}`) · **désactiver le
   garde-fou** (`gate.enabled: false`). Rien de détecté → demande les commandes ou désactive.
   Lance une fois `node "$K" verify` pour vérifier qu'elles tournent ; une commande qui échoue déjà
   sur la branche par défaut est signalée (le garde-fou bloquerait à tort). Suite lente (plus d'une
   minute) → propose des vérifications **ciblées** pour le garde-fou, `gate.targeted` avec `{files}`
   (ex. `{"test": "pnpm vitest related --run {files}", "lint": "pnpm eslint {files}"}`) ; la
   vérification complète reste celle de `work` et `ship`.
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
9. **Déploiement et monitoring** (facultatif) — si l'équipe veut que Kaizen mène aussi la mise en
   production : `node "$K" deploy detect` reconnaît la plateforme (Vercel, Netlify, Fly.io, Heroku,
   Kamal, Capistrano, Helm, Kustomize, Serverless, SAM, Firebase, workflows GitHub Actions,
   Makefile, scripts npm, Compose, Terraform) et propose commandes, retour arrière et health-check.
   Montre-les avec leurs notes, fais choisir, puis `node "$K" deploy configure <id>`. Rien de reconnu
   → demande les commandes, ne les invente pas. Complète les signaux (taux d'erreur, latence : une
   commande qui affiche un nombre). `production` est protégée par défaut. Vérifie avec
   `node "$K" monitor check --env <env>`.
10. **Profil** — demande (une question) : **lean** (Recommandé pour une première adoption : cérémonie
   minimale, garde-fous gardés) · **standard** · **full** (domaines régulés, équipe rodée). Le profil
   fixe aussi le **modèle de chaque agent** (`node "$K" models`) : montre-le, et propose d'ajuster un
   rôle (`models.roles`) ou un agent (`models.agents`) si l'équipe a une contrainte de coût ou
   d'exigence. Écris
   `profile` dans `.kaizen/config.json`. Équipe de plusieurs personnes → propose `approvers` dans
   `CONSTITUTION.md` et une ligne `CODEOWNERS` pour `CONSTITUTION.md` et `kaizen-packs/`. Rappelle que la revue est exigée avant tout `git push` d'une
   branche (`review.require_before_push`) et que seule l'équipe peut choisir de l'assouplir.
11. **Bilan** — termine par le bilan de santé ci-dessus et la commande à lancer ensuite
   (`/kaizen:brainstorm <idée>` ou `/kaizen:ideate`) ; rappelle que `/kaizen:help` dit à tout moment
   quoi faire ensuite.

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
