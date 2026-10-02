# `/kaizen:lfg`

> De la demande à la PR « semble prête », en autonomie : la bonne skill à chaque étape, rien qui
> s'arrête sans raison, rien d'irréversible sans votre accord.

## En bref

| | |
|---|---|
| **Ce qu'elle fait** | Route la demande, produit une source de travail (plan ou correctif), puis enchaîne work → simplification → revue avec correctifs → compound → tests navigateur → ship → babysit-pr |
| **Quand l'utiliser** | Vous voulez explicitement un travail de bout en bout sans suivi pas à pas, idéalement **après un brainstorm** |
| **Quand ne pas l'utiliser** | Vous voulez valider chaque étape (→ `plan`, `work`, `ship` séparément) ; la demande est encore floue et vous n'êtes pas là pour répondre |
| **Ce qu'elle produit** | Une PR ouverte, revue et suivie jusqu'à un état vrai, et le rapport `DONE` |
| **Et ensuite** | **Vous mergez.** |

## Exemples

```text
/kaizen:brainstorm export CSV des commandes
/kaizen:lfg                                     # sur le plan que le brainstorm vient d'écrire
/kaizen:lfg docs/plans/…-plan.md
/kaizen:lfg le test orders_csv_spec échoue depuis la montée de version de Rails
```

## Le routage

| La demande est… | Route |
|---|---|
| un chemin de plan, ou un plan écrit dans la session | directement à l'implémentation |
| un bug concret (symptôme, test rouge, ticket) | `debug mode:return` |
| une forme produit ambiguë | `brainstorm` si vous êtes là, sinon `plan mode:return` (hypothèses consignées) |
| un résultat qui n'est pas du code (idées, explication) | la skill concernée, et c'est tout |
| tout autre changement de code | `plan mode:return` |

Pas de raccourci pour un « petit » changement : plan, garde-fou, `verify` et revue tournent toujours.
Seules la simplification (petit diff) et la livraison (pas de remote) peuvent être sautées.

## La course

1. **Source de travail** : un plan prêt (qui passe `plan check` et `doc-review`), ou un correctif de
   `debug`.
2. `work mode:return`, avec le **garde-fou actif pendant toute la course**.
3. Simplification.
4. `review mode:agent`. Un constat qui montre qu'une décision acquise ne peut pas marcher arrête tout,
   avant tout push.
5. Correctifs P0/P1 et `gated_auto` P2, vérifiés et commités.
6. Le reste est consigné dans la PR (« Points ouverts »).
7. `compound mode:auto`, si la course a produit une leçon durable.
8. Tests navigateur si l'interface est touchée et qu'un outil est disponible.
9. `ship mode:auto`.
10. `babysit-pr mode:pipeline` : au plus 2 correctifs par cause, aucun test désactivé.
11. `gate off`, rapport, `DONE`.

```text
DONE — Export CSV des commandes
PR : https://github.com/acme/shop/pull/42 — ✅ semble prête
Plan : docs/plans/…-plan.md · Unités : 3/3 · Revue : 1 P1 corrigé, 2 P3 consignés · Leçon : docs/solutions/…
```

## Bon à savoir

- **Questions** : seulement à travers le brainstorm, et seulement si vous êtes présent. Le reste
  avance : ce qui est réversible est fait puis montré.
- **Ce qui arrête la course** :
  - une action irréversible hors de ce qui a été accordé (merge, push forcé, suppression de données,
    déploiement) ;
  - une source de travail impossible à produire ;
  - un retour enfant incomplet ;
  - une décision acquise invalidée.

  Un arrêt ne pousse rien de nouveau et explique comment reprendre.
- Sans remote : tout reste en commits locaux.
- La qualité de `lfg` dépend de la qualité du plan. Lancez-le après un brainstorm plutôt que sur une
  phrase.

## Voir aussi

[brainstorm](brainstorm.md) · [plan](plan.md) · [work](work.md) · [babysit-pr](babysit-pr.md)
