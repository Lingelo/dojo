---
name: autopilot
description: Mode autonome Kaizen — emmène une demande jusqu'au bout sans s'arrêter, par les bonnes skills (plan ou debug, work, simplification, revue avec correctifs, capitalisation, commit, push, PR, surveillance de la CI). Un changement de code se termine en PR ouverte. Utiliser uniquement quand l'utilisateur demande explicitement un travail autonome de bout en bout ou invoque /kaizen:autopilot — idéalement après /kaizen:brainstorm. Pour un suivi étape par étape, utiliser plan, work, debug.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, TaskCreate, TaskUpdate, TaskList
argument-hint: "[fonctionnalité, bug, ticket ou chemin de plan]"
---

# Autopilot — de la demande à la PR, sans s'arrêter

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

**Pas de raccourci « changement trivial ».** Même pour cinq lignes, la course passe par une source de
travail (un plan, court s'il le faut), `work` sous garde-fou, `node "$K" verify` et `kaizen:review`.
Seule la simplification (étape 3) se saute pour un petit diff, et la livraison (9-10) sans remote.
Qui veut un changement sans cérémonie utilise `/kaizen:work` directement, pas `autopilot`.
**Seule exception : profil `lean`** (`node "$K" config` → `profile`) — un changement de ≤ ~30 lignes
sans surface à risque (voir `conventions.md`) part en `kaizen:work mode:return` avec ses 2 à 6 unités
annoncées, sans plan écrit ; garde-fou, `verify`, revue et livraison restent identiques.

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
   l'arbre de travail. Ré-enregistre la revue avec le verdict après correctifs
   (`node "$K" review record --verdict …`) : le hook de push l'exige.
6. **Consigner le reste** — chaque constat actionnable non appliqué, chaque décision signalée en route :
   dans la description de la PR (section « Points ouverts »), ou dans le rapport final s'il n'y a pas
   de PR.
7. **Capitaliser** — `kaizen:learn mode:auto` si la course a produit un raisonnement durable que le
   code, les tests et le plan ne portent pas. « Leçon non écrite » est un succès. La leçon part dans la
   PR.
8. **Tests navigateur** — changement d'UI et outil navigateur disponible (plugin `playwright`, MCP) :
   parcours des exemples d'acceptation touchés ; échec → correctif, re-vérification.

**Précondition de livraison** (à partir de 9) : `git remote` vide → tout reste en commits locaux, on
saute push, PR et CI. Ce n'est pas une erreur.

9. **Livrer** — `kaizen:ship <plan> mode:auto` : vérifications, taille (`node "$K" size` ; au-delà du
   plafond, la PR le justifie), push de la branche (jamais la branche par défaut, jamais `--force`),
   PR avec description, guide du relecteur, déploiement et retour arrière, points ouverts. Une PR
   existante pour la branche est mise à jour, pas dupliquée.
10. **Mener la PR** — `kaizen:watch-pr <url> mode:pipeline` : retours de revue traités, CI réparée
    (au plus 2 correctifs par cause, aucune désactivation de test, aucun commit vide), branche mise à
    jour seulement si GitHub le demande. Il rend `looks-ready`, un blocage motivé ou ses résidus :
    consigne-les dans la PR (« Points ouverts ») et termine.
11. `node "$K" gate off`, puis rapport final et `DONE`.

## Arrêts (dire pourquoi)

Source de travail impossible à produire · retour enfant autre que complet et étayé · décision acquise
invalidée · processus de livraison du projet non satisfait. Un arrêt ne pousse rien qui ne l'était
déjà ; il retire le garde-fou (`gate off`) et résume l'état exact et la reprise possible.

## Rapport final

```
DONE — <titre>
PR : <url> — ✅ semble prête | 🟡 réserve : … | ⛔ bloquée : … (watch-pr)
Plan : <chemin> · Unités : 4/4 · Revue : 1 P1 corrigé, 2 P3 consignés · Leçon : <chemin | aucune>
Points ouverts : …
```
