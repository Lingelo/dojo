# `/kaizen:debug`

> Trouver la cause, **puis** corriger : chaîne causale complète avec preuves avant tout correctif,
> une hypothèse à la fois.

## En bref

| | |
|---|---|
| **Ce qu'elle fait** | Triage → enquête (reproduction, environnement, traçage à rebours, historique, leçons) → cause racine → correctif test d'abord → passation |
| **Quand l'utiliser** | « Ça plante », « ce test échoue », « c'est lent », « pourquoi X ? », un ticket de bug, une CI rouge |
| **Quand ne pas l'utiliser** | Une fonctionnalité à construire (→ [plan](plan.md)) ; un incident de production à analyser après coup (→ [postmortem](postmortem.md)) |
| **Ce qu'elle produit** | Un résumé de debug (problème, cause racine avec `fichier:ligne`, tests, correctif, prévention, confiance) ; si vous le choisissez, un correctif commité sur `fix/…` |
| **Et ensuite** | Revue du correctif, commit, PR si possible, et `/kaizen:learn` si la cause était surprenante |

## Exemples

```text
/kaizen:debug TypeError: Cannot read properties of undefined (reading 'total') dans /orders/export
/kaizen:debug spec/exports/orders_csv_spec.rb échoue depuis ce matin
/kaizen:debug #482
/kaizen:debug l'export prend 40 s au lieu de 2
```

## Comment ça se passe

1. **Triage** : l'issue est lue si une référence est donnée. Claude reformule :
   « quand <déclencheur>, on observe <symptôme> au lieu de <attendu> », et cherche dans les
   **leçons** : un bug déjà vu raccourcit tout.
2. **Enquête** :
   - la plus petite reproduction possible, idéalement un test rouge ;
   - santé de l'environnement : dépendances, cache, variables d'environnement. Le `git stash` sert à
     tester si le bug vient du travail en cours ;
   - traçage à rebours depuis le symptôme ;
   - `git log -S` et `git bisect run` si « ça marchait avant ».
3. **Cause racine** : chaque hypothèse est écrite avec une prédiction vérifiable, et chaque
   expérience ne change qu'une variable. Après 2 ou 3 hypothèses réfutées, Claude se demande
   **pourquoi son modèle mental est faux** au lieu de deviner encore.
4. **La porte** : Claude écrit d'abord tout le diagnostic (chaîne causale, correctif proposé, tests).
   **Ensuite** il vous demande :
   - corriger maintenant ;
   - diagnostic seulement ;
   - repenser la conception, si aucun correctif propre n'existe dans le design actuel.
5. **Correctif** :
   1. test de régression là où la couverture existante possède ce comportement ;
   2. on le voit rouge pour la bonne raison ;
   3. correctif minimal à la cause ;
   4. vert ;
   5. recherche du même motif fautif ailleurs dans le repo.
6. **Passation** : résumé, revue du correctif, commit des **seuls** fichiers du correctif, PR si
   l'arbre était propre et qu'un remote le permet.

## Options

| Option | Effet |
|---|---|
| `mode:return` | sans question ; applique seulement un correctif **convergent** (qui rétablit le comportement voulu). Un correctif qui renverserait une décision délibérée est différé. Utilisé par `autopilot` et `watch-pr`. |

## Bon à savoir

- Trois correctifs ratés → arrêt. La cause racine énoncée est probablement fausse.
- Les secrets dans les logs sont remplacés par `<REDACTED>` avant d'être montrés ou écrits.
- Sans ticket fourni, aucun ticket n'est créé « pour faire propre ».
- « Flaky » n'est pas une cause : un deuxième échec identique est réel.

## Voir aussi

[postmortem](postmortem.md) · [learn](learn.md) · [watch-pr](watch-pr.md)
