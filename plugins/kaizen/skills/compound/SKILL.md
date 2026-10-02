---
name: compound
description: Capitalise un problème résolu en leçon durable dans docs/solutions/ (frontmatter validé, vocabulaire du corpus, mise à jour plutôt que doublon) pour que le prochain /kaizen:plan et la prochaine /kaizen:review la relisent — c'est l'étape qui fait que chaque cycle rend le suivant plus facile. Utiliser après un travail vérifié qui a produit un raisonnement non évident (piège, cause surprenante, décision coûteuse à retrouver) : « documente ça », « retiens la leçon », /kaizen:compound. Pas pour un correctif de routine que le code explique déjà.
allowed-tools: Bash(node:*), Bash(git:*), Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion
argument-hint: "[contexte bref] [mode:auto]"
---

# Compound — capitaliser la leçon

**Résultat :** **une** leçon qualifiée écrite (ou mise à jour) sous `<root>/solutions/`, vérifiée
contre le code actuel, validée par le CLI, et trouvable par le prochain agent. Si aucune leçon ne
qualifie : rien n'est écrit et le rapport dit pourquoi.

**Une leçon par exécution.** Une session qui en a produit plusieurs = plusieurs exécutions
successives, jamais un lot (un lot mélange les vocabulaires et produit des documents fourre-tout).

Lis `${CLAUDE_PLUGIN_ROOT}/references/conventions.md` et
`${CLAUDE_PLUGIN_ROOT}/references/learnings-schema.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

**`mode:auto`** (posé par `/kaizen:lfg` ou `/kaizen:work`) : aucune question ; pas de modification
d'instructions du projet ; termine par exactement `Leçon écrite : <chemin>` ou
`Leçon non écrite : <raison>`.

## 1. Préconditions — le test de durabilité

Le problème est **résolu et vérifié** (tests verts, comportement constaté). Puis applique le
contrefactuel de `learnings-schema.md` : sans ce document, un futur développeur qui lit le code final
referait-il l'erreur ou la même enquête ? Juge depuis la session, sans demander. Une invocation
explicite demande le jugement maintenant, elle n'abaisse pas la barre.

Qualifient typiquement : une cause racine surprenante, un piège d'API ou de framework, ce qui **n'a
pas** marché et pourquoi, une décision d'architecture coûteuse à reconstituer, une convention établie
après discussion. Ne qualifient pas : une faute de frappe, un correctif que le test et le message de
commit expliquent entièrement, une explication de ce que le code dit déjà.

Échec du test → n'écris rien ; dis en une ou deux phrases pourquoi, et où le savoir vit déjà (test,
commentaire, commit).

## 2. Rassembler

Depuis la session (et `git log`/`git diff` de la branche) : problème et impact, symptômes exacts
(messages d'erreur), ce qui a été tenté et a échoué, la solution, **pourquoi** elle marche, comment
éviter la récidive. En mode interactif, si un élément clé manque (ex. : le message d'erreur exact), une
seule question.

## 3. Chercher l'existant

`node "$K" learnings search <mots-clés>` puis lis les candidates. Une leçon existante sur le **même**
problème :
- toujours exacte → complète-la (nouveau symptôme, nouvelle variante) plutôt que d'en créer une ;
- devenue inexacte ou incomplète → **mets-la à jour** : la laisser tromperait ;
- un doublon partiel ailleurs → mentionne-le dans le rapport pour `/kaizen:refresh`.

## 4. Classer

`node "$K" learnings stats` pour le vocabulaire du corpus. Choisis la piste (bug / savoir) via
`problem_type`, puis `component`, `root_cause`, dossier selon la règle « corpus d'abord ». Sévérité =
gravité de ce que la leçon évite, pas la difficulté de l'enquête.

## 5. Écrire

- Gabarit : `${CLAUDE_PLUGIN_ROOT}/templates/learning-bug.md` ou `learning-knowledge.md`, dans la
  langue configurée (clés de frontmatter inchangées).
- Chemin : `<root>/solutions/<dossier>/<slug-du-titre>.md`.
- Chaque affirmation sur le code est **vérifiée contre l'arbre actuel** : chemins qui existent,
  symboles cités présents, commandes exactes. Pas de chemin absolu, pas de secret, pas de donnée
  personnelle (remplace par `<REDACTED>`).
- La section « Ce qui n'a pas marché » est souvent la plus précieuse : ne la saute pas si la session a
  connu des impasses.
- `retire_when` seulement si la leçon tient à un état **hors du repo** (bug amont ouvert, version
  d'outil) — avec la façon de le vérifier.
- Valide : `node "$K" learnings validate <fichier>` ; corrige jusqu'au vert.

## 6. Promouvoir (interactif seulement)

Si la leçon est en réalité une **règle prescriptive** qui vaut pour toute l'équipe (« tout export CSV
commence par un BOM »), propose de l'ajouter aussi à un Kaizen Pack déclaré (`node "$K" packs`) ou d'en
créer un (`node "$K" pack new <nom>`) : un fichier de règle avec `title`, `applies_when`, `tags`, et le
corps qui cite la leçon. Les packs sont relus par plan et review ; la leçon garde l'histoire.

## 7. Vocabulaire

Si la leçon nomme un concept du domaine utilisé sous plusieurs noms dans le code ou la conversation
et que `CONCEPTS.md` existe, ajoute ou précise l'entrée (nom canonique, définition en une phrase, alias
à éviter). Ne crée pas `CONCEPTS.md` ici.

## 8. Être trouvable (interactif, avec accord)

Vérifie que les instructions du projet (`CLAUDE.md`) mènent un agent vers `<root>/solutions/` avant de
travailler dans une zone documentée. Sinon, propose d'ajouter la plus petite phrase utile, par exemple :

> Avant de planifier ou de déboguer, cherche les leçons du projet : `docs/solutions/` (frontmatter :
> module, tags, symptoms, applies_when).

N'édite qu'un fichier d'instructions existant, jamais un nouveau.

## 9. Rapport

```
Leçon écrite : docs/solutions/runtime-errors/export-csv-accents-excel.md  (nouvelle | mise à jour)
- piste : bug · problem_type : runtime_error · module : exports
- validée ✔ · retrouvable par : csv, excel, encodage, bom
- relue par : prochains /kaizen:plan et /kaizen:review touchant aux exports
```

Ne commite que si l'utilisateur le demande ou si l'appelant (`work`, `lfg`) gère le commit ; dans ce
cas, uniquement les fichiers écrits par cette skill.
