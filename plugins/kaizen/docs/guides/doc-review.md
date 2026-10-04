# `/kaizen:doc-review`

> Relire le plan **avant** de construire : un défaut corrigé dans un plan coûte une phrase, dans du
> code une PR de plus.

`doc-review` combine un contrôle déterministe (`plan check`) et des relecteurs spécialisés en
parallèle. Ce qui est mécanique est corrigé directement. Ce qui demande une décision vous est
présenté, une question à la fois. Un plan déjà bon ne reçoit aucun changement.

## En bref

| | |
|---|---|
| **Ce qu'elle fait** | `plan check`, puis 2 à 6 relecteurs, vérification de leurs constats, corrections sur place, décisions soumises |
| **Quand l'utiliser** | Automatiquement à la fin de chaque `/kaizen:plan` ; manuellement sur un plan écrit à la main ou ancien |
| **Quand ne pas l'utiliser** | Relire du **code** (→ [review](review.md)) |
| **Ce qu'elle produit** | Le plan corrigé sur place, et un rapport : verdict ✅ / ⚠️ / ⛔, équipe, corrections appliquées, décisions prises, points restants |
| **Et ensuite** | `/kaizen:work` si ✅ ; répondre aux décisions si ⚠️ ; retour au plan si ⛔ |

## Exemples

```text
/kaizen:doc-review                                    # dernier plan
/kaizen:doc-review docs/plans/2026-10-02-1430-feat-export-csv-commandes-plan.md
/kaizen:doc-review docs/plans/… mode:auto             # sans question (utilisé par plan et autopilot)
```

## L'équipe de relecture

| Relecteur | Quand | Cherche |
|---|---|---|
| `plan-coherence-reviewer` | toujours | contradictions entre sections, vocabulaire qui dérive, références cassées, ambiguïtés, objectif qui ne survit pas à son mécanisme, traçabilité |
| `plan-feasibility-reviewer` | toujours | interfaces inexistantes (il lit le code), dépendances absentes, ordre impossible, retour arrière illusoire, commandes de vérification inexistantes |
| `plan-scope-reviewer` | tout plan prêt ; exigences nombreuses | mécanismes non demandés, dérive de périmètre, tranches trop grosses, exceptions à la constitution faibles |
| `plan-security-reviewer` | auth, données sensibles, paiement, endpoints, intégrations | menaces manquantes, autorisation non spécifiée, secrets, frontières de confiance |
| `plan-adversarial-reviewer` | domaine à enjeu, nouvelle abstraction, plan sans brainstorm, périmètre élargi | prémisses fausses, hypothèses non vérifiées, engagements irréversibles, scénario d'échec à 6 mois |
| `plan-design-reviewer` | écrans, formulaires, parcours | états non spécifiés (vide, chargement, erreur), accessibilité, responsive, cohérence avec le design system |

L'équipe retenue vous est annoncée, avec la raison de chaque relecteur conditionnel.

## Comment les constats sont traités

1. Dédoublonnés. Deux relecteurs qui disent la même chose renforcent la confiance.
2. Filtrés :
   - confiance 75 ou 100 retenue ;
   - confiance 50 seulement si P0 ;
   - citation introuvable dans le plan : constat rejeté.
3. **Chaque P0 et P1 est revérifié par l'orchestrateur**, qui relit le passage et le code cité.
4. Un constat qui remet en cause une décision déjà prise sans prouver qu'elle ne peut pas marcher
   est retiré.
5. Corrections :
   - `safe_auto` (référence, compte, terme) : appliquée directement ;
   - `gated_auto` qui précise sans changer de décision : appliquée aussi ;
   - le reste devient une question pour vous.

Exemple réel, tiré d'une évaluation : sur un plan de génération de slugs, le relecteur adversarial
a trouvé que la normalisation des accents ne décompose pas `œ`, `æ` et `ß`. Le plan a été corrigé
avec un nouvel exemple d'acceptation : « Cœur de ß » → `coeur-de-ss`.

## Bon à savoir

- ⛔ si un P0 reste ou si `plan check` échoue encore.
- Les corrections sont faites **dans le format du document**, sans section « corrections » empilée.
- Contrat des relecteurs : [`references/doc-review-contract.md`](../../references/doc-review-contract.md).

## Voir aussi

[plan](plan.md) · [review](review.md) · [constitution](constitution.md)
