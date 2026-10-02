# Changelog

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Versions : [SemVer](https://semver.org/lang/fr/).

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
  - `/kaizen:resolve-pr-feedback` ;
  - `/kaizen:babysit-pr`, qui s'appuie sur `scripts/pr.mjs` : instantané paginé, état des éléments
    traités, veilleur sans tokens, mise à jour de la branche seulement sur `BEHIND`.
- `/kaizen:polish` : détection et lancement du serveur de dev, retouches guidées par l'utilisateur.
- **Apprentissage** :
  - `/kaizen:decide` (ADR) ;
  - `/kaizen:postmortem` (sans recherche de coupable) ;
  - `/kaizen:metrics` (DORA approché et réutilisation des leçons) ;
  - `/kaizen:release` (notes de version et SemVer).
- `node $K size` (plafond `pr.max_lines`) et `verify --only audit` (audit des dépendances).
- Tests `node:test` (unitaires, CLI, garde-fou, PR avec un faux `gh`, contrats), évaluations de bout
  en bout (`evals/run.mjs`) et CI GitHub Actions.
- Documentation utilisateur dans `docs/` : démarrage, configuration, packs, dépannage, un guide par
  skill.
- Vidéo de présentation d'une minute (`docs/media/`), avec voix off, sous-titres et source
  reproductible.

### Modifié
- `/kaizen:work` : contrôle de taille, audit des dépendances, livraison via `/kaizen:ship`.
- `/kaizen:lfg` : livraison via `ship`, puis suivi par `babysit-pr`.
- `learnings-researcher` lit aussi les ADR et les post-mortems.
- Le parseur de frontmatter ignore les commentaires YAML en fin de ligne.

## [1.0.0] - 2026-10-02

### Ajouté
- Boucle compound engineering, adaptée du plugin Compound Engineering d'Every (MIT) :
  - `brainstorm`, `plan`, `work`, `review`, `compound` ;
  - `ideate`, `debug`, `refresh`, `lfg`, `setup`.
- 15 agents : 5 de recherche et 10 relecteurs de code, avec un contrat de constats commun.
- Plan unifié `kaizen-plan/v1`, schéma des leçons, Kaizen Packs (locaux ou git épinglés).
- CLI déterministe `scripts/kaizen.mjs`, sans dépendance.
- Garde-fou par hook `Stop` (`scripts/quality-gate.mjs`).
