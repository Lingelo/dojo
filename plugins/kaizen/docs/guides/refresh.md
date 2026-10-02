# `/kaizen:refresh`

> Garder les leçons dignes de confiance : chacune est confrontée au code actuel, puis gardée, mise à
> jour, fusionnée, remplacée ou supprimée, preuves à l'appui.

Une leçon fausse est **pire** qu'aucune leçon, parce que `plan` et `review` l'appliquent. `refresh`
est l'entretien du corpus.

## En bref

| | |
|---|---|
| **Ce qu'elle fait** | Valide le frontmatter, vérifie chaque leçon (chemins, symboles, comportement, `retire_when`), détecte doublons et contradictions, classe, applique, rend un rapport |
| **Quand l'utiliser** | Après un gros refactor, une migration ou une montée de version ; quand une leçon s'est révélée fausse ; quand `metrics` montre des leçons jamais réutilisées ; tous les trimestres |
| **Quand ne pas l'utiliser** | Écrire une nouvelle leçon (→ [compound](compound.md)) |
| **Ce qu'elle produit** | Leçons corrigées, un rapport « Appliqué / Recommandé », un commit des seuls fichiers touchés |
| **Et ensuite** | Les contradictions avec des consignes vous sont signalées, à trancher |

## Exemples

```text
/kaizen:refresh                       # tout docs/solutions/
/kaizen:refresh exports               # une zone (dossier, module, mot-clé)
/kaizen:refresh élaguer               # juger aussi la valeur (après confirmation)
/kaizen:refresh mode:auto
```

## Les cinq issues

| Issue | Quand |
|---|---|
| **Garder** | exacte et distincte |
| **Mettre à jour** | le fond tient, des détails ont dérivé (chemin déplacé, nom changé, frontmatter invalide) |
| **Fusionner** | plusieurs leçons disent la même chose : on garde la meilleure, enrichie, et on supprime les autres |
| **Remplacer** | le fond est devenu faux, mais la zone mérite une leçon : réécriture d'après le code actuel |
| **Supprimer** | le problème ne peut plus se produire et la leçon n'apprend plus rien |

Frontière : si un lecteur de l'ancienne version prendrait une **mauvaise décision**, c'est Remplacer.

## Bon à savoir

- **Ne modifie jamais le code produit**, ni une skill, un runbook ou `CLAUDE.md`. Une contradiction
  avec une consigne est **signalée**, avec les deux citations et ce que fait le code.
- En interactif, Remplacer et Supprimer demandent votre accord. En `mode:auto`, ces leçons sont
  seulement marquées « Possiblement périmée » et listées.
- **Invérifiable n'est pas faux** : une leçon sur un comportement de production qu'on ne peut pas
  observer reste en place, avec une note.
- `élaguer` supprime aussi des leçons **exactes** dont le raisonnement est désormais porté par un
  test ou un commentaire. Chaque suppression cite le fichier qui la justifie, et rien ne part sans
  votre confirmation.
- Pas de dossier `_archived` : l'historique git sert d'archive.

## Voir aussi

[compound](compound.md) · [metrics](metrics.md)
