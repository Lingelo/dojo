# `/kaizen:ship`

> Livrer en PR que les relecteurs ont envie de relire : petite, qui se raconte d'elle-même, et qui dit
> où regarder.

DORA 2025 l'a mesuré : avec l'IA, les PR grossissent, et **la revue humaine devient le goulot**.
`ship` vérifie, contrôle la taille, pousse, et écrit la description à partir du plan et du diff
réel, avec un **guide du relecteur**.

## En bref

| | |
|---|---|
| **Ce qu'elle fait** | Préconditions → barrières (vérifications vertes, revue faite, taille) → commits et push → description → ouverture ou mise à jour de la PR |
| **Quand l'utiliser** | À la fin de `/kaizen:work` (proposé automatiquement) ; « ouvre la PR » ; « mets à jour la description » |
| **Quand ne pas l'utiliser** | Travail non vérifié ou non revu : `ship` lancera la revue d'abord |
| **Ce qu'elle produit** | Une branche poussée, une PR ouverte (ou mise à jour) et son URL |
| **Et ensuite** | `/kaizen:watch-pr <url>` pour la mener jusqu'à « prête » |

## Exemples

```text
/kaizen:ship
/kaizen:ship docs/plans/…-plan.md draft
/kaizen:ship description-only          # rédige la description sans rien publier
/kaizen:ship refresh-description       # réécrit la description si elle ne correspond plus au diff
```

## Barrières

1. `node $K verify` est vert. Sinon `ship` s'arrête.
2. Une revue `/kaizen:review` a été enregistrée pour ce diff (`node $K review check`). Sinon `ship` la
   lance. Ce n'est pas qu'une consigne : un hook refuse le `git push` d'une branche sans revue
   enregistrée, avec la preuve que des relecteurs ont réellement tourné. Voir
   [Configuration de `review`](../configuration.md#review--la-revue-exigée-avant-git-push).
3. `node $K size` est sous `pr.max_lines`. Au-delà :
   - en interactif, Claude propose des **PR empilées**, une par tranche du plan, chacune basée sur la
     précédente ;
   - en `mode:auto`, il livre en un bloc et justifie la taille dans la PR.

## La description produite

```markdown
## Pourquoi
## Ce qui change              (une puce par exigence couverte : R1, R2…)
## Comment relire             (guide du relecteur : par où commencer, quoi regarder de près, quoi survoler)
## Preuves                    (commandes vertes, AE couverts, verdict de la revue Kaizen)
## Déploiement et retour arrière
## Constitution               (seulement s'il y a des exceptions)
## Points ouverts
```

Elle se termine par le marqueur `<!-- kaizen -->`, qui empêche `watch-pr` de prendre ce texte
pour un retour à traiter. Le titre est un commit conventionnel de 72 caractères au plus :
`feat(SHOP-412): export CSV des commandes filtrées`.

## Options

| Option | Effet |
|---|---|
| `description-only` | rédige et affiche ; ne publie que si vous le demandez |
| `refresh-description` | met à jour la description d'une PR existante si elle a dérivé |
| `draft` | ouvre la PR en brouillon |
| `mode:auto` | aucune question (utilisé par `work`, `autopilot`, `watch-pr`) |

## Bon à savoir

- Jamais de push sur la branche par défaut, jamais de `--force`.
- Pousser sans revue n'est possible que si **vous** le confirmez : Claude lance
  `review waive --reason "…"` et vous tapez le code affiché (`kaizen waive <code>`). La PR porte
  alors une section **« Revue écartée »** avec votre raison.
- Une PR existante pour la branche est **mise à jour**, jamais dupliquée.
- Sans remote, tout reste en commits locaux. Sans `gh`, `ship` passe par les outils GitHub MCP s'ils
  sont disponibles, sinon il donne l'URL et le corps à coller.

## Voir aussi

[watch-pr](watch-pr.md) · [review](review.md) · [Configuration de `pr`](../configuration.md#pr)
