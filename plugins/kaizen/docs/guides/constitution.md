# `/kaizen:constitution`

> Les principes d'ingénierie que le projet ne négocie pas, chacun avec un contrôle que le plan doit
> passer et que la revue vérifie.

`CONSTITUTION.md` dit **comment on construit ici** et **ce qu'un agent a le droit de faire seul**.
Ce n'est pas une liste de bonnes intentions : un principe sans contrôle vérifiable n'est jamais
appliqué, alors chaque article en porte un. L'idée vient du Spec Kit de GitHub. Kaizen l'applique
par des contrôles mécaniques plutôt que par des rappels.

## En bref

| | |
|---|---|
| **Ce qu'elle fait** | Interview (avec relances et stress test) qui produit 5 à 9 articles, une politique IA et une gouvernance. Elle sait aussi amender et auditer. |
| **Quand l'utiliser** | Au démarrage de Kaizen sur un projet ; après un post-mortem qui révèle un principe manquant ; quand une exception revient trop souvent |
| **Quand ne pas l'utiliser** | Pour une règle de domaine précise (→ [pack](../packs.md)) ; pour une leçon (→ [compound](compound.md)) ; pour une fonctionnalité (→ [brainstorm](brainstorm.md)) |
| **Ce qu'elle produit** | `CONSTITUTION.md` à la racine, versionnée en SemVer, validée par `node $K constitution check` |
| **Et ensuite** | `/kaizen:brainstorm` : la constitution cadre désormais chaque plan et chaque revue |

## Exemples

```text
/kaizen:constitution                       # première écriture (ou choix amend/audit si elle existe)
/kaizen:constitution amend article IV      # modifier un article, avec raison et impact
/kaizen:constitution amend ajouter un principe sur l'idempotence des webhooks
/kaizen:constitution audit                 # les articles sont-ils vraiment appliqués ?
```

## Comment ça se passe

1. **Lecture du repo** : CI, outils de test et de lint, `CLAUDE.md`, packs, types de leçons les plus
   fréquents. Claude vous dit ce qu'il en retient et vous corrigez.
2. **La question qui fait mal** : « Quand un changement a coûté cher ici, qu'est-ce qui aurait dû
   l'empêcher en amont ? »
3. **Candidats** : il propose 5 à 8 articles adaptés au repo, parmi ces familles : preuve d'abord,
   simplicité, pas d'abstraction prématurée, petits lots, sécurité par défaut, compatibilité,
   observabilité, réversibilité, politique IA. Vous gardez, réécrivez ou ajoutez.
4. **Un contrôle par article.** Claude relance les principes vagues : « du code de qualité » devient
   « comment un relecteur le verrait-il dans une PR ? ». Les règles qu'un linter impose déjà sont
   écartées.
5. **NON NÉGOCIABLE** : réservé à 1 à 3 articles. Les autres peuvent prévoir des exceptions, à
   justifier dans le plan.
6. **Politique IA** (obligatoire) : ce que l'agent fait seul, ce qui exige un humain, ce qu'il ne
   fait jamais.
7. **Stress test** : 3 à 5 cas concrets. Si la constitution ne tranche pas un cas, l'article est
   affûté.
8. Le texte complet vous est montré et vous le corrigez une fois. Puis l'écriture et la validation.

## Format d'un article

```markdown
### I. Preuve d'abord — NON NÉGOCIABLE

Tout changement de comportement arrive avec un test qui échouait avant le changement.

**Contrôle :** chaque unité du plan a-t-elle une stratégie de preuve, et la PR un test qui échouait sur la base ?

**Exceptions :** renommages, configuration pure, fichiers générés — raison et vérification de remplacement dans le plan.
```

Numérotation romaine continue, y compris dans la section « Politique IA ». Frontmatter : `name`,
`version`, `ratified`, `last_amended`, `artifact: kaizen-constitution/v1`. Gabarit :
[`templates/constitution.md`](../../templates/constitution.md).

## Comment elle est appliquée

| Où | Comment |
|---|---|
| `/kaizen:plan` | section « Contrôle constitutionnel » : un verdict par article, exceptions justifiées |
| `node $K plan check` | échoue si un article n'est pas évalué |
| `/kaizen:doc-review` | le relecteur de périmètre vérifie les exceptions |
| `/kaizen:review` | le relecteur `standards` applique chaque **Contrôle** au diff : violation d'un article NON NÉGOCIABLE = P0, d'un autre article = P1 |
| `/kaizen:ship` | les exceptions sont rappelées dans la PR |

## Amender

Un amendement a toujours une **raison** (post-mortem, leçon récurrente, exception trop fréquente) et
une **analyse d'impact** : plans en cours, packs et leçons qui deviennent contradictoires. Version :
- MAJEURE si un article est retiré ou redéfini de façon incompatible ;
- MINEURE si un article est ajouté ou élargi ;
- CORRECTIF si c'est une clarification.

L'amendement est noté dans un journal `## Amendements` en bas du fichier.

## Bon à savoir

- Sans constitution, tout Kaizen fonctionne. Vous perdez seulement les contrôles propres au projet.
- En cas de conflit : constitution > packs > leçons > préférences.
- `audit` regarde les 10 dernières PR et les plans récents. Un article jamais vérifié est déclaré
  « mort », et Claude propose de l'amender ou de le retirer.

## Voir aussi

[plan](plan.md) · [review](review.md) · [postmortem](postmortem.md) · [Kaizen Packs](../packs.md)
