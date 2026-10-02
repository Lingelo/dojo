# `/kaizen:ideate`

> « Qu'est-ce qui vaudrait la peine d'être construit ? » : beaucoup d'idées ancrées dans le repo,
> toutes critiquées, 5 à 7 survivantes expliquées.

`ideate` vient **avant** le brainstorm. Il ne précise pas une idée, il en cherche. Chaque idée doit
avoir une **base vérifiable** (une ligne de code, une issue, une leçon, une source externe, ou un
raisonnement écrit de bout en bout). Une idée sans base est jetée, aussi séduisante soit-elle.

## En bref

| | |
|---|---|
| **Ce qu'elle fait** | Ancrage dans le repo, 5 générateurs d'idées en parallèle (chacun avec un angle), vérification à froid par un agent qui n'a pas vu la génération, rejet motivé, classement |
| **Quand l'utiliser** | « Que pourrait-on améliorer dans X ? », « surprends-moi », en préparation d'un trimestre, après une série de bugs dans une zone |
| **Quand ne pas l'utiliser** | Vous avez déjà une idée à préciser (→ [brainstorm](brainstorm.md)) ; vous devez trancher entre deux options (→ [decide](decide.md)) |
| **Ce qu'elle produit** | `docs/ideation/AAAA-MM-JJ-<sujet>-ideation.md` : ancrage, axes, idées classées, combinaisons, rejets motivés |
| **Et ensuite** | `/kaizen:brainstorm` sur l'idée retenue |

## Exemples

```text
/kaizen:ideate le tunnel de commande
/kaizen:ideate surprends-moi
/kaizen:ideate l'onboarding des nouveaux développeurs top 3
/kaizen:ideate la page de facturation rapide
/kaizen:ideate l'observabilité en profondeur
```

## Comment ça se passe

1. **Sujet** : sans sujet, Claude demande (« Surprends-moi » est une vraie option). Le périmètre
   demandé est respecté : « la page de facturation » ne déborde pas sur tout le produit.
2. **Ancrage** :
   - repo, plans récents, leçons (les zones à beaucoup de bugs sont des frictions documentées) ;
   - issues ouvertes regroupées en thèmes, si `gh` est disponible.
3. **Axes** : le sujet est découpé en 3 à 5 parties orthogonales, pour ne pas tout concentrer sur
   une seule.
4. **Génération** : 5 agents en parallèle, avec 6 à 8 idées chacun. Les angles :
   - frictions ;
   - inversion, suppression ou automatisation ;
   - hypothèses cassées ;
   - effet de levier ;
   - analogies venues d'autres domaines et contraintes renversées.
5. **Combinaisons** : les idées de deux angles qui ensemble valent plus que séparément.
6. **Critique** : un agent neuf vérifie chaque base, puis Claude tranche. Chaque rejet a un motif :
   trop vague, non ancrée, doublon, trop chère, déborde du périmètre…
7. **Document** et résumé de 5 à 7 lignes dans le chat.

## Options

| Option | Effet |
|---|---|
| `surprends-moi` | pas de sujet imposé ; chaque angle choisit le sien |
| `top N` | N survivantes (la génération ne change pas) |
| `rapide` | 3 à 4 idées par angle |
| `en profondeur` | plus de vérification par idée |

## Bon à savoir

- Le coût (nombre d'agents) est annoncé avant le lancement.
- Un document d'idéation de moins de 30 jours sur le même sujet est **enrichi** plutôt que dupliqué.
- `ideate` ne planifie jamais : il envoie toujours vers le brainstorm.

## Voir aussi

[brainstorm](brainstorm.md) · [decide](decide.md)
