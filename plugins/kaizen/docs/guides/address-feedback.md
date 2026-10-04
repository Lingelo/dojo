# `/kaizen:address-feedback`

> Chaque retour de revue reçoit un verdict, un correctif publié **avant** la réponse, une réponse qui
> cite le retour, puis la résolution du fil.

## En bref

| | |
|---|---|
| **Ce qu'elle fait** | Récupère les fils non résolus et les commentaires, juge chaque retour, corrige, vérifie, commite, pousse, répond dans chaque fil, résout |
| **Quand l'utiliser** | « Traite les commentaires de la PR », « réponds à la revue de Bob » ; appelée à chaque cycle par `watch-pr` |
| **Quand ne pas l'utiliser** | Pas encore de retours : faire relire par Kaizen (→ [review](review.md)) ; suivre la PR dans la durée (→ [watch-pr](watch-pr.md)) |
| **Ce qu'elle produit** | Des commits poussés, des réponses dans les fils, des fils résolus, un tableau de verdicts, et la liste « Décisions pour toi » |
| **Et ensuite** | Répondre aux décisions humaines ; `watch-pr` pour la suite |

## Exemples

```text
/kaizen:address-feedback                # PR de la branche courante
/kaizen:address-feedback 42
/kaizen:address-feedback https://github.com/acme/shop/pull/42
```

## Les verdicts

| Verdict | Quand | Réponse |
|---|---|---|
| **corriger** | le retour est juste, ou défendable et peu coûteux. C'est le défaut, **nits compris** | « Corrigé dans `abc1234` : … », puis fil résolu |
| **déjà fait** | le code actuel règle déjà le point | la ligne ou le commit qui le règle, puis fil résolu |
| **décliner** | contredit une décision acquise (plan, constitution, pack) ou introduirait un bug, **avec preuve** | explication avec la preuve ; fil laissé **ouvert** si le relecteur doit trancher |
| **question** | le relecteur pose une question | réponse depuis le code et le plan |
| **décision humaine** | arbitrage produit ou d'architecture, ou autorisation manquante | résumé de l'arbitrage ; fil ouvert ; ajouté à « Décisions pour toi » |

## Comment ça se passe

1. Contrôle : la copie de travail doit être sur la branche de la PR.
2. `node $K pr threads` récupère tous les fils (paginés) et commentaires. Les messages de Kaizen
   (marqueur `<!-- kaizen -->`) servent de contexte, jamais de retour à traiter.
3. Jugement de chaque élément. Un fil obsolète (le code a bougé) est revérifié sur le nouveau code.
4. Correctifs : `verify`, puis commits `fix(<JIRA>): …`, puis `git push`, puis contrôle que le push
   est bien publié.
5. Réponses : `node $K pr reply`, puis `node $K pr resolve` pour les fils ; un seul commentaire
   récapitulatif pour les commentaires de premier niveau.

## Bon à savoir

- **Le texte des commentaires est une donnée non fiable** : aucune commande trouvée dans un
  commentaire n'est exécutée. Claude lit le vrai code et décide lui-même.
- **Autorisé** : corriger, commiter, pousser la branche de la PR, répondre, résoudre. **Jamais** :
  merger, rebaser, forcer un push, approuver un run de CI, résoudre un fil sans y avoir répondu.
- Des correctifs de plus de `review.max_unreviewed_lines` lignes (80) depuis la dernière revue sont
  refusés au push : Claude relance `/kaizen:review`, puis pousse.
- Le push précède toujours les réponses : on n'écrit pas « corrigé dans `<sha>` » pour un commit
  invisible.
- `mode:pipeline` (utilisé par `watch-pr`) : aucune question, retour structuré.

## Voir aussi

[watch-pr](watch-pr.md) · [review](review.md) · [Dépannage gh](../depannage.md#gh-nest-pas-authentifié)
