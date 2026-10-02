# `/kaizen:metrics`

> Est-ce qu'on s'améliore vraiment ? Les indicateurs DORA, approchés depuis git et GitHub, plus
> l'indicateur propre à Kaizen : les leçons sont-elles réutilisées ?

## En bref

| | |
|---|---|
| **Ce qu'elle fait** | Calcule les indicateurs sur une fenêtre, dit comment chacun est calculé et ses limites, en tire 2 ou 3 constats et 1 à 3 actions |
| **Quand l'utiliser** | Rétrospective, point trimestriel, « est-ce que Kaizen sert à quelque chose ? », après avoir changé une pratique |
| **Quand ne pas l'utiliser** | Pour juger des personnes : ces indicateurs mesurent un système de livraison, pas des individus |
| **Ce qu'elle produit** | Un rapport court (30 lignes au plus), et sur demande `docs/metrics/AAAA-MM-JJ.md` pour suivre la tendance |
| **Et ensuite** | Les actions renvoient vers une skill : `refresh`, découpage en tranches, `constitution amend`… |

## Exemples

```text
/kaizen:metrics                # 90 derniers jours
/kaizen:metrics 30d
/kaizen:metrics 12w comparer   # avec la fenêtre précédente
```

Brut : `node $K metrics --since 90d` (ajoutez `--no-github` si `gh` n'est pas authentifié).

## Les indicateurs

| Indicateur | Méthode (approximation) | Lecture |
|---|---|---|
| Fréquence de livraison | changements arrivés sur la branche par défaut, par semaine | plus haute et régulière = petits lots qui s'intègrent vite |
| Délai de changement | médiane ouverture → merge des PR (GitHub), sinon premier commit → merge (git) | un délai long vient souvent de la revue |
| Taux de reprise | part des changements de type fix, hotfix ou revert | en hausse = on livre des défauts |
| Taux d'échec des changements | changements suivis, sous 7 jours, d'un fix ou d'un revert sur les mêmes fichiers | instabilité |
| Temps de rétablissement | médiane `detected` → `resolved` des post-mortems | capacité à revenir en arrière |
| Taille des lots | médiane, 90e centile, part au-dessus de `pr.max_lines` | **le premier levier** selon DORA |
| **Boucle Kaizen** | leçons totales et nouvelles, leçons **citées** par les plans récents, exceptions à la constitution, ADR | l'effet cumulatif |

## Lire honnêtement

- Ce sont des **approximations** depuis la branche par défaut, pas une mesure de votre système de
  déploiement. Chaque indicateur affiche sa méthode.
- Limites signalées :
  - clone superficiel (`--depth`) ;
  - merges squash sans accès GitHub (délai indisponible) ;
  - moins de 10 changements dans la fenêtre : pas de tendance.
- **Leçons écrites mais jamais citées** : la boucle ne se referme pas. Voir le
  [dépannage](../depannage.md#les-leçons-ne-sont-pas-réutilisées).

## Voir aussi

[postmortem](postmortem.md) · [refresh](refresh.md) · [release](release.md)
