# Correctif (phase 3)

## Séquence test d'abord

1. **Le bon foyer du test de régression** — là où la couverture existante possède déjà ce
   comportement : pars des tests qui existent, pas d'un nouveau fichier. Nomme le test par le
   comportement (« exporte les accents lisibles dans Excel »), pas par le ticket.
2. **Rouge** — écris ou renforce le test, lance-le, constate qu'il échoue **pour la raison de la cause
   racine** (pas pour une erreur de setup).
3. **Correctif minimal** à la cause racine, pas au symptôme.
4. **Vert** — le test passe ; lance ensuite les tests de la zone puis `node "$K" verify`.
5. **Récidive ailleurs ?** — cherche (`Grep`) le même motif fautif dans le repo. Même cause ailleurs →
   corrige aussi si c'est le même correctif ; sinon liste-le dans le résumé.

Un test qui échoue parce que le changement **renverse délibérément** le comportement qu'il affirme
n'a pas une attente fausse : c'est le cas divergent — à faire trancher, pas à « mettre à jour ».

## Correctif raté

3 correctifs sans succès → arrête. La cause racine énoncée est probablement fausse : retourne en
phase 2 avec ce que les échecs ont appris. Ne cumule pas les correctifs : annule ceux qui n'ont pas
marché avant d'essayer autre chose.

## Défense en profondeur (quand c'est justifié)

Si le bug venait d'une valeur invalide qui a traversé plusieurs couches, envisage une validation à la
frontière où elle entre (une seule, la plus en amont) plutôt que des gardes partout. Seulement si la
valeur invalide peut réellement revenir par un autre chemin.

## Post-mortem léger

Le bug a atteint la production, touché des données, ou montré un trou de processus (test absent d'une
catégorie entière, CI qui ne lance pas un dossier) → ajoute au résumé une ligne « Prévention
structurelle » et recommande `/kaizen:learn`.
