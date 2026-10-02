# `/kaizen:decide`

> Un verdict fondé sur des preuves pour une décision difficile ou irréversible, puis un ADR pour que
> la raison survive à la conversation.

Adopter une technologie, choisir entre deux architectures, migrer, accepter une dette : `decide`
compare de vraies options sur des preuves du projet (code, leçons, constitution, ADR passés) et des
sources externes datées. Il donne une recommandation avec son **niveau de confiance** et le **signal
qui ferait changer d'avis**.

## En bref

| | |
|---|---|
| **Ce qu'elle fait** | Cadre la question, ancre (décisions passées, code, doc externe), compare 2 à 4 options dont « ne rien faire », attaque sa propre recommandation, écrit l'ADR |
| **Quand l'utiliser** | « Faut-il adopter X ? », « A ou B ? », « on migre vers… ? », une KTD du plan trop lourde pour une ligne, « documente cette décision » |
| **Quand ne pas l'utiliser** | Une décision facile à défaire (un revert suffit) : demandez simplement ; chercher des idées (→ [ideate](ideate.md)) |
| **Ce qu'elle produit** | Un verdict dans le chat, puis `docs/adr/NNNN-<titre>.md` (statut `proposed` ou `accepted`) |
| **Et ensuite** | L'ADR est cité par le plan concerné ; Claude propose une règle de pack ou un amendement si la décision crée une règle durable |

## Exemples

```text
/kaizen:decide Temporal ou garder Sidekiq pour les workflows de facturation ?
/kaizen:decide passer de REST à GraphQL pour l'API mobile ?
/kaizen:decide adr-only on a choisi Postgres LISTEN/NOTIFY plutôt que Redis pour les notifications
```

## Comment ça se passe

1. **Cadrage** : une question décidable, sa **réversibilité** (facile, coûteuse, irréversible) et les
   critères qui comptent ici. Plus c'est irréversible, plus la barre de preuve monte.
2. **Ancrage**, en parallèle :
   - les ADR et leçons passés (obligatoire) ;
   - le code, via `repo-researcher` ;
   - l'histoire, via `git-historian` ;
   - les sources externes, via `docs-researcher` : maturité, maintenance, licence, compatibilité
     avec **vos** versions, sources primaires et datées.
3. **Comparaison** : un tableau critères × options, et la prose qui explique ce que le tableau ne dit
   pas.
4. **Pré-mortem** : « dans un an, cette décision s'est révélée mauvaise : pourquoi ? ».
5. **Verdict**, au format :

   ```markdown
   **Recommandation : B** — confiance moyenne
   Pourquoi : …   À quelles conditions : …   Ce qui me ferait changer d'avis : …
   Coût / prochain pas : un pilote derrière un flag sur un seul workflow
   ```

6. **Vous tranchez.** Votre décision fait foi, même si elle diffère de la recommandation. L'ADR
   consigne les deux.

## L'ADR

```markdown
---
title: Les exports passent par une file de jobs
date: 2026-10-02
status: accepted          # proposed | accepted | rejected | superseded
deciders: [angelo]
reversibility: coûteuse
review_by: 2027-04-01
artifact: kaizen-adr/v1
---
# 0003. Les exports passent par une file de jobs
## Contexte · ## Options · ## Décision · ## Conséquences · ## Signal de révision
```

Numérotation automatique : `node $K adr new --title "…"`. Liste : `node $K adr list`. Un ADR qui en
remplace un autre met l'ancien en `superseded`. Gabarit : [`templates/adr.md`](../../templates/adr.md).

## Bon à savoir

- **Pas de verdict sans preuve.** Si une information décisive manque et reste introuvable, la
  réponse est « Bloqué — contexte manquant », avec ce qu'il faut pour débloquer.
- Les ADR sont relus par `learnings-researcher` : une décision acceptée contraint les plans suivants.
- Pour les choix les plus lourds, l'agent `architect` du plugin `experts` reste un bon complément.

## Voir aussi

[plan](plan.md) · [constitution](constitution.md) · [compound](compound.md)
