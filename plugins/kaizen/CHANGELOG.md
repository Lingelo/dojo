# Changelog

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Versions : [SemVer](https://semver.org/lang/fr/).

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
