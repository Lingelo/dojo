---
name: lfg
description: Mode autonome Kaizen — emmène une demande jusqu'au bout sans s'arrêter, par les bonnes skills (plan ou debug, work, simplification, revue avec correctifs, capitalisation, commit, push, PR, surveillance de la CI). Un changement de code se termine en PR ouverte. Utiliser uniquement quand l'utilisateur demande explicitement un travail autonome de bout en bout ou invoque /kaizen:lfg — idéalement après /kaizen:brainstorm. Pour un suivi étape par étape, utiliser plan, work, debug.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, TaskCreate, TaskUpdate, TaskList
argument-hint: "[fonctionnalité, bug, ticket ou chemin de plan]"
---

# LFG — de la demande à la PR, sans s'arrêter

**Résultat :** la demande atteint l'état final que sa forme appelle, produit par la skill Kaizen dont
c'est le métier, avec tout ce qui reste non résolu consigné là où l'utilisateur le verra. Un
changement de code se termine en **PR ouverte** dont tu donnes l'URL, CI tranchée, après avoir été
implémenté, simplifié, revu (correctifs éligibles appliqués, le reste consigné), capitalisé si
pertinent, commité et poussé. **Le merge reste à l'utilisateur** sauf autorisation explicite.

Lis `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

## Interaction

On ne questionne l'utilisateur **que** via `/kaizen:brainstorm`, et seulement s'il est présent. Tout le
reste avance sans attendre : ce qui est réversible est fait et montré (l'utilisateur corrigera
après) ; seule une action **irréversible** hors de ce qui a été accordé (merge, force-push,
suppression de données, déploiement) arrête la course.

## Visibilité

Crée une tâche par étape (`TaskCreate`) et tiens-les à jour. Une étape n'est terminée qu'après avoir
réellement tourné ; le retour d'une skill enfant enchaîne l'étape suivante **dans le même tour** ; le
tour ne se termine pas avant DONE ou un arrêt motivé.

## Routage

Associe la demande à la skill dont c'est le métier :
- un **chemin de plan**, ou un plan écrit dans cette session → route plan (étape 2 directement) ;
- un **bug concret** (symptôme, test rouge, ticket de bug) → `kaizen:debug mode:return` ;
- une **forme produit ambiguë** (plusieurs lectures plausibles) → `kaizen:brainstorm mode:return` si un
  humain est présent, sinon `kaizen:plan mode:return` qui consignera ses hypothèses ;
- un résultat **qui n'est pas du code** (idées, explication) → la skill concernée, et c'est tout ;
- tout autre changement de code → `kaizen:plan mode:return`.

En cas de doute, la route qui exige le plus de preuves. **Jamais** de plan improvisé par-dessus un plan
existant, ni de plan pioché au hasard dans le dossier des plans.

## La course (routes qui changent le code)

1. **Source de travail** — un plan prêt à implémenter (vérifie `<!-- kaizen:units -->`), ou un retour
   `fixed` de `kaizen:debug`. `blocked`, `needs-human`, `settled-decision-invalidated` → **arrêt**.
2. **Implémenter** — `kaizen:work mode:return <plan>` (route debug : déjà fait, passe à 3). Seul
   `status: complete` avance. Le garde-fou qualité reste actif pendant toute la course
   (`node "$K" gate on --plan <plan>`, retiré à la fin).
3. **Simplifier** — skill `simplify` si disponible, sinon une passe toi-même (réutilisation, clarté,
   efficacité) ; sauté pour un diff de documentation ou de moins de ~10 lignes. Re-vérifie.
4. **Revue** — `kaizen:review mode:agent plan:<plan>` (sans `plan:` sur la route debug). Un constat qui
   montre qu'une décision acquise **ne peut pas marcher** (infaisable, mauvaise cible, destructrice)
   arrête la course avant tout push.
5. **Appliquer les correctifs** — P0/P1 confirmés et `gated_auto` P2 : applique, re-vérifie
   (`node "$K" verify`), commite (`fix(<JIRA>): corrections de revue`). Rien ne reste seulement dans
   l'arbre de travail.
6. **Consigner le reste** — chaque constat actionnable non appliqué, chaque décision signalée en route :
   dans la description de la PR (section « Points ouverts »), ou dans le rapport final s'il n'y a pas
   de PR.
7. **Capitaliser** — `kaizen:compound mode:auto` si la course a produit un raisonnement durable que le
   code, les tests et le plan ne portent pas. « Leçon non écrite » est un succès. La leçon part dans la
   PR.
8. **Tests navigateur** — changement d'UI et outil navigateur disponible (plugin `playwright`, MCP) :
   parcours des exemples d'acceptation touchés ; échec → correctif, re-vérification.

**Précondition de livraison** (à partir de 9) : `git remote` vide → tout reste en commits locaux, on
saute push, PR et CI. Ce n'est pas une erreur.

9. **Livrer** — `git push -u origin <branche>` (jamais la branche par défaut, jamais `--force`), puis
   PR (`gh pr create` ou outils GitHub MCP) : titre conventionnel, description tirée du plan
   (objectif, R couverts, preuves de vérification, leçon ajoutée, points ouverts) + lien vers le plan.
   Si une PR existe déjà pour la branche, mets-la à jour plutôt que d'en ouvrir une seconde.
10. **Surveiller la CI** — `gh pr checks <n> --watch` si disponible. Rouge → lis les logs, corrige la
    cause racine (règles de `/kaizen:debug`), re-vérifie localement, pousse ; **2 cycles de réparation
    au plus**. Ne désactive, n'ignore ni ne met en quarantaine aucun test ; pas de commit vide pour
    relancer la CI. Budget épuisé → consigne ce qui reste rouge dans la PR et termine.
11. `node "$K" gate off`, puis rapport final et `DONE`.

## Arrêts (dire pourquoi)

Source de travail impossible à produire · retour enfant autre que complet et étayé · décision acquise
invalidée · processus de livraison du projet non satisfait. Un arrêt ne pousse rien qui ne l'était
déjà ; il retire le garde-fou (`gate off`) et résume l'état exact et la reprise possible.

## Rapport final

```
DONE — <titre>
PR : <url> (CI : verte | rouge après 2 réparations : <check>)
Plan : <chemin> · Unités : 4/4 · Revue : 1 P1 corrigé, 2 P3 consignés · Leçon : <chemin | aucune>
Points ouverts : …
```
