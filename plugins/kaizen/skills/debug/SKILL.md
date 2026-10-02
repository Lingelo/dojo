---
name: debug
description: Boucle de diagnostic Kaizen pour bugs, tests rouges, comportements faux ou lents — reproduction, traçage à rebours, leçons passées et historique git, une hypothèse à la fois, chaîne causale complète avec fichier:ligne avant tout correctif, puis correctif test d'abord et capitalisation. Utiliser pour « ça plante », « ce test échoue », « pourquoi X », un ticket de bug, /kaizen:debug.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, TaskCreate, TaskUpdate
argument-hint: "[message d'erreur, chemin de test, ticket/issue, ou description du comportement] [mode:return]"
---

# Debug — trouver la cause, puis corriger

**Terminé quand :** la chaîne causale du déclencheur au symptôme est énoncée **sans trou**, avec des
preuves `fichier:ligne`, et soit un correctif vérifié a été livré (commit ou PR, ou l'arrêt choisi par
l'utilisateur), soit un résumé de diagnostic a été remis.

**Escalader plutôt que s'acharner :** 2 à 3 hypothèses épuisées sans confirmation, ou 3 correctifs
ratés → on diagnostique **pourquoi** on se trompe au lieu de réessayer. **Une hypothèse, un changement
à la fois** : changer plusieurs choses pour voir ce qui aide, c'est du débogage au fusil de chasse.

Lis `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`, puis
`${CLAUDE_PLUGIN_ROOT}/skills/debug/references/investigate.md` pour les phases 0 à 2.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

**`mode:return`** (posé par `/kaizen:lfg`) : pas de question ; correctif appliqué seulement s'il est
**convergent** (il rétablit le comportement voulu) — un correctif **divergent** (il renverserait une
décision délibérée, ou un test « rouge » qui affirme le comportement voulu) est différé ; commit sur
branche dédiée, pas de push. Rends `{ status: fixed|diagnosed-no-fix|needs-human|blocked,
root_cause, files, tests, commit, deferred }`.

## Secrets dans les preuves

Le débogage affiche beaucoup de sorties brutes. Garde les identifiants dans des variables
d'environnement ; si une sortie peut contenir un secret (traces HTTP, en-têtes, dumps de config),
capture-la dans un fichier et n'en montre que des extraits assainis (`<REDACTED>`). Aucun secret dans
ce qui est affiché, écrit ou commité.

## Phases

**0 Triage → 1 Enquête → 2 Cause racine → 3 Correctif → 4 Passation.** Pas de raccourci hors du cas
trivial (cause lisible dans l'entrée, correctif d'une ligne) — et même alors, la porte de la phase 2
s'applique avant d'éditer.

**Le ticket de référence.** Si l'utilisateur a fourni un ticket ou une issue (GitHub, Jira, Sentry…),
c'est là que vit le bug : garde son identifiant jusqu'à la phase 4. Sans ticket, il n'y en a pas, et
c'est normal : n'en crée jamais un pour « faire propre ».

### Porte de la phase 2 — présenter, puis demander

Ne passe pas à la phase 3 tant que tu ne peux pas expliquer **toute** la chaîne — déclencheur, chaque
étape, symptôme observé — sans « d'une façon ou d'une autre ». Seul l'utilisateur peut autoriser à
avancer sur la meilleure hypothèse disponible quand l'enquête est bloquée.

Écris d'abord, **en entier**, le bloc de constats : chaîne causale avec `fichier:ligne` ; correctif
proposé et fichiers touchés ; tests à utiliser, ajouter, modifier ou renforcer, et pourquoi les tests
existants ne l'ont pas attrapé ; ticket ou PR liés (si une PR ouverte corrige déjà, commence par ce
lien). **Ensuite seulement**, demande (sauf si la demande a déjà tranché) :
1. **Corriger maintenant** → phase 3 (Recommandé).
2. **Diagnostic seulement** → phase 4, résumé, fin.
3. **Repenser la conception** (`/kaizen:brainstorm`) → seulement si le bug ne peut pas se corriger dans
   la conception actuelle (mauvaise responsabilité ou interface, exigences fausses, tout correctif est
   un contournement). La taille seule n'est pas un problème de conception.

### Phase 3 — Correctif

Lis `${CLAUDE_PLUGIN_ROOT}/skills/debug/references/fix.md` avant toute édition. Deux règles d'abord :
- **Branche** — sur la branche par défaut, crée `fix/<sujet>` (préfixée Jira si connue) sans demander,
  et dis-le. Du travail non indexé de l'utilisateur dans un fichier à modifier → confirme avant.
- **Périmètre** — note `HEAD`, l'état de `git status --short`, et tiens la liste des **fichiers du
  correctif**. La phase 4 en dépend.

### Phase 4 — Passation

```markdown
## Résumé de debug
**Problème :** ce qui était cassé
**Cause racine :** chaîne causale complète, avec fichier:ligne
**Tests :** ajoutés/modifiés pour empêcher la récidive (fichier, assertion)
**Correctif :** ce qui a changé — ou « diagnostic seulement »
**Prévention :** couverture ajoutée ; correctif structurel ou défense en profondeur, ou laissé en suite
**Confiance :** haute / moyenne / basse
```

Si un correctif a été fait :
1. Correctif non trivial → `kaizen:review` sur les fichiers du correctif uniquement (pas sur le reste
   de la branche).
2. Commit des **seuls** fichiers du correctif, au format `fix(<JIRA>): …`. Un fichier du correctif
   contenait déjà des modifications de l'utilisateur → demande avant de commiter (avec, sans, ou
   arrêter).
3. Push et PR seulement si l'arbre était propre avant, si rien d'autre que le correctif n'est sur la
   branche, et si un remote permet une PR ; sinon commit local et dis en une ligne pourquoi.
4. **Capitaliser** : un bug dont la cause était surprenante ou l'enquête longue est exactement ce que
   `/kaizen:compound` doit retenir — propose-le (en `mode:return`, signale-le dans le retour).
