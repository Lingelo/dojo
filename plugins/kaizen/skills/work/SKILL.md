---
name: work
description: Exécute un plan Kaizen (ou une demande concrète) de bout en bout — branche dédiée, unité par unité avec preuve test d'abord, commits conventionnels par unité, garde-fou qualité actif (hook Stop) tant que les vérifications sont rouges, puis simplification, revue obligatoire et livraison. Utiliser pour « implémente le plan », « exécute », /kaizen:work [chemin]. Pour un bug sans cause connue, préférer /kaizen:debug.
allowed-tools: Bash(node:*), Bash(git:*), Bash(npm:*), Bash(npx:*), Bash(pnpm:*), Bash(yarn:*), Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, TaskCreate, TaskUpdate, TaskList
argument-hint: "[chemin du plan | description | vide = dernier plan] [mode:return]"
---

# Work — exécuter le plan

**Résultat :** un ensemble de changements entièrement implémenté et vérifié localement, puis revu et
livré (ou rendu à l'appelant en `mode:return`).

Lis `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`. Avant la première écriture de code, lis
`${CLAUDE_PLUGIN_ROOT}/skills/work/references/implementation-loop.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

**`mode:return`** (posé par `/kaizen:autopilot`) : implémentation et vérification locale **seulement** — pas
de simplification, revue, push ni PR (l'appelant s'en charge), aucune question. Rends :
`{ status: complete|blocked, plan_path, branch, commits: [sha…], units: [{id, status, evidence}],
verification: [{name, ok}], decisions_flagged: […], blockers: […] }`.

## Phase 0 — Triage de l'entrée

- **Chemin de plan** → lis-le **en entier**. Pas d'unités (`kaizen:units` absent) → ce n'est qu'un
  contrat produit : propose `/kaizen:plan` d'abord (en `mode:return` : rends `blocked`).
- **Vide** → `node "$K" plan latest` ; confirme le plan trouvé avant de l'exécuter (sauf `mode:return`).
- **Demande sans plan** :
  - **Triviale** (1–2 fichiers, pas de changement de comportement) → exécute directement, sans liste
    de tâches, en gardant la vérification (et la revue, même légère, avant tout push).
  - **Bornée** → déduis 2 à 6 unités toi-même, annonce-les en 5 lignes, puis exécute.
  - **Floue ou risquée** → propose `/kaizen:plan` (ou `/kaizen:brainstorm`) au lieu d'improviser.
- Ne renégocie pas un plan validé : une décision à peser devient **une** question, pas un retour au
  planning.

## Phase 1 — Espace de travail

1. `git status --short` : inventorie les fichiers **déjà modifiés** par l'utilisateur. Une unité qui a
   besoin d'un de ces fichiers → demande une fois s'il faut l'inclure ou l'exclure (en `mode:return` :
   `blocked` avec la collision).
2. **Branche** — si tu es sur la branche par défaut (`main`, `master`, ou
   `git rev-parse --abbrev-ref origin/HEAD` **sans** le préfixe `origin/`), crée une branche
   `<type>/<topic>` (préfixée de la clé Jira du plan ou de la demande si connue) et dis-le. Jamais
   d'écriture sur la branche par défaut sans demande explicite dans cette session.
3. **Garde-fou** — `node "$K" gate on --plan <chemin>` : le hook Stop refusera de terminer tant que
   les vérifications sont rouges (3 blocages max, puis il laisse passer en le signalant).
4. **Contexte** — lis les fichiers référencés par le plan, les leçons qu'il cite (`docs/learnings/…`),
   les règles de packs citées et `CONSTITUTION.md` s'il existe. Une leçon citée est une contrainte
   d'implémentation ; un article de la constitution est une règle, pas une suggestion.
   Vérifie le plan une fois : `node "$K" plan check <chemin>` (rouge → `/kaizen:plan` d'abord).
5. **Tâches** — une tâche par unité (`TaskCreate`), dans l'ordre des dépendances.

## Phase 2 — Exécuter

Suis `implementation-loop.md` pour chaque unité : preuve d'abord, implémentation dans les conventions
du repo, vérification ciblée, preuve consignée, **commit de l'unité** (fichiers de l'unité seulement,
format conventionnel avec Jira). Les lectures indépendantes d'une unité partent dans un seul message.

Unités **indépendantes** (aucun fichier commun, aucune dépendance) et nombreuses : tu peux en confier à
des sous-agents `general-purpose` en parallèle (`model` : `node "$K" models --json` → `roles.implement.model`), chacun avec un paquet autonome (unité complète, fichiers,
motif à imiter, commande de vérification, interdiction de commiter). Tu restes l'intégrateur :
inspecte le diff réel de chaque résultat, relance la vérification, et fais toi-même les commits. Au
moindre conflit, repasse en série.

## Phase 3 — Qualité (mode autonome uniquement)

1. **Vérification complète** — `node "$K" verify`. Rouge → corrige la cause racine, jamais en
   affaiblissant un test. Dépendances ajoutées ou modifiées → `node "$K" verify --only audit` aussi.
2. **Taille** — `node "$K" size`. Au-delà de `pr.max_lines` : la tranche était trop grosse — propose de
   la scinder en plusieurs PR (branches empilées, une par groupe d'unités) plutôt que de livrer un
   bloc que personne ne relira bien. Exception assumée (code généré, migration) → dite dans la PR.
3. **Couverture du plan** — chaque `R` et chaque `AE` a sa preuve (test ou vérification consignée) ;
   chaque élément de la « Définition de terminé » est vrai. Sinon, complète.
4. **Simplification** — si la skill `simplify` est disponible, invoque-la sur le diff de la branche ;
   sinon, relis toi-même le diff avec trois lentilles (réutilisation d'un utilitaire existant, clarté,
   efficacité) et applique les simplifications sûres. Re-vérifie.
5. **Revue obligatoire** — invoque `kaizen:review plan:<chemin>`. Le travail n'est **pas** terminé et
   rien n'est poussé sans un rapport de revue réellement produit, ou une instruction explicite de
   l'utilisateur de s'en passer. Une auto-relecture mentale ne compte pas.
6. Applique les correctifs P0/P1 retenus (ou demande pour ceux marqués `manual`), re-vérifie, commit,
   puis ré-enregistre la revue avec le verdict après correctifs
   (`node "$K" review record --verdict …`) : sans cela, le hook de push refusera la livraison.

## Phase 4 — Livrer

1. `node "$K" gate off`.
2. Résumé : unités livrées, preuves, commits, constats de revue restants (et pourquoi), décisions
   prises en route.
3. Propose (une question) : **livrer** (Recommandé → invoque `kaizen:ship <plan>` : push, PR avec
   description et guide du relecteur tirés du plan, puis surveillance de la PR proposée) · **garder en
   local** · **capitaliser une leçon d'abord**.
4. Si le travail a produit un raisonnement non évident (un piège, une cause surprenante, une décision
   qui a demandé de l'enquête), propose `/kaizen:learn` — c'est ce qui rend le prochain cycle plus
   facile.
