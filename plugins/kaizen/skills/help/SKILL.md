---
name: help
description: Guide d'orientation Kaizen — explique ce qu'est Kaizen (la boucle, les garde-fous, les livrables, les profils) et recommande la commande à utiliser selon la situation décrite et l'état réel du repo (setup fait ?, constitution ?, plan en cours ?, garde-fou actif ?, revue enregistrée ?), avec l'invocation exacte et ce qu'elle produira. Lecture seule. Utiliser pour « quelle commande utiliser ? », « par où commencer ? », « c'est quoi kaizen ? », « je veux corriger un bug / livrer / mesurer, je fais quoi ? », « où en suis-je ? », /kaizen:help [question ou situation].
allowed-tools: Bash(node:*), Bash(git:*), Read, Glob, Grep
argument-hint: "[vide = présentation + où en est le repo | question | situation]"
---

# Help — savoir quoi utiliser

**Résultat :** l'utilisateur sait ce qu'est Kaizen et **quelle commande lancer maintenant**, avec
l'invocation exacte, pourquoi celle-là, et ce qu'elle produira. Lecture seule : aucune écriture,
aucune commande lancée à sa place.

`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

## 1. Diagnostiquer

`node "$K" status --json` (hors dépôt git : dis-le, et réponds seulement sur le fond). Il donne
l'initialisation, le profil, la constitution, le dernier plan et son stade, le garde-fou, l'état de
la revue de la branche, les incidents ouverts ou sans post-mortem, et `next` : la prochaine étape déduite de l'état. Tu t'en sers comme d'un
fait, pas comme d'un ordre : la situation décrite par l'utilisateur l'emporte.

## 2. Répondre selon l'invocation

**Sans argument** — en moins de 30 lignes :
1. Kaizen en trois phrases : un cycle de développement assisté par IA, de la constitution du projet
   jusqu'à la mise en production surveillée ; des garde-fous **déterministes** (tests verts avant de terminer,
   revue enregistrée avant tout push, taille des PR) ; une boucle d'apprentissage (leçons, ADR,
   post-mortems) relue au cycle suivant. Le merge reste à l'humain.
2. Le schéma de la boucle (ci-dessous).
3. **Où en est ce repo** : 3 à 5 lignes tirées de `status`.
4. **Ensuite** : la commande recommandée, avec sa raison, et au plus deux alternatives.

**Avec une question ou une situation** — associe-la au tableau ci-dessous. Réponds par la commande
(invocation exacte, arguments utiles), une phrase sur ce qu'elle fait et ce qu'elle produit, et ce
qui viendra après. Si deux commandes conviennent, dis ce qui les départage. Si la situation est
vraiment ambiguë, une seule question. Pour le détail d'une commande, lis son guide
`${CLAUDE_PLUGIN_ROOT}/docs/guides/<commande>.md` et cite-le, sans le recopier.

**« C'est quoi / comment marche X »** (un garde-fou, un livrable, une notion) — explique depuis
`${CLAUDE_PLUGIN_ROOT}/README.md`, `${CLAUDE_PLUGIN_ROOT}/docs/configuration.md` ou
`${CLAUDE_PLUGIN_ROOT}/docs/depannage.md`, en citant la page à lire ensuite.

## La boucle

```
                 CONSTITUTION.md — principes, chacun avec un contrôle vérifiable
ideate → brainstorm → plan ─► doc-review → work → review → ship → watch-pr → learn
                       ▲                                                         │
                       └──────────── docs/learnings/ · docs/adr/ ◄───────────────┘
debug → correctif → review → learn       polish : retouches UI guidées
release → deploy → monitor ─(seuil franchi)→ rollback → postmortem → leçons, amendements
decide → ADR     metrics (DORA réel, coût)
autopilot : de la demande à la PR prête, en autonomie
```

## Quelle commande pour quelle situation

| Situation | Commande | Pourquoi celle-là |
|---|---|---|
| Kaizen jamais utilisé dans ce repo | `/kaizen:setup` | config, commandes de vérification, déploiement détecté, profil (`lean` pour commencer) |
| Mettre en place le SDLC, savoir ce qui manque au projet | `/kaizen:setup audit` | maturité par domaine (CI, tests, secrets, revue, déploiement, monitoring) et corrections guidées par priorité |
| Choisir ou ajuster le modèle des agents | `node $K models`, puis `models` dans `.kaizen/config.json` | un modèle par rôle selon le profil : recherche économe, jugements critiques au plus fort |
| Poser les règles du projet | `/kaizen:constitution` | 5 à 9 principes, chacun avec un contrôle que plan et revue appliquent |
| Ne sait pas quoi faire ensuite | `/kaizen:ideate` | idées ancrées dans le code, critiquées, classées |
| Une idée de fonctionnalité, encore floue | `/kaizen:brainstorm <idée>` | définit **quoi** : exigences R, exemples d'acceptation AE |
| Les exigences sont claires | `/kaizen:plan` | décide **comment** : unités, menaces, déploiement, tranches de PR |
| Un plan à relire avant de coder | `/kaizen:doc-review <plan>` | relecteurs de plan (appelée par `plan`) |
| Un plan prêt, ou un petit changement précis | `/kaizen:work [plan]` | test d'abord, un commit par unité, garde-fou, revue |
| Un bug dont la cause est inconnue | `/kaizen:debug <symptôme>` | reproduction, chaîne causale, correctif test d'abord |
| Retouches visuelles d'une interface | `/kaizen:polish` | serveur de dev, retours appliqués à chaud |
| Faire relire du code (branche ou PR) | `/kaizen:review [n° PR]` | relecteurs choisis selon le diff ; enregistre la revue exigée au push |
| Ouvrir la PR | `/kaizen:ship` | vérifications, taille, description tirée du plan |
| Des commentaires de revue sur la PR | `/kaizen:address-feedback` | verdict, correctif poussé, réponse, fil résolu |
| Mener une PR jusqu'à « prête » | `/kaizen:watch-pr <url>` | retours, CI, mise à jour de branche ; ne merge jamais |
| Tout enchaîner sans intervenir | `/kaizen:autopilot <demande>` | de la demande à la PR prête (idéalement après un brainstorm) |
| Une décision difficile à défaire | `/kaizen:decide <question>` | options comparées sur preuves, puis ADR |
| On vient de résoudre un problème non évident | `/kaizen:learn` | une leçon que le prochain plan et la prochaine revue reliront |
| Leçons nombreuses ou périmées | `/kaizen:prune-learnings` | garder, mettre à jour, fusionner, supprimer |
| Un incident en production | `/kaizen:postmortem` | sans coupable : chronologie, facteurs, actions, leçons |
| Préparer une version | `/kaizen:release` | notes, SemVer, CHANGELOG, checklist de mise en production |
| Mettre en production, ou revenir en arrière | `/kaizen:deploy <env> [ref]`, `/kaizen:deploy rollback <env>` | commandes de l'équipe, approbation tapée pour la production, tag, surveillance, retour arrière |
| La prod va-t-elle bien ? | `/kaizen:monitor [env] [watch n]` | signaux déclarés contre les seuils de la config et des plans |
| Détecter les incidents en continu, une alerte vient de tomber | `/kaizen:monitor production continu`, `/kaizen:monitor production incidents` | contrôle planifié (`patrol`) ou alertes de l'équipe branchées, incidents datés |
| Savoir si ça s'améliore | `/kaizen:metrics` | DORA approché, réutilisation des leçons, coût des cycles |
| Push refusé, garde-fou qui bloque, skill qui ne se déclenche pas | — | `docs/depannage.md`, puis `/kaizen:setup check` |

Repères pour départager :
- **work ou autopilot** : `work` avance avec l'utilisateur ; `autopilot` va seul jusqu'à la PR.
- **debug ou work** : cause inconnue → `debug` ; correctif évident → `work`.
- **brainstorm ou plan** : on ne sait pas encore exactement quoi → `brainstorm` ; on le sait →
  `plan`.
- **Profil** : beaucoup de cérémonie pour l'équipe → profil `lean` (`.kaizen/config.json`), qui
  allège plan et revue sans toucher aux garde-fous.

## Ce que help ne fait pas

Elle ne lance pas la commande recommandée et n'écrit rien : elle oriente. Si l'utilisateur dit
« vas-y », c'est la commande recommandée qu'il faut invoquer, pas help.
