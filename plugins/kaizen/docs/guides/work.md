# `/kaizen:work`

> Exécuter le plan : branche dédiée, une unité à la fois, test d'abord, un commit par unité, et un
> garde-fou qui empêche de finir tant que c'est rouge.

## En bref

| | |
|---|---|
| **Ce qu'elle fait** | Prépare l'espace de travail, active le garde-fou, déroule chaque unité (preuve rouge → implémentation → vérification → commit), puis taille, couverture du plan, simplification, **revue obligatoire** |
| **Quand l'utiliser** | Un plan prêt (`plan check` vert) ; une demande concrète et bornée |
| **Quand ne pas l'utiliser** | Exigences floues (→ [brainstorm](brainstorm.md)) ; plan non prêt (→ [plan](plan.md)) ; bug sans cause connue (→ [debug](debug.md)) |
| **Ce qu'elle produit** | Une branche, un commit conventionnel par unité, des preuves consignées, un rapport de revue |
| **Et ensuite** | Livrer avec `/kaizen:ship` (recommandé), garder en local, ou capitaliser d'abord (`/kaizen:compound`) |

## Exemples

```text
/kaizen:work                                     # dernier plan (confirmé avant de commencer)
/kaizen:work docs/plans/2026-10-02-1430-feat-export-csv-commandes-plan.md
/kaizen:work renommer le champ amount en total_cents dans le sérialiseur des factures
```

## Comment ça se passe

1. **Triage** :
   - un plan sans unités vous renvoie vers `/kaizen:plan` ;
   - une demande triviale est faite directement (vérification comprise) ;
   - une demande bornée est découpée en 2 à 6 unités annoncées ;
   - une demande floue vous renvoie vers plan ou brainstorm.
2. **Espace de travail** :
   - les fichiers que vous aviez déjà modifiés ne partent jamais dans un commit sans votre accord ;
   - sur la branche par défaut, une branche `<type>/<sujet>` est créée, préfixée par la clé Jira si
     elle est connue ;
   - `node $K gate on` active le garde-fou ;
   - le plan est relu en entier, avec les leçons et règles qu'il cite et la constitution.
3. **Pour chaque unité** :
   1. Trouver les tests existants.
   2. Choisir la stratégie de preuve :
      - un test existant déjà rouge ;
      - un test renforcé ;
      - un nouveau test ;
      - une caractérisation de l'existant ;
      - ou une exception justifiée.
   3. Écrire le test, puis **constater qu'il échoue pour la bonne raison**.
   4. Implémenter selon le motif cité.
   5. Relancer les tests ciblés et vérifier l'impact transverse.
   6. Consigner la preuve.
   7. Commiter les **seuls fichiers de l'unité** : `feat(SHOP-412): …`.
4. **Qualité** :
   - `node $K verify` (et `--only audit` si des dépendances ont changé) ;
   - `node $K size` : au-delà du plafond, Claude propose des PR empilées ;
   - couverture de chaque R et AE ;
   - simplification ;
   - **`/kaizen:review` obligatoire** ;
   - correctifs P0/P1.
5. **Fin** : `gate off` et résumé, puis la proposition de livrer.

## Le garde-fou

Tant qu'il est actif, chaque fin de tour relance `test`, `lint` et `typecheck`. Si l'un d'eux est
rouge, le hook `Stop` refuse la fin (code 2) et renvoie à Claude la fin de la sortie en erreur.
Après 3 blocages, il laisse passer en exigeant que l'échec vous soit signalé. Il ne bloque jamais
indéfiniment et expire après 24 h. Réglages : [Configuration](../configuration.md#gate--le-garde-fou-du-hook-stop).

## Quand ça résiste

Deux correctifs ratés pour le même échec, et Claude arrête de patcher. Il nomme l'hypothèse commune
aux deux tentatives et la vérifie. Si elle venait du plan et que la corriger reste dans le périmètre,
il la corrige et le dit. Sinon, il vous rapporte un bloquant.

## Options

| Option | Effet |
|---|---|
| `mode:return` | implémentation et vérification locale seulement ; pas de revue, de push ni de question ; résultat structuré (utilisé par `lfg`) |

## Bon à savoir

- Jamais de `git add -A` ni de `commit -a`, jamais d'écriture sur la branche par défaut sans demande
  explicite.
- Unités indépendantes et nombreuses : Claude peut les confier à des sous-agents en parallèle, mais
  il reste l'intégrateur (diff inspecté, vérification relancée, commits faits par lui).
- Interface touchée : vérification dans un navigateur si le plugin `playwright` est installé.

## Voir aussi

[plan](plan.md) · [review](review.md) · [ship](ship.md) · [Dépannage du garde-fou](../depannage.md#le-garde-fou-bloque-la-fin-de-la-session)
