---
title: {{Ce qui s'est passé, en une ligne factuelle}}
date: {{YYYY-MM-DD}}
severity: {{SEV1 | SEV2 | SEV3}}
detected: {{YYYY-MM-DDTHH:MM:SSZ}}
resolved: {{YYYY-MM-DDTHH:MM:SSZ}}
services: [{{service}}]
artifact: kaizen-postmortem/v1
---

# {{Titre}}

> Post-mortem **sans recherche de coupable** : chacun a agi au mieux avec l'information qu'il avait.
> « Erreur humaine » est le début de l'analyse, jamais sa conclusion.

## Résumé
{{3 à 5 lignes : quoi, qui a été touché, combien de temps, comment c'est revenu.}}

## Impact
- Utilisateurs / clients touchés : …
- Durée : de {{détection}} à {{résolution}} ({{durée}}) — début réel estimé : …
- Données : perdues / corrompues / exposées : …

## Chronologie (UTC)
| Heure | Événement | Source |
|---|---|---|
| … | déploiement de `<sha>` | git / CI |

## Facteurs contributifs
{{Plusieurs, en général. Pour chacun : ce qui l'a rendu possible (processus, outil, test absent,
alerte manquante, documentation), pas qui.}}

## Ce qui a bien marché
## Ce qui a manqué de peu

## Actions
| Action | Type | Porteur | Échéance | Suivi |
|---|---|---|---|---|
| … | prévention / détection / atténuation / processus | … | … | ticket / PR |

## Boucle Kaizen
- Leçon(s) : `docs/solutions/…` (via /kaizen:compound)
- Règle de pack ou amendement de constitution proposé : …
- Test ou contrôle ajouté pour que ça ne repasse pas : …
