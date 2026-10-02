# `/kaizen:babysit-pr`

> Mener une PR ouverte jusqu'à « semble prête à merger » : retours traités, CI réparée, branche à
> jour quand GitHub le demande. Puis s'arrêter et vous laisser merger.

## En bref

| | |
|---|---|
| **Ce qu'elle fait** | Cycles successifs : retours de revue **avant** la CI, réparation de la CI du commit de tête, mise à jour de la branche sur signal, attente sans tokens entre deux cycles |
| **Quand l'utiliser** | Après `/kaizen:ship` ; « surveille ma PR » ; « mène-la jusqu'au merge » |
| **Quand ne pas l'utiliser** | Un seul commentaire (→ [resolve-pr-feedback](resolve-pr-feedback.md)) ; un seul échec de CI (→ [debug](debug.md)) |
| **Ce qu'elle produit** | Des commits et réponses sur la PR, et un état final **vrai** : ✅ semble prête · 🟡 réserve · ⛔ bloquée · ⏱️ budget · 🎉 mergée · 🚫 fermée · ⏸️ en pause |
| **Et ensuite** | **Vous mergez.** Kaizen ne merge jamais. |

## Exemples

```text
/kaizen:babysit-pr                 # PR de la branche courante, veille jusqu'à 8 h
/kaizen:babysit-pr 42 4h           # budget de 4 h
/kaizen:babysit-pr 42 checkpoint   # un seul cycle, puis la commande de reprise
```

## Un cycle (ordre imposé)

1. **Instantané** `node $K pr snapshot` : la seule source de vérité. Les fils sont lus en entier
   (paginés), avec les commentaires, les revues, les checks du commit de tête, l'état de fusion et
   le temps écoulé depuis la dernière activité.
2. **PR terminée** (mergée ou fermée) → arrêt.
3. **Retours avant CI** → `resolve-pr-feedback` une fois, puis chaque élément est **marqué**
   (`pr mark`), pour ne jamais être retraité tant que personne ne répond.
4. **Commit de tête périmé** : si un push vient d'avoir lieu, la CI observée est caduque.
5. **CI** :
   - échec d'infrastructure : **une** relance ;
   - vrai échec : logs, puis `debug`, `verify` et push.

   Jamais de test désactivé, jamais de commit vide pour relancer.
6. **Mise à jour depuis la base** : seulement si GitHub dit `BEHIND` (mise à jour par l'API, avec le
   commit de tête attendu) ou `DIRTY` (merge local de la base, jamais de rebase).
7. **Convergence** : même check rouge après 2 correctifs, ou fils qui remontent → arrêt des
   corrections à l'aveugle.

## Attendre sans dépenser

Entre deux cycles, Claude lance en arrière-plan :

```bash
node $K pr watch --pr 42 --interval 150
```

Ce veilleur interroge GitHub toutes les 150 s **sans consommer de tokens**. Il s'arrête en écrivant
une ligne `KAIZEN_WAKE {"reason": …}` quand il y a quelque chose à faire : `actionable`, `behind`,
`conflict`, `looks-ready`, `blocked-failing`, `blocked-external`, `needs-human`, `terminal`,
`budget`. Son arrêt réveille Claude, qui reprend au cycle.

## Quand dit-il « semble prête » ?

Toutes ces conditions doivent être réunies :
- GitHub dit `MERGEABLE` et `CLEAN` ;
- les checks sont terminés et verts ;
- aucun fil ni commentaire n'est en attente ;
- aucune décision humaine n'est en suspens ;
- la branche est à jour ;
- **la PR est restée silencieuse au moins 5 minutes**.

Avant de l'annoncer, il vérifie deux choses :
- **une revue est-elle encore en route ?** (réaction 👀, « reviewing… », relecteur qui a relu un
  commit précédent mais pas celui-ci). Si oui, il attend jusqu'à 15 puis 30 minutes au plus ;
- **la description est-elle encore vraie ?** Sinon, `ship refresh-description`.

Il ne dit **jamais** « sûr à merger ».

## Bon à savoir

- `needs-human` et `blocked-failing` ne terminent pas la veille : ils empêchent seulement le verdict
  « prête ». La veille continue pour les autres retours.
- `blocked-external` (CI d'une PR de fork en attente d'approbation) : Kaizen n'approuve jamais.
- Budget : 8 h de veille active par défaut, filet de sécurité de 3 jours.
- État local : `.kaizen/state/pr/<owner>-<repo>-<n>.json`. Le supprimer fait repartir de zéro.
- Prérequis : `gh` authentifié. Les réponses portent le marqueur `<!-- kaizen -->`.

## Voir aussi

[ship](ship.md) · [resolve-pr-feedback](resolve-pr-feedback.md) · [debug](debug.md) · [Dépannage](../depannage.md#babysit-pr-tourne-en-rond-ou-ne-dit-jamais--prête-)
