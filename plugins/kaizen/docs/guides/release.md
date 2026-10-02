# `/kaizen:release`

> Des notes de version que les utilisateurs lisent, une version SemVer qui dit la vérité, et une
> checklist de mise en production. Sans jamais taguer ni publier sans votre accord.

## En bref

| | |
|---|---|
| **Ce qu'elle fait** | Collecte les commits conventionnels depuis le dernier tag, vérifie le niveau SemVer (cherche les changements cassants cachés), rédige les notes, met à jour le CHANGELOG et la version dans l'arbre de travail (sans commiter), établit la checklist de mise en production |
| **Quand l'utiliser** | « Prépare la release », « notes de version », « quelle version ? », « changelog » |
| **Quand ne pas l'utiliser** | Livrer une PR (→ [ship](ship.md)) |
| **Ce qu'elle produit** | Notes de version, version proposée, entrée de `CHANGELOG.md` (format Keep a Changelog), checklist |
| **Et ensuite** | `publish` pour taguer et créer la release GitHub, après confirmation |

## Exemples

```text
/kaizen:release
/kaizen:release --from v2.3.0
/kaizen:release publish
```

## Comment ça se passe

1. `node $K release notes` : commits regroupés, changements cassants (`!` ou `BREAKING CHANGE:`),
   version proposée. En 0.x, un changement cassant fait monter le mineur.
2. **Vérification** : les diffs des interfaces publiques (routes, schémas, exports de package) sont
   lus, pour qu'un changement cassant ne se cache pas dans un `fix`. Les fichiers de version du
   projet (`package.json`, `pyproject.toml`, `plugin.json`…) sont comparés à la version proposée.
3. **Rédaction pour les utilisateurs** : une phrase par changement, regroupée (Nouveautés,
   Corrections, Performances, Changements cassants **avec migration**), sans le bruit (chore, ci,
   tests).
4. **Checklist de mise en production**, tirée des plans livrés (section `kaizen:rollout`) :
   - vérifications et CI vertes ;
   - migrations et leur ordre ;
   - feature flags ;
   - retour arrière et ce qui est irréversible ;
   - signaux à surveiller ;
   - communication.
5. **Publication** (avec `publish` et confirmation) :
   1. fichiers de version mis à jour ;
   2. `chore(release): vX.Y.Z` ;
   3. tag annoté ;
   4. push ;
   5. `gh release create`.

## Bon à savoir

- La politique IA de la constitution peut interdire la publication par un agent : elle prime.
- Les commits non conventionnels sont comptés et classés à la main par Claude, en lisant leur diff.

## Voir aussi

[ship](ship.md) · [metrics](metrics.md)
