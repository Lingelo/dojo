# Changelog

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Versions : [SemVer](https://semver.org/lang/fr/).

## [2.1.0] - 2026-10-04

### Ajouté
- **Coût des sous-agents** dans `cycle_cost` (#15) : le hook Stop additionne aussi les transcripts des
  sous-agents de la session (`<session>/subagents/agent-*.jsonl`), dédoublonnés par message ; le hook
  `Agent` consigne chaque lancement pendant un cycle (`.kaizen/state/agent-runs.jsonl` : rôle, modèle,
  id) pour ventiler les tokens par rôle de la politique de modèles. `metrics` expose le total
  (principal + sous-agents), `main_tokens_median`, `subagent_tokens_median`, `subagent_share` et
  `tokens_by_role`.

- **Surveillance continue** (#16) : `monitor patrol` (contrôle confirmé à planifier : routine, cron,
  workflow CI) et `monitor alert` (Alertmanager, PagerDuty, Datadog ou JSON simple, par exemple via
  `repository_dispatch`) ouvrent un **incident** daté de sa détection — tag `incident/<env>/…`, résolu
  par un retour arrière ou `monitor incident resolve` (`resolve/<env>/…`). `monitor watch` trace aussi
  sa violation comme incident. `monitor incident open|resolve|list`.
- DORA : un incident avant le déploiement suivant compte comme un échec, et le temps de rétablissement
  court de la détection à la résolution ; `deployments.incidents`. Le post-mortem reprend la détection
  tracée. Le hook refuse aussi les tags `incident/…` et `resolve/…` forgés à la main.

- `status` (et donc `/kaizen:help`) place en tête un incident ouvert (`/kaizen:monitor <env>`), puis
  un incident résolu depuis moins de 14 jours sans post-mortem (`/kaizen:postmortem`).
- `audit` contrôle la détection continue des incidents ; `audit fix monitor_patrol` et
  `audit fix monitor_alert` génèrent les workflows GitHub Actions correspondants (`--env`, `--ref`).
- Évaluations de bout en bout `monitor-alert`, `help-incident` et `cycle-cost-subagents` (29 au total).
  La dernière confirme sur une vraie session que la réponse de l'outil `Agent` porte l'identifiant
  d'agent : les sous-agents sont rattachés à leur rôle par id, pas seulement par prompt.
- Consigne de `/kaizen:monitor` précisée : sans personne pour répondre, le retour arrière est le
  défaut même si `deploy.auto_rollback` est désactivé, sauf si l'incident précède le dernier déploiement.

### Corrigé
- Un incident est rattaché au commit déployé **au moment de sa détection**, et non au dernier
  déploiement : une alerte antérieure à un déploiement ne l'incrimine plus.
- `deploy run`, `deploy rollback` et `deploy flag` ont un délai (`deploy.timeout_seconds`, 30 min, ou
  `environments.<env>.timeout_seconds`) : une commande bloquée est coupée avec tout son arbre de
  processus, le déploiement est en échec sans tag et le rapport signale un état incertain.
- Une vérification coupée par son délai (`verify`, garde-fou Stop, signaux `monitor` par commande)
  ne survit plus en arrière-plan : `scripts/run-bounded.mjs` tue tout l'arbre de processus
  (`taskkill /T /F` sous Windows, groupe de processus sous POSIX), et plus seulement le shell (#14).

## [2.0.0] - 2026-10-04

### Changements cassants
- Skills renommées (`compound` → `learn`, `refresh` → `prune-learnings`, `lfg` → `autopilot`,
  `babysit-pr` → `watch-pr`, `resolve-pr-feedback` → `address-feedback`) et dossier des leçons
  `docs/solutions/` → `docs/learnings/`, sans compatibilité : un repo 1.x renomme son dossier.
  Publiés en 1.2.0 par erreur ; un renommage sans compatibilité exige une version majeure.
- **`git push` d'une branche exige une revue enregistrée** dans un repo initialisé par Kaizen
  (`review.require_before_push: false` pour revenir au comportement 1.x).

### Ajouté
- Hook `PreToolUse` `review-gate.mjs` : la revue « obligatoire » de `work`, `autopilot` et `ship` est
  imposée par un contrôle déterministe et non plus seulement par la consigne. `/kaizen:review`
  enregistre l'arbre relu (non commité compris) avec `node $K review record` ; au-delà de
  `review.max_unreviewed_lines` (80) lignes modifiées depuis, nouvelle revue. `review status` et
  `review check`.
- **Preuve de revue** : un hook `PostToolUse` sur l'outil `Agent` (`review-hooks.mjs --evidence`)
  consigne chaque relecteur de code Kaizen réellement lancé ; `review record` le refuse sans relecteur
  depuis la revue précédente, sauf revue légère (≤ 20 lignes) ou mise à jour après correctifs.
- **Renonciation confirmée par l'utilisateur** : `review waive --reason` n'affiche qu'un code ; seule
  la saisie de `kaizen waive <code>` par l'utilisateur (hook `UserPromptSubmit`, 30 min, usage unique)
  la rend effective. `ship` ajoute une section « Revue écartée » à la PR. Le hook `PreToolUse` refuse
  l'écriture directe des fichiers d'état de revue et l'appel manuel des hooks de preuve.
- **`deploy detect` / `deploy configure`** : reconnaît la plateforme de déploiement (Vercel, Netlify,
  Fly.io, Heroku, Kamal, Capistrano, Helm, Kustomize, Serverless, AWS SAM, Firebase, workflows GitHub
  Actions `workflow_dispatch` ou déploiement continu, Makefile, scripts npm, Compose, Terraform) et
  propose commandes, retour arrière natif (ou redéploiement du commit précédent depuis un worktree)
  et health-check, avec confiance et limites ; écrit le candidat choisi sans écraser l'existant.
- **Politique de modèles** (`models`, `node $K models`) : un rôle par agent, un modèle par rôle selon
  le profil (recherche économe, relecteurs critiques au plus fort), ajustable par rôle ou par agent ;
  les skills passent le modèle à chaque sous-agent et la revue enregistre celui réellement demandé.
- **`/kaizen:setup audit`** et `node $K audit` : maturité SDLC du projet sur cinq domaines (fondations,
  flux, livraison, exploitation, boucle Kaizen), feuille de route priorisée, corrections guidées, et
  gabarits générés depuis la stack sans jamais écraser (`audit fix ci|pr_template|dependabot|codeowners|gitignore_env`).
- **Déploiement et monitoring** :
  - `/kaizen:deploy` : déploie par les commandes de l'équipe (`deploy.environments`), préconditions
    (CI verte, checklist des plans livrés, retour arrière prêt, signaux sains), approbation que
    l'utilisateur tape (`kaizen deploy <code>`) pour un environnement protégé, tag annoté
    `deploy/<env>/…` poussé, surveillance des signaux, retour arrière (`rollback/<env>/…`), feature
    flags (`deploy.flags`) ;
  - `/kaizen:monitor` et `node $K monitor check|watch` : health-check HTTP natif ou toute commande
    qui affiche un nombre, seuils de la config remplacés par ceux des plans livrés
    (`` `error_rate` > 1 % ``), violation confirmée sur échantillons consécutifs, retour arrière
    automatique optionnel (`deploy.auto_rollback`) ;
  - `metrics` : DORA mesuré sur les vrais déploiements (fréquence, délai commit → production, taux
    d'échec, temps de rétablissement) quand des tags `deploy/` existent ;
  - `postmortem` lit la chronologie dans les tags et `monitor.jsonl` ; `release` propose
    `/kaizen:deploy` ; `status` et `help` suggèrent de déployer les commits en attente ;
  - hook : la commande brute d'un environnement protégé et les tags `deploy/`/`rollback/` forgés sont
    refusés ; `release notes` ignore les tags de déploiement comme point de départ.
- **`/kaizen:help`** : explique Kaizen et recommande la commande à lancer selon la situation décrite
  et l'état réel du repo. S'appuie sur **`node $K status`**, un diagnostic déterministe (initialisation,
  profil, constitution, dernier plan, garde-fou, revue de la branche) qui déduit l'étape suivante.
- **Profils d'adoption** `profile: lean | standard | full` (`init --profile`, question dans `setup`) :
  la cérémonie s'ajuste (plan, `doc-review`, relecteurs, raccourci `autopilot` en `lean`), jamais les
  garde-fous déterministes.
- `/kaizen:metrics` : `learnings_applied_in_commits` (leçon citée dans un message de commit = appliquée,
  pas seulement lue), `learnings_never_cited` et un échantillon pour `prune-learnings`, et la méthode
  de `learning_reuse_rate`. Les commits qui appliquent une leçon la citent dans leur corps.
- **Coût des cycles** : le hook `Stop` relève les tokens de la session principale depuis `gate on`
  (transcript), `gate off` consigne le cycle (plan, durée, blocages, tokens) dans
  `.kaizen/state/cycles.jsonl`, et `/kaizen:metrics` l'agrège (`cycle_cost`).
- **Vérifications ciblées** du garde-fou : `gate.targeted` avec `{files}` (fichiers touchés par la
  branche) ; la vérification complète reste celle de `work` et `ship`.
- **Exploitation** : `plan check` signale un déploiement sans retour arrière, sans signal ou avec un
  signal sans seuil ; `release notes` extrait le déploiement des plans livrés (`rollout`, champs
  manquants) pour la checklist ; un seuil franchi renvoie vers `/kaizen:postmortem`.
- **Gouvernance d'équipe** de la constitution : `approvers` et `ratified_by` dans le frontmatter ;
  `constitution check` exige un amendement « Approuvé par : @… » d'un approbateur déclaré pour chaque
  version, et refuse une approbation par un agent. `setup` propose `CODEOWNERS`.

### Corrigé
- Garde-fou du hook `Stop` propre à la session qui l'a posé (hook `PostToolUse` `--claim` après
  `gate on`) : une autre session sur le même repo n'est plus bloquée.
- Garde-fou tenu dans `gate.budget_seconds` (840 s) sous le délai du hook (900 s) : avant, plusieurs
  commandes de 600 s pouvaient faire tuer le hook, qui ne protégeait alors plus rien.
- `/kaizen:polish` lance toujours le serveur de dev, même quand l'utilisateur annonce qu'il ne
  regardera pas : la page servie est la preuve de la retouche (l'évaluation échouait par intermittence).
- `dev detect` lit le port par défaut d'un serveur Node maison dans son point d'entrée
  (`process.env.PORT || 5173`, `.listen(8080)`) au lieu d'annoncer 3000 à tort.

## [1.2.0] - 2026-10-04

### Modifié
- Vocabulaire propre à Kaizen pour les skills et le dossier des leçons (`docs/learnings/`).
- Vidéo de présentation re-rendue avec les nouveaux noms.

## [1.1.0] - 2026-10-02

### Ajouté
- **Constitution d'ingénierie** : `/kaizen:constitution` (création, `amend`, `audit`) et
  `CONSTITUTION.md`. Chaque article porte un **Contrôle**, et une politique IA est incluse. La
  constitution est appliquée par `plan check`, `/kaizen:doc-review` et le relecteur `standards`.
- **Plan enrichi** :
  - contrôle constitutionnel ;
  - menaces STRIDE ;
  - déploiement et retour arrière ;
  - marqueurs `[À CLARIFIER : …]` ;
  - tranches de la taille d'une PR ;
  - `node $K plan check` : traçabilité R/AE → U, champs obligatoires, constitution.
- `/kaizen:doc-review` et 6 relecteurs de plan : cohérence, faisabilité, périmètre, sécurité,
  adversarial, design.
- **Livraison** :
  - `/kaizen:ship`, avec description tirée du plan et guide du relecteur ;
  - `/kaizen:address-feedback` ;
  - `/kaizen:watch-pr`, qui s'appuie sur `scripts/pr.mjs` : instantané paginé, état des éléments
    traités, veilleur sans tokens, mise à jour de la branche seulement sur `BEHIND`.
- `/kaizen:polish` : détection et lancement du serveur de dev, retouches guidées par l'utilisateur.
- **Apprentissage** :
  - `/kaizen:decide` (ADR) ;
  - `/kaizen:postmortem` (sans recherche de coupable) ;
  - `/kaizen:metrics` (DORA approché et réutilisation des leçons) ;
  - `/kaizen:release` (notes de version et SemVer).
- `node $K size` (plafond `pr.max_lines`) et `verify --only audit` (audit des dépendances).
- Tests `node:test` (unitaires, CLI, garde-fou, PR avec un faux `gh`, contrats), CI GitHub Actions et
  19 évaluations de bout en bout (`evals/run.mjs`, vrai `claude -p` sur un projet de démonstration)
  couvrant 17 skills : review, plan, doc-review, learn, work, debug, autopilot, polish, brainstorm,
  constitution, decide, ideate, postmortem, metrics, release, prune-learnings, setup.
- Documentation utilisateur dans `docs/` : démarrage, configuration, packs, dépannage, un guide par
  skill.
- Vidéo de présentation d'une minute (`docs/media/`), avec voix off, sous-titres et source
  reproductible.

### Modifié
- `/kaizen:work` : contrôle de taille, audit des dépendances, livraison via `/kaizen:ship`.
- `/kaizen:autopilot` : livraison via `ship`, puis suivi par `watch-pr`.
- `learnings-researcher` lit aussi les ADR et les post-mortems.
- Le parseur de frontmatter ignore les commentaires YAML en fin de ligne.
- Corrections issues des évaluations de bout en bout :
  - `autopilot` n'accepte plus de raccourci « changement trivial » : plan, garde-fou, `verify` et revue
    tournent toujours ;
  - `polish` crée une branche locale au lieu de s'arrêter sur la branche par défaut ;
  - `release` écrit le CHANGELOG et la version sans commiter ; commit, tag et publication sur accord ;
  - `ideate` part en « Surprends-moi » quand personne ne peut choisir le sujet ;
  - `decide` n'écrit un ADR que pour une décision coûteuse à défaire (description alignée).
- Windows : `KAIZEN_GH` peut pointer vers un script Node, chemins affichés en style POSIX, CI sur
  `windows-latest`.

## [1.0.0] - 2026-10-02

### Ajouté
- Boucle compound engineering, adaptée du plugin Compound Engineering d'Every (MIT) :
  - `brainstorm`, `plan`, `work`, `review`, `learn` ;
  - `ideate`, `debug`, `prune-learnings`, `autopilot`, `setup`.
- 15 agents : 5 de recherche et 10 relecteurs de code, avec un contrat de constats commun.
- Plan unifié `kaizen-plan/v1`, schéma des leçons, Kaizen Packs (locaux ou git épinglés).
- CLI déterministe `scripts/kaizen.mjs`, sans dépendance.
- Garde-fou par hook `Stop` (`scripts/quality-gate.mjs`).
