---
name: ship
description: Livre le travail Kaizen en PR relisible — vérifications vertes, taille sous le plafond (sinon découpage en PR empilées), commits conventionnels avec Jira, push de la branche (jamais la branche par défaut), PR avec description tirée du plan (objectif, exigences couvertes, preuves, contrôle constitutionnel, déploiement et retour arrière) et guide du relecteur ; propose ensuite /kaizen:watch-pr. Sait aussi seulement rédiger ou rafraîchir une description de PR. Utiliser pour « ouvre la PR », « livre », « pousse et crée la PR », « mets à jour la description de la PR », /kaizen:ship.
allowed-tools: Bash(node:*), Bash(git:*), Bash(gh:*), Read, Write, Edit, Glob, Grep, AskUserQuestion
argument-hint: "[chemin du plan] [description-only | refresh-description] [draft] [mode:auto]"
---

# Ship — une PR que les relecteurs ont envie de relire

DORA 2025 : avec l'IA, les PR grossissent et **la revue humaine devient le goulot**. Une PR Kaizen
est petite, se raconte d'elle-même, et dit au relecteur où regarder.

Lis `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

**`mode:auto`** (posé par `/kaizen:work`, `/kaizen:autopilot`, `/kaizen:watch-pr`) : aucune question ;
rend `{ status: shipped|local-only|blocked, pr_url, branch, commits, size, notes }`.

## Modes

- **description-only** — rédige la description (étape 4) et l'affiche ; ne publie que si on le demande.
- **refresh-description** — la PR existe : réécris sa description si elle ne correspond plus au
  diff (comportement ajouté/retiré, approche changée, réserves levées) et applique-la avec
  `gh pr edit <n> --body-file`. Si elle est encore juste, ne touche à rien et dis-le.
- **défaut** — étapes 1 à 6.

## 1. Préconditions

- `git status --short` : fichiers non commités ? Ceux du travail en cours sont commités par unité ;
  ceux de l'utilisateur ne partent jamais sans son accord (question en interactif, `blocked` en auto).
- Branche courante ≠ branche par défaut (sinon crée `<type>/<topic>` et déplace les commits locaux
  non poussés avec l'accord de l'utilisateur). Jamais de push sur la branche par défaut.
- `git remote` vide → **local seulement** : commits faits, rien d'autre ; dis-le en une ligne.

## 2. Barrières

1. `node "$K" verify` vert (rouge → stop : `/kaizen:work` ou `/kaizen:debug`).
2. Revue faite : un rapport `/kaizen:review` de cette session sur ce diff, ou instruction explicite de
   s'en passer. Sinon, lance-la (`mode:agent` en auto) et traite les P0/P1.
3. `node "$K" size` sous `pr.max_lines`. Au-delà :
   - **interactif** — propose de **découper** en PR empilées : une branche par tranche du plan (ou
     par groupe d'unités cohérent), chacune basée sur la précédente, `gh pr create --base
     <branche précédente>`. Ou de livrer en un bloc en le justifiant dans la PR ;
   - **auto** — livre en un bloc, avec la section « Taille » qui explique pourquoi.
4. Constitution : si le plan déclare des exceptions, elles iront dans la PR.

## 3. Commits et push

Commits restants au format conventionnel (`<type>(<JIRA>): …`, clé lue dans la branche), fichiers
nommés explicitement. Puis `git push -u origin <branche>` (jamais `--force` ; `--force-with-lease`
seulement sur une branche que cette session a créée et réécrite, avec accord).

## 4. Description

Titre : conventionnel, ≤ 72 caractères (`feat(SHOP-412): export CSV des commandes filtrées`).
Corps, tiré du plan (`plan:` ou le plan cité dans les commits) et du diff réel — **jamais** du plan
seul si le code a divergé :

```markdown
## Pourquoi
<objectif de la capsule, 1 à 2 phrases ; lien vers le plan et le ticket>

## Ce qui change
- <comportement visible, une puce par exigence couverte : R1, R2…>

## Comment relire (guide du relecteur)
1. Commencer par `<fichier>` : <le cœur du changement>
2. Puis `<fichier>` : <…>
- À regarder de près : <la décision ou le risque où un œil humain compte le plus>
- Peut se survoler : <tests générés, renommages, fichiers mécaniques>

## Preuves
- `<commande de vérification>` ✅ · exemples d'acceptation AE1–AE3 couverts par <tests>
- Revue Kaizen : <verdict, constats restants>

## Déploiement et retour arrière
<résumé de kaizen:rollout : exposition, ordre, retour arrière, signal>

## Constitution
<seulement s'il y a des exceptions : article, raison>

## Points ouverts
<constats non appliqués, décisions laissées à l'humain — ou supprimer la section>

🤖 Préparé avec Kaizen
```

Ajoute le marqueur `<!-- kaizen -->` en dernière ligne (il évite que le suivi de PR prenne ce texte
pour un retour à traiter).

## 5. Ouvrir

Une PR existe déjà pour la branche (`gh pr view --json url`) → mets-la à jour (`gh pr edit`) au lieu
d'en ouvrir une seconde. Sinon `gh pr create --title … --body-file … [--draft] [--base <base>]`. Sans
`gh`, utilise les outils GitHub MCP s'ils sont disponibles ; sinon donne l'URL de création et le corps.

## 6. Suite

Donne l'URL. Propose `/kaizen:watch-pr <url>` (Recommandé) pour la mener jusqu'à « prête à merger »
— commentaires traités, CI réparée — sans jamais merger à la place de l'humain.
