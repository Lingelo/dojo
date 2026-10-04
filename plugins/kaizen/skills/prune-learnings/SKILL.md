---
name: prune-learnings
description: Entretient les leçons de docs/learnings/ contre le code actuel — détecte les leçons périmées (chemins, symboles, comportements disparus), doublons, chevauchements et contradictions, puis applique Garder / Mettre à jour / Fusionner / Remplacer / Supprimer avec preuves, et rend un rapport complet. Utiliser pour « nettoie les leçons », « audit de docs/learnings », après un gros refactor, ou quand une leçon s'est révélée fausse : /kaizen:prune-learnings [zone]. Ne modifie jamais le code produit.
allowed-tools: Bash(node:*), Bash(git:*), Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion
argument-hint: "[zone : dossier, fichier, module ou mot-clé] [élaguer] [mode:auto]"
---

# Prune learnings — garder les leçons dignes de confiance

Les leçons ne cumulent de la valeur que si **chacune** est fiable : une leçon fausse est pire
qu'aucune, car `/kaizen:plan` et `/kaizen:review` l'appliquent. Cette skill audite le corpus contre le
code actuel, applique les actions que les preuves justifient, et rend un rapport.

Lis `${CLAUDE_PLUGIN_ROOT}/references/conventions.md` et
`${CLAUDE_PLUGIN_ROOT}/references/learnings-schema.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

**Deux limites, quelles que soient les preuves :** cette skill ne modifie **jamais** le code produit,
et ne modifie **jamais** une skill, un runbook ou un fichier d'instructions — quand une leçon contredit
une consigne, elle le **signale**.

**Modes.** Interactif (défaut) : applique Garder/Mettre à jour/Fusionner sans demander, **demande**
avant Remplacer et Supprimer. `mode:auto` : applique Garder/Mettre à jour/Fusionner, et pour
Remplacer/Supprimer se contente d'ajouter en tête de la leçon
`> ⚠️ Possiblement périmée (prune-learnings du <date>) : <raison>` et de les lister en « Recommandé ».

## 1. Périmètre

Candidats : les `.md` sous `<root>/learnings/` (hors `README.md`). Un indice de zone filtre (dossier,
module, mot-clé via `node "$K" learnings search`) ; un indice qui ne correspond à rien **n'élargit
jamais** le périmètre : dis-le et arrête. Corpus vide : dis-le et suggère `/kaizen:learn`.
Commence par `node "$K" learnings validate` (frontmatter cassé = mise à jour à faire).

## 2. Enquêter

Pour chaque leçon, contre l'arbre actuel :
- **Ancrages** — les chemins, fichiers, fonctions, commandes, options et versions cités existent-ils
  encore ? (`Glob`, `Grep`, `git log --follow` pour un fichier déplacé)
- **Comportement** — la cause et la solution décrites sont-elles toujours vraies ? Le correctif est-il
  toujours dans le code, ou a-t-il été retiré/remplacé ? Un test couvre-t-il maintenant le cas ?
- **`retire_when`** — la condition externe est-elle remplie (bug amont corrigé, version dépassée) ?
- **Consignes nommées** — si une leçon de la piste savoir nomme un fichier de consignes (une skill, un
  runbook, `CLAUDE.md`), lis-le ; s'il prescrit autre chose, rapporte les deux citations et ce que fait
  le code — sans éditer la consigne.
- **Ensemble** — doublons, chevauchements, leçons qui se remplacent, **contradictions** (une
  contradiction trompe activement : elle passe avant la péremption individuelle).

Plus de 8 leçons : répartis l'enquête entre des agents `general-purpose` en parallèle (lecture seule),
par lots thématiques, chacun rendant pour chaque leçon : ancrages vérifiés/cassés avec preuve,
comportement toujours vrai/faux/invérifiable avec preuve, chevauchements repérés.

**Invérifiable n'est pas faux.** Une leçon qu'on ne peut ni confirmer ni réfuter (comportement de prod,
service externe) reste, avec une note.

## 3. Classer — une issue par leçon

| Issue | Quand |
|---|---|
| **Garder** | exacte et distincte |
| **Mettre à jour** | le fond tient, des détails ont dérivé (chemin déplacé, nom changé, frontmatter invalide, lien mort) |
| **Fusionner** | deux leçons ou plus disent la même chose : on garde la meilleure, on y intègre l'apport unique des autres, on supprime les autres |
| **Remplacer** | le fond est devenu faux mais la zone mérite une leçon : réécriture d'après le code actuel |
| **Supprimer** | le problème ne peut plus se produire (code supprimé, contrainte disparue) et la leçon n'apprend plus rien d'utile |

Frontière Mettre à jour / Remplacer : si un lecteur de l'ancienne version prendrait une **mauvaise
décision**, c'est Remplacer. Pas d'archivage en place : l'historique git est l'archive.

**Élagage (« élaguer », sur confirmation explicite)** : en plus de l'exactitude, juge la **valeur** :
supprime ou raccourcit une leçon exacte dont le raisonnement est désormais porté par un test, un
commentaire ou le fichier d'instructions — chaque coupe **cite** ce fichier. Sans demande explicite,
une leçon exacte n'est jamais supprimée pour redondance.

## 4. Exécuter

Une action par leçon, selon sa classe. Mise à jour et remplacement : gabarit et schéma en vigueur,
`node "$K" learnings validate` jusqu'au vert. Fusion : mets à jour les liens des autres leçons vers les
fichiers supprimés. Après une suppression ou un déplacement, `Grep` les références au chemin (plans,
autres leçons, README) et corrige-les.

## 5. Rapport (le livrable)

```markdown
## Élagage de docs/learnings/<zone> — <date>
Examinées : N · Gardées : a · Mises à jour : b · Fusionnées : c · Remplacées : d · Supprimées : e

### Appliqué
- `chemin` — **Mise à jour** : <ce qui a changé> (preuve : `fichier:ligne`)
### Recommandé (non appliqué)
- `chemin` — **Supprimer ?** <raison, preuve> 
### Contradictions avec des consignes
- `leçon` vs `consigne` — « citation A » / « citation B » — le code suit : …
### Régressions possibles
- leçon exacte mais le code ne la respecte plus → à vérifier côté produit
```

## 6. Commit et trouvabilité

Rien n'a changé → pas de commit. Sinon, indexe **uniquement** les fichiers modifiés par cette skill et
commite (`docs(<JIRA>): prune-learnings des leçons <zone>`) — sur une branche dédiée si tu es sur la branche
par défaut et en interactif, sinon demande. Enfin, vérifie que `CLAUDE.md` mène bien vers
`<root>/learnings/` (même règle que `/kaizen:learn`, avec accord).
