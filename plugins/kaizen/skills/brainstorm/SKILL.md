---
name: brainstorm
description: Transforme une idée floue ou ambitieuse en exigences claires (QUOI construire) par un dialogue d'une question à la fois, ancré dans le code et les leçons passées, puis écrit la première version du plan unifié (contrat produit avec R-IDs et exemples d'acceptation). Utiliser quand l'utilisateur veut explorer, cadrer ou préciser une fonctionnalité ou un problème avant de planifier — « réfléchissons à… », « je voudrais que… », /kaizen:brainstorm. Pas pour exécuter un travail déjà spécifié (/kaizen:plan ou /kaizen:work).
allowed-tools: Bash(node:*), Bash(git:*), Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion
argument-hint: "[idée, fonctionnalité ou problème à explorer]"
---

# Brainstorm — définir QUOI construire

Le brainstorm répond à **QUOI** par le dialogue ; `/kaizen:plan` enrichit ensuite le **même fichier**
avec le **COMMENT**. Cette skill n'écrit **aucun code**.

Avant de commencer, lis `${CLAUDE_PLUGIN_ROOT}/references/conventions.md` (CLI, racine, langue,
questions, sous-agents). Avant d'écrire le fichier, lis `${CLAUDE_PLUGIN_ROOT}/references/plan-contract.md`.

`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

**Sans description en argument** : demande ce que l'utilisateur veut explorer et attends.

**`mode:return`** (posé par `/kaizen:lfg`) : retire le jeton, mène le dialogue normalement, et à la
place du menu final rends `{ status: complete|blocked, plan_path, open_blockers }`.

## Phase 0 — Reprendre, classer, dimensionner

1. **Reprise** — `node "$K" plan list` : un plan récent sur le même sujet existe ? Propose de le
   reprendre plutôt que d'en créer un second.
2. **Routage** — arrête-toi et route si la demande est :
   - une question factuelle ou une tâche en une étape → réponds directement ;
   - un bug avec symptôme → propose `/kaizen:debug` ;
   - « donne-moi des idées » sans idée choisie → propose `/kaizen:ideate`.
3. **Taille** (en cas de doute, prends la plus lourde) :
   - **Légère** — petite, bornée, peu ambiguë : quelques questions, conclusion **dans le chat**, pas de
     fichier, sauf demande ou décision qu'un lecteur futur devra retrouver sous un identifiant stable.
   - **Standard** — fonctionnalité normale : dialogue, approches, fichier.
   - **Profonde** — multi-acteurs, périmètre contesté, risque (paiement, auth, données) : dialogue
     complet, analyse des parcours, fichier riche.
4. **Cohérence** — la demande contient-elle **une** unité de travail ? Si elle en mélange plusieurs
   (« refaire la facturation et ajouter le SSO »), propose de découper : on traite une zone, les autres
   deviennent du contexte dans la section `kaizen:relationships`.

## Phase 1 — Comprendre (ancré, une question à la fois)

**Ancrage d'abord, en parallèle et sans déranger l'utilisateur :**
- lis `CLAUDE.md`, `CONCEPTS.md` s'il existe, et le code de la zone (lectures bornées) ;
- `node "$K" learnings search <mots-clés du sujet>` → lis les leçons qui ressortent ;
- `node "$K" packs --json` → note les règles dont `applies_when` correspond ;
- `node "$K" constitution --json` → les principes non négociables cadrent les approches possibles ;
- en taille Standard/Profonde, lance `kaizen:repo-researcher` (motifs existants) et, si le corpus de
  leçons est conséquent, `kaizen:learnings-researcher`, dans **un seul message**.

Une contradiction entre la demande et le code vérifié, une leçon ou une règle de pack : expose-la
**avant** de continuer (« le module X fait déjà Y — on l'étend ou on le remplace ? »).

**Puis le dialogue.** Règles :
- **Une question par tour**, via `AskUserQuestion`, avec ta recommandation en premier.
- Ne demande que ce que l'environnement ne tranche pas (le code, la config, la conversation).
- Une décision déjà prise dans la conversation est acquise : consigne-la, ne la redemande pas.
- Questions à fort levier d'abord : qui est l'utilisateur et quel est son vrai problème ? Que se
  passe-t-il si on ne fait rien ? Quelle est la plus petite version utile ? Quels cas limites changent
  le comportement ? Qu'est-ce qui est explicitement hors périmètre ?

**Test de pression** (Standard/Profonde) : est-ce le bon problème ? Existe-t-il une version plus simple
qui livre 80 % de la valeur ? Quel angle mort (sécurité, données existantes, accessibilité,
migration, exploitation) n'a pas été abordé ?

**Parcours** : si la fonctionnalité a un comportement en plusieurs étapes, lance `kaizen:flow-analyst`
sur l'état des exigences et transforme ses trous critiques en questions.

Sors de la phase quand tu peux énoncer l'objectif, les exigences, les cas limites et le périmètre sans
rien inventer.

## Phase 2 — Approches

Hors taille Légère, propose **2 ou 3 approches** réellement différentes (pas trois variantes de la
même) avec pour chacune : principe, ce qu'elle optimise, son coût et son risque, et ce que les leçons
ou packs en disent. Recommande-en une et demande le choix. Puis écris une **synthèse de cadrage** de
5 à 10 lignes dans le chat (objectif, exigences clés, approche, hors périmètre) et fais-la valider.

## Phase 3 — Écrire le plan (exigences seules)

1. Fichier mérité ? Seulement si le dialogue a produit des décisions, un périmètre ou des critères
   d'acceptation qu'un lecteur futur doit retrouver sous des identifiants stables, ou si
   l'utilisateur le demande. Sinon, conclus dans le chat et passe à la phase 4.
2. `node "$K" plan new --type <feat|fix|refactor…> --topic <slug>` réserve le chemin.
3. Écris selon `plan-contract.md` : frontmatter (`source: brainstorm`), **Capsule d'objectif**,
   **Contrat produit** — et rien d'autre. N'écris **pas** de sections vides de planification ou
   d'unités : `/kaizen:plan` les ajoutera.
   - Exigences `R1…` groupées par préoccupation ; exemples `AE1…` pour toute exigence conditionnelle ;
     décisions clés en index de provenance (`Régit R…`), annotées
     `(décidé en session : choisi plutôt que <alternative> — <raison>)` quand l'utilisateur a tranché.
   - Contraintes venues d'un pack citées `(pack: <id>, <fichier>)`, leçons citées par leur chemin.
   - Ce qui reste flou mais ne bloque pas la planification : `[À CLARIFIER : question — défaut
     proposé]` sur place, plutôt qu'une supposition présentée comme acquise.
   - Un diagramme seulement si une structure le justifie (flux multi-étapes, états, transformation de
     données, maquette d'écran) — jamais à la place de la prose.
4. `node "$K" plan check <chemin>` (stade exigences) puis le **contrôle « prêt pour la
   planification »** de `plan-contract.md`. Corrige sur place ce qui
   préserve l'intention ; pose une question ciblée pour ce qui changerait le comportement produit. Ne
   déclare pas le fichier écrit tant qu'un contrôle échoue.

## Phase 4 — Suite

Demande (une question) ce que l'utilisateur veut faire, en n'affichant que les options pertinentes :
1. **Planifier** → invoque la skill `kaizen:plan` avec le chemin du plan (Recommandé).
2. **Tout enchaîner en autonomie** → invoque `kaizen:lfg` avec le chemin du plan.
3. **Affiner encore** → reviens en phase 1 sur le point à creuser.
4. **S'arrêter là** → résume en 3 lignes et donne le chemin du fichier.

Exécute l'option choisie ; afficher le menu n'est pas terminer.
