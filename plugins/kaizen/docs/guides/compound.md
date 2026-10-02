# `/kaizen:compound`

> Écrire **une** leçon durable dans `docs/solutions/`, là où le prochain plan et la prochaine revue la
> liront. C'est l'étape qui rend le cycle suivant plus facile.

## En bref

| | |
|---|---|
| **Ce qu'elle fait** | Applique le test de durabilité, rassemble le problème, les symptômes, les impasses, la solution et la prévention, cherche une leçon existante à mettre à jour, classe selon le vocabulaire du corpus, écrit et valide |
| **Quand l'utiliser** | Après un travail **vérifié** qui a produit un raisonnement non évident : piège d'API, cause surprenante, impasse coûteuse, décision difficile à reconstituer |
| **Quand ne pas l'utiliser** | Correctif de routine que le test et le message de commit expliquent déjà ; problème pas encore résolu |
| **Ce qu'elle produit** | `docs/solutions/<catégorie>/<titre>.md`, nouvelle ou mise à jour, frontmatter validé ; ou « Leçon non écrite : <raison> » |
| **Et ensuite** | La leçon est relue par `learnings-researcher` à chaque plan, brainstorm, revue et debug |

## Exemples

```text
/kaizen:compound
/kaizen:compound le BOM UTF-8 pour Excel
/kaizen:compound mode:auto                 # sans question (utilisé par work, lfg, debug)
```

## Le test de durabilité

> Si ce document disparaissait, un futur développeur qui lit l'implémentation finale referait-il
> probablement l'erreur, ou la même enquête ?

Ni l'effort fourni ni la taille du diff ne comptent. Si la réponse est non, rien n'est écrit et
Claude dit pourquoi. Exemple réel tiré d'une évaluation : pour une faute de frappe corrigée dans le
README, la réponse est « Leçon non écrite : … le diff et le message de commit suffisent ».

## Une leçon

Deux pistes, selon `problem_type` :
- **bug** : `runtime_error`, `test_failure`, `security_issue`…, avec `symptoms`, `root_cause` et
  `resolution_type` obligatoires ;
- **savoir** : `best_practice`, `convention`, `architecture_pattern`, `tooling_decision`…, avec
  `applies_when` conseillé.

```markdown
---
title: Excel affiche des accents cassés dans les exports CSV
date: 2026-09-12
category: runtime-errors
module: exports
problem_type: runtime_error
component: service_layer
symptoms:
  - "Les accents apparaissent comme Ã© à l'ouverture dans Excel"
root_cause: wrong_api
resolution_type: code_fix
severity: medium
tags: [csv, excel, encodage, bom]
---
# Excel affiche des accents cassés dans les exports CSV
## Problème · ## Symptômes · ## Ce qui n'a pas marché · ## Solution · ## Pourquoi ça marche · ## Prévention
```

La section **« Ce qui n'a pas marché »** est souvent la plus précieuse. Schéma complet :
[`references/learnings-schema.md`](../../references/learnings-schema.md). Validation :
`node $K learnings validate`.

## Bon à savoir

- **Une leçon par exécution.** Plusieurs leçons, c'est plusieurs exécutions successives.
- **Vocabulaire du corpus d'abord** : `component`, `root_cause` et le dossier reprennent les valeurs
  déjà utilisées dans `docs/solutions/` (`node $K learnings stats`), pour que les recherches les
  retrouvent.
- Une leçon existante devenue fausse est **mise à jour**, pas doublée.
- Une leçon qui vaut pour toute l'équipe peut devenir une **règle de pack** : Claude le propose.
- `retire_when` : seulement si la leçon tient à un état hors du repo (bug amont, version d'outil).
- Rien de secret ni de personnel dans une leçon (`<REDACTED>`).

## Voir aussi

[refresh](refresh.md) · [Kaizen Packs](../packs.md) · [metrics](metrics.md)
