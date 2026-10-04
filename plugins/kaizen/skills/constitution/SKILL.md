---
name: constitution
description: Crée, amende ou audite la constitution d'ingénierie du projet (CONSTITUTION.md) — 5 à 9 principes non négociables, chacun avec un contrôle vérifiable, une politique IA (ce que les agents font seuls), un versionnage et une gouvernance — par une interview qui repousse les principes vagues et un stress test. Plan, doc-review et review l'appliquent ensuite comme des contrôles. Utiliser pour « crée notre constitution », « nos principes d'ingénierie », « ajoute un principe », « amende la constitution », /kaizen:constitution.
allowed-tools: Bash(node:*), Bash(git:*), Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion
argument-hint: "[vide | amend <article ou sujet> | audit]"
---

# Constitution — les principes que le projet ne négocie pas

`CONSTITUTION.md`, à la racine du repo, porte les **principes d'ingénierie non négociables** : comment
on construit ici, ce qu'un agent a le droit de faire seul. Ce n'est ni une liste de bonnes intentions,
ni un guide de style : chaque article a un **contrôle** que le plan doit passer et que la revue vérifie.

Lis `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`. Gabarit :
`${CLAUDE_PLUGIN_ROOT}/templates/constitution.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

**Terminé quand :** `CONSTITUTION.md` existe, `node "$K" constitution check` passe, et l'utilisateur
a vu le texte complet et eu un tour de correction avant l'écriture.

## Limites

- **Principes, pas plan.** Une fonctionnalité va dans `/kaizen:brainstorm`, une règle de détail d'un
  domaine (« les exports CSV commencent par un BOM ») dans un **Kaizen Pack**, une leçon dans
  `/kaizen:learn`. La constitution ne garde que ce qui vaut pour **tout** le travail.
- **L'utilisateur répond ; le repo ne fait qu'affûter la question.** On ne déduit pas les principes
  du code. On s'en sert pour poser une meilleure question (« vos tests sont en majorité des tests
  d'intégration — c'est un principe ou un hasard ? »).
- **Court est une qualité.** 5 à 9 articles. Au-delà de 12, plus personne ne les applique tous.
- **On n'édite jamais** un article marqué `<!-- approuvé -->` sans passer par un amendement.

## Phase 0 — Ancrer et router

1. `node "$K" constitution --json` : la constitution existe-t-elle ?
2. **Modèle du repo** (lectures bornées, en parallèle) : `CLAUDE.md`, `CONTRIBUTING.md`, `AGENTS.md`,
   `.claude/rules/`, config CI (`.github/workflows/`), outils de test/lint/typage
   (`node "$K" detect`), packs déclarés (`node "$K" packs`), et les leçons les plus nombreuses par
   type (`node "$K" learnings stats`) — un type de bug récurrent suggère un principe manquant.
   Montre en 3 à 5 lignes ce que tu en retiens, sources nommées, et invite à corriger.
3. Route : pas de fichier → **Phase 1** ; `amend …` → **Phase 2** ; `audit` → **Phase 3** ; fichier
   existant sans argument → propose amend ou audit.

## Phase 1 — Interview (première fois)

**Une question par tour.** Réponses libres pour le fond. Deux relances au plus par sujet, puis on
capte ce qui a été donné et on le note « à revisiter ». Cite les mots de l'utilisateur quand tu
relances, ne paraphrase pas. Ne prononce pas le nom des anti-motifs : pose la question plus précise.

1. **Ce qui casse le plus cher.** « Quand un changement a fait mal ici — incident, régression, nuit
   blanche — qu'est-ce qui, en amont, aurait dû l'empêcher ? » Les réponses deviennent des candidats
   d'articles.
2. **Les candidats.** Propose 5 à 8 articles de départ adaptés au repo, en partant de ces familles
   (choisis, ne recopie pas tout) :
   - **Preuve d'abord** — tout changement de comportement arrive avec un test qui échouait avant.
   - **Simplicité** — pas de mécanisme non demandé ; toute complexité est justifiée dans le plan.
   - **Pas d'abstraction prématurée** — pas d'interface à une seule implémentation, pas de couche
     « pour plus tard ».
   - **Petits lots** — une PR ≤ `pr.max_lines` lignes relisibles ; au-delà, découper en tranches.
   - **Sécurité par défaut** — entrées non fiables validées à la frontière, aucun secret dans le code
     ou les logs, dépendances auditées.
   - **Compatibilité** — aucun changement cassant d'une interface consommée sans versionnage ;
     migrations en expand → migrate → contract.
   - **Observabilité** — tout nouveau chemin critique émet de quoi diagnostiquer une panne.
   - **Réversibilité** — tout déploiement a un retour arrière décrit (flag, revert, migration inverse).
   - **Politique IA** (obligatoire) — ce que les agents font seuls, ce qui exige un humain.
   Demande lesquels garder, lesquels réécrire, lesquels manquent.
3. **Pour chaque article retenu** : la règle en 1 à 3 phrases, puis **le contrôle**. Relances type :
   - principe invérifiable (« du code de qualité », « bien tester ») → « Comment un relecteur
     saurait-il, en lisant une PR, que c'est respecté ? Quelle preuve regarderait-il ? »
   - valeur, pas principe (« on est pragmatiques ») → « Qu'est-ce que ça interdit concrètement ? Si
     rien, ce n'est pas un article. »
   - duplication d'un outil (« pas de lignes de plus de 120 caractères ») → « Le linter l'impose déjà ;
     un article doit porter ce qu'aucun outil ne vérifie. »
   - trop large (« la sécurité est prioritaire ») → « Dans quelle situation précise ce principe
     changerait-il une décision ? »
4. **Non négociable ou non ?** Pour chaque article : admet-il des exceptions ? Si oui, lesquelles et
   comment on les consigne. « NON NÉGOCIABLE » est réservé à 1 à 3 articles.
5. **Politique IA.** Précise : ce que l'agent peut faire seul (branche, commit, push de branche, PR,
   correctifs de revue), ce qui exige un humain dans la session (merge, migration, nouvelle dépendance,
   infrastructure, données de production, suppression), et ce qu'il ne fait jamais.
6. **Stress test.** Pose 3 à 5 propositions concrètes, une par tour, qui visent les zones floues du
   brouillon (« un correctif urgent en prod sans test, un vendredi soir ? », « une abstraction pour un
   deuxième client prévu le mois prochain ? », « l'agent ajoute une dépendance pour gagner deux
   heures ? »). Si la constitution tranche déjà comme l'utilisateur → confirmé. Si elle ne tranche pas
   → l'article est trop vague : affûte-le. Si l'utilisateur veut une exception → écris-la dans
   « Exceptions ».

## Écriture

Remplis le gabarit (numérotation romaine continue, la politique IA incluse), dates du jour,
`version: 1.0.0`. Montre **le texte complet** dans le chat, un tour de corrections, puis écris
`CONSTITUTION.md` et lance `node "$K" constitution check` jusqu'au vert (les avertissements se
discutent). Ensuite :
- propose d'ajouter à `CLAUDE.md` (existant) une ligne : « Principes non négociables :
  `CONSTITUTION.md` — appliqués par /kaizen:plan et /kaizen:review. » ;
- signale les **conflits** avec les packs ou leçons existants (une règle de pack qui contredit un
  article) : la constitution l'emporte, la règle doit être amendée — propose, ne modifie pas.

## Phase 2 — Amendement (`amend`)

1. Lis la constitution actuelle. Identifie l'article visé (ou le nouvel article proposé).
2. **Pourquoi maintenant ?** Un post-mortem, une leçon récurrente, une exception demandée trop
   souvent ? Demande la raison si elle n'est pas donnée : un amendement sans raison est refusé.
3. Rédige le changement avec les mêmes relances qu'en phase 1.
4. **Impact** : plans en cours (`node "$K" plan list` puis `plan check` sur chacun), règles de packs
   et leçons qui deviennent contradictoires. Montre la liste.
5. Version : MAJEUR si un article est retiré ou redéfini de façon incompatible, MINEUR si ajouté ou
   élargi, CORRECTIF si clarification. Mets à jour `last_amended`. Ajoute en bas un journal
   `## Amendements` : `- v1.2.0 (2026-11-03) — Article IV élargi aux webhooks. Raison : post-mortem
   docs/postmortems/…`.
6. **Approbation.** Si le frontmatter déclare `approvers` (gouvernance d'équipe), l'amendement n'est
   valide qu'avec `Approuvé par : @<approbateur>` en fin de ligne du journal, et `constitution check`
   le refuse sinon. Demande qui l'a approuvé ; n'écris jamais un nom que l'utilisateur n'a pas donné,
   et jamais un agent (`@claude`…) : un agent ne s'approuve pas un changement des règles qu'il doit
   respecter. Sans approbation, laisse l'amendement en proposition (PR touchant `CONSTITUTION.md`,
   relue par les approbateurs, idéalement via `CODEOWNERS`). En mode non interactif : jamais
   d'amendement, seulement une proposition.
7. Accord explicite, écriture, `constitution check`.

## Phase 3 — Audit (`audit`)

Lecture seule. Pour chaque article : le contrôle est-il vérifiable ? Est-il **réellement** appliqué ?
Regarde les 10 dernières PR ou les 50 derniers commits de la branche par défaut (`git log`,
`gh pr list --state merged --limit 10` si disponible) et les plans récents : combien d'exceptions,
lesquelles sans justification, quels articles jamais cités. Un article jamais vérifié est mort : propose
de l'amender ou de le retirer. Rapport : article, état (vivant / contourné / mort), preuve, proposition.
