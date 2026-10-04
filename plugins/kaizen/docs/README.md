# Documentation de Kaizen

Documentation pour les **utilisateurs** du plugin. Les instructions que suit Claude se trouvent dans
`skills/<skill>/SKILL.md` ; elles font foi pour le comportement exact, mais ne sont pas écrites pour
être lues par un humain.

## Par où commencer

| Je veux… | Lire |
|---|---|
| Mettre en place le SDLC sur un projet | `/kaizen:setup audit` ([guide](guides/setup.md)) |
| Savoir quelle commande lancer, là, maintenant | `/kaizen:help` ([guide](guides/help.md)) |
| Voir Kaizen en une minute | [La vidéo de présentation](media/kaizen-presentation.mp4) |
| Comprendre Kaizen en 5 minutes | [Le README du plugin](../README.md) |
| Savoir ce que vaut Kaizen face aux autres SDLC | [Bilan et positionnement](positionnement.md) |
| Faire un premier cycle complet, pas à pas | [Démarrage](demarrage.md) |
| Régler Kaizen pour mon projet | [Configuration](configuration.md) |
| Partager des règles d'équipe entre repos | [Kaizen Packs](packs.md) |
| Débloquer une situation | [Dépannage](depannage.md) |

## La boucle

```text
   [/kaizen:constitution]   une fois par projet : les principes non négociables
   [/kaizen:ideate]         facultatif : « qu'est-ce qui vaut la peine ? »
        │
        ▼
┌─→ /kaizen:brainstorm      « qu'est-ce que ça doit être ? »   (QUOI)
│       ▼
│   /kaizen:plan            « comment le construire ? »        (COMMENT) + /kaizen:doc-review
│       ▼
│   /kaizen:work            « construis-le »                   (test d'abord, garde-fou)
│       ▼
│   /kaizen:review          « est-ce correct ? »
│       ▼
│   /kaizen:ship            « livre une PR relisible »  →  /kaizen:watch-pr
│       ▼
└── /kaizen:learn           « retiens ce qu'on a appris »  → relu par le prochain plan
```

`/kaizen:autopilot` enchaîne tout ce qui suit le brainstorm, sans s'arrêter.

## Les guides, skill par skill

**Cadrer**
- [constitution](guides/constitution.md) — les principes d'ingénierie non négociables du projet
- [ideate](guides/ideate.md) — des idées ancrées, critiquées, classées
- [brainstorm](guides/brainstorm.md) — définir quoi construire
- [decide](guides/decide.md) — trancher une décision difficile et l'écrire en ADR

**Construire**
- [plan](guides/plan.md) — décider comment construire
- [doc-review](guides/doc-review.md) — relire le plan avant de coder
- [work](guides/work.md) — exécuter le plan
- [debug](guides/debug.md) — trouver la cause, puis corriger
- [polish](guides/polish.md) — peaufiner l'interface avec l'utilisateur

**Vérifier et livrer**
- [review](guides/review.md) — revue de code multi-agents
- [ship](guides/ship.md) — ouvrir une PR relisible
- [address-feedback](guides/address-feedback.md) — traiter les retours de revue
- [watch-pr](guides/watch-pr.md) — mener une PR jusqu'à « prête »
- [release](guides/release.md) — préparer une version
- [deploy](guides/deploy.md) — mettre en production, surveiller, revenir en arrière
- [monitor](guides/monitor.md) — les signaux de production contre leurs seuils

**Apprendre et mesurer**
- [learn](guides/learn.md) — capitaliser une leçon
- [prune-learnings](guides/prune-learnings.md) — entretenir les leçons
- [postmortem](guides/postmortem.md) — apprendre d'un incident
- [metrics](guides/metrics.md) — mesurer la livraison et l'effet cumulatif

**Orchestrer**
- [autopilot](guides/autopilot.md) — tout enchaîner en autonomie
- [setup](guides/setup.md) — installer et vérifier Kaizen dans un repo
- [help](guides/help.md) — savoir quelle commande lancer maintenant

## Conventions de ces pages

- Les chemins affichés (`docs/plans/`, `docs/learnings/`…) sont les **défauts**. Si `docs_root` est
  réglé, lisez `<docs_root>/plans/`, etc. Voir [Configuration](configuration.md#docs_root).
- `$K` désigne le CLI du plugin : `node <dossier du plugin>/scripts/kaizen.mjs`.
- Les modes non interactifs (`mode:auto`, `mode:return`, `mode:pipeline`, `mode:agent`) servent quand
  une skill est appelée par une autre ; vous pouvez aussi les utiliser pour éviter les questions.
