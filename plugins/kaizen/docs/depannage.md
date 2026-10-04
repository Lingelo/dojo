# Dépannage

Premier réflexe : **`/kaizen:setup check`**. C'est un bilan en lecture seule : config, commandes de
vérification, leçons invalides, packs, constitution, garde-fou resté actif.

## Le garde-fou bloque la fin de la session

**Symptôme** : à la fin d'un tour, Claude reçoit `[kaizen] Garde-fou qualité (1/3) : le travail en
cours n'est pas vert` et continue de travailler.

C'est voulu pendant `/kaizen:work` et `/kaizen:autopilot` : tant que test, lint ou typage sont rouges, le
travail n'est pas fini. Mais :

| Situation | Que faire |
|---|---|
| L'échec ne vient pas du travail en cours (déjà rouge sur `main`) | `node $K gate off`, puis corriger la commande dans `verify` ou la branche par défaut |
| Une commande détectée est mauvaise | la corriger dans `.kaizen/config.json` → `verify` (voir `node $K detect`) |
| Le garde-fou est resté actif après une session interrompue | `node $K gate status`, puis `gate off`. De toute façon, il expire seul après 24 h (`gate.max_age_hours`). |
| Vous ne voulez pas de garde-fou dans ce repo | `"gate": { "enabled": false }` |

Le garde-fou ne bloque jamais plus de `gate.max_blocks` fois de suite (3 par défaut). Ensuite, il
laisse terminer en exigeant que Claude signale ce qui reste rouge.

## `plan check` est rouge

`node $K plan check <plan>` liste chaque problème. Les plus fréquents :

| Message | Cause | Correction |
|---|---|---|
| `R4 n'est couvert par aucune unité` | une exigence sans unité qui la réalise | ajouter `R4` au **Couvre :** d'une unité, ou une unité |
| `AE2 n'est couvert par aucune unité` | un exemple d'acceptation sans scénario de test | le citer dans le **Couvre :** de l'unité qui le teste |
| `marqueur(s) [À CLARIFIER : …] restant(s)` | une question non résolue dans un plan prêt | répondre, et remplacer le marqueur par la décision |
| `numérotation non continue` | R ou U renumérotés à la main | renuméroter sans trou (R1, R2, R3…) |
| `article IV (…) non évalué` | un article de la constitution manque au tableau | ajouter la ligne `IV.` avec verdict et justification |
| `champ status interdit` | un `status:` dans le frontmatter | le retirer : l'avancement se lit dans git |

Le plus simple : `/kaizen:doc-review <plan>`, qui corrige seul ce qui est mécanique.

## `gh` n'est pas authentifié

**Symptôme** : `ship`, `address-feedback` ou `watch-pr` échouent avec `gh … : Failed to log in`
ou `dépôt GitHub introuvable`.

- Lancez `gh auth login`, puis vérifiez avec `gh auth status`.
- GitHub Enterprise : `gh auth login --hostname <hôte>`, puis passez `--repo <hôte>/owner/name` si
  besoin.
- Sans `gh`, `ship` donne l'URL de création de la PR et son corps à coller ; le suivi de PR n'est
  pas possible.

## `watch-pr` tourne en rond ou ne dit jamais « prête »

- **Un commentaire reste « à traiter »** : il n'a pas été marqué après passage. Lancez
  `node $K pr snapshot` et regardez `attention`. Si un élément a vraiment été traité :
  `node $K pr mark --comment <id> --disposition dispatched`.
- **`needs-human` en attente** : une décision vous attend (voir le rapport). Tant qu'elle reste
  ouverte, la PR n'est jamais déclarée prête : c'est voulu.
- **`blocked-external`** : la CI attend l'approbation d'un mainteneur (PR de fork). Kaizen ne
  l'approuve jamais.
- **Revue annoncée (👀) sans résultat** : `watch-pr` attend au plus 30 minutes, puis rapporte ce
  qu'il n'a pas pu confirmer.
- Repartir de zéro : supprimez `.kaizen/state/pr/<owner>-<repo>-<n>.json`.

## Les leçons ne sont pas réutilisées

`/kaizen:metrics` montre `learnings_cited_by_new_plans: 0` alors que `docs/learnings/` est rempli.

1. `node $K learnings validate` : un frontmatter invalide rend une leçon difficile à trouver.
2. Les mots du titre, des `tags` et des `symptoms` correspondent-ils à ceux qu'utiliseraient vos
   demandes ? Testez avec `node $K learnings search <mots d'une demande typique>`.
3. `CLAUDE.md` mentionne-t-il `docs/learnings/` ? `/kaizen:setup` propose la ligne.
4. `/kaizen:prune-learnings` pour corriger les leçons périmées ou en double.

## Une skill ne se déclenche pas

- Les skills s'appellent avec le préfixe : `/kaizen:plan`, pas `/plan`.
- `/plugin` → le plugin est-il activé ? Est-ce la bonne version (1.1.0 ou plus) ?
- Après une mise à jour du marketplace : `/plugin marketplace update angelo-plugins`.

## Signaler un problème

Joignez la sortie de `/kaizen:setup check`, la version du plugin, et pour un problème de CLI la
commande `node $K …` avec sa sortie complète. **Retirez tout secret ou donnée personnelle** des
logs.
