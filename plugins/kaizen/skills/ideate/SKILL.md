---
name: ideate
description: Génère puis critique des idées ancrées dans le repo (ou un sujet) — six angles en parallèle (frictions, inversion/automatisation, hypothèses cassées, effet de levier, analogies d'autres domaines, contraintes renversées), chaque idée avec une base vérifiable, rejet explicite et motivé, 5 à 7 survivantes classées dans docs/ideation/. Utiliser quand l'utilisateur veut des idées, des pistes d'amélioration ou des directions surprenantes avant d'en choisir une : « que pourrait-on améliorer », « surprends-moi », /kaizen:ideate. Pas pour préciser une idée déjà choisie (/kaizen:brainstorm).
allowed-tools: Bash(node:*), Bash(git:*), Bash(gh:*), Read, Write, Glob, Grep, Agent, AskUserQuestion, WebSearch
argument-hint: "[sujet, zone ou contrainte | « surprends-moi »] [top N] [rapide | en profondeur]"
---

# Ideate — quelles idées valent d'être explorées ?

`/kaizen:ideate` vient **avant** `/kaizen:brainstorm` : il répond « quelles idées méritent qu'on s'y
penche ? ». Le brainstorm dit ensuite ce que **l'une** d'elles devrait être, le plan comment la
construire.

**Terminé :** un document classé écrit sous `<root>/ideation/`, chaque idée générée a été critiquée,
les survivantes sont expliquées, et l'utilisateur a le menu de suite. Ni exigences, ni plan, ni code.

Lis `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

## Règles

1. **Ancrer avant d'imaginer.** Aucun conseil détaché du repo ou du sujet.
2. **Générer beaucoup, critiquer tout, n'expliquer que les survivantes.** Toute la liste est générée
   avant la moindre critique. Chaque rejet a une raison.
3. **Envoyer vers le brainstorm pour agir.** Jamais directement de l'idée au plan.
4. **Ne jamais lancer sur un sujet non identifié** : demande (3 questions max, « Surprends-moi » est
   une vraie option, « Annuler » aussi). Personne pour répondre (session non interactive, ou
   l'utilisateur a dit ne pas être disponible) → « Surprends-moi », annoncé dans le document. Ne pose pas de questions de solution, d'audience ou de critères :
   c'est le rôle du brainstorm.
5. **Annonce le coût** (nombre d'agents) avant de lancer.

## Phase 0 — Sujet et échelle

- Sujet nommé (une zone, un flux, une fonctionnalité) → on reste **dans** ce périmètre, à pleine
  ambition. Sujet vide → demande, avec « Surprends-moi » en option (sans interlocuteur :
  « Surprends-moi » d'office, voir règle 4).
- « rapide » → 3 à 4 idées par angle ; « en profondeur » → angles séparés et plus de vérification ;
  « top N » → N survivantes (la génération ne change pas).
- Reprise : un document d'idéation de moins de 30 jours sur le même sujet existe dans
  `<root>/ideation/` → propose de l'enrichir plutôt que d'en écrire un nouveau.

## Phase 1 — Ancrage (parallèle)

- Repo : structure, `README`, `CLAUDE.md`, `CONCEPTS.md`, code de la zone ; plans récents
  (`node "$K" plan list`) ; leçons (`node "$K" learnings stats` puis `search`) — les zones à
  beaucoup de leçons « bug » sont des frictions documentées ; issues ouvertes si `gh` est disponible
  (`gh issue list --limit 50 --json title,labels,comments`), regroupées en thèmes.
- Hors repo (sujet non logiciel ou externe) : recherche web ciblée, sources citées.
- Écris un **résumé d'ancrage** (≤ 30 lignes) : ce qui existe, où ça frotte, ce qui est documenté.
- **Axes** : découpe le sujet en 3 à 5 axes orthogonaux (ex. pour un checkout : saisie, paiement,
  confirmation, récupération d'échec). Saute si le sujet est atomique ou en « surprends-moi ».

## Phase 2 — Génération divergente

Lance **5 agents `general-purpose` dans un seul message**, chacun avec le résumé d'ancrage, les axes et
un angle comme **biais de départ** (pas une contrainte) :

1. **Frictions** — ce qui est lent, cassé, pénible pour l'utilisateur ou l'opérateur.
2. **Inversion, suppression, automatisation** — inverser une étape pénible, la supprimer, l'automatiser.
3. **Hypothèses cassées et recadrage** — ce qui est traité comme fixe et n'est qu'un choix ; recadrer
   d'un niveau au-dessus ou à côté.
4. **Levier et effet cumulatif** — les choix qui rendent beaucoup de futurs mouvements moins chers.
5. **Analogies et contraintes renversées** — comment un domaine complètement différent résout un
   problème de même structure ; et si le budget était ×10 ou nul, l'équipe de 100 ou de 1, les
   utilisateurs 0 ou 1 million ?

Consigne commune à coller dans chaque prompt :

> Génère les idées les plus intelligentes que ton angle peut atteindre : des idées dont une bonne
> équipe dirait « il faut le faire ». Tes premières idées seront les évidentes : traite-les comme un
> échauffement et ne garde que celles qui méritent encore leur place une fois les idées non évidentes
> trouvées. Une idée qui figurerait dans une liste générique sur ce sujet : aiguise-la avec l'ancrage
> ou abandonne-la. Répartis tes idées sur les axes. 6 à 8 idées. Pour chacune :
> **titre** · **résumé** (2–4 phrases) · **axe** · **base** obligatoire, étiquetée `direct:` (ligne,
> fichier, issue, contexte fourni — cité), `externe:` (art antérieur nommé, avec source) ou
> `raisonné:` (argument écrit de bout en bout) · **pourquoi ça compte** · **test de la réunion** (une
> ligne : ça mériterait une discussion d'équipe ?). Pas de base → pas d'idée. Reste dans le sujet :
> abandonner ou remplacer le projet est hors jeu. Lecture seule, n'écris aucun fichier.

Puis : fusionne et dédoublonne ; cherche 3 à 5 **combinaisons** inter-angles plus fortes que leurs
parties ; tout axe sans idée → un agent de rattrapage ciblé (2 axes max).

## Phase 3 — Critique

1. **Vérification à froid** — un agent `general-purpose` qui n'a pas vu la génération reçoit la liste
   et vérifie chaque base (la ligne citée existe-t-elle ? l'art antérieur est-il bien décrit ?
   l'argument tient-il ?). Il rend un verdict par idée.
2. **Arbitrage** — tu fais la coupe finale en pesant ces verdicts (tu peux les contredire sur preuve,
   en le disant). Motifs de rejet : trop vague · non actionnable · doublon d'une plus forte · non ancrée
   · trop chère pour la valeur probable · déjà couverte par l'existant · sans base · base réfutée ·
   sous le seuil d'ambition · remplace le sujet · déborde du périmètre demandé.
3. **Classement** des survivantes (5 à 7 par défaut) : ancrage, force de la base (`direct` > `externe`
   > `raisonné`), valeur attendue, nouveauté, pragmatisme, levier sur le travail futur, coût, et
   répartition sur les axes.

## Phase 4 — Écrire

`<root>/ideation/YYYY-MM-DD-<sujet>-ideation.md` :

```markdown
---
title: <Sujet> - Idéation
date: YYYY-MM-DD
topic: <slug>
artifact: kaizen-ideation/v1
---
# <Sujet> - Idéation
## Ancrage            (résumé, sources)
## Axes
## Idées classées
### 1. <titre>        (axe · base · effort S/M/L · risque)
résumé, pourquoi ça compte, base citée, premier pas concret, inconvénients
## Combinaisons
## Rejetées           (tableau : idée — motif en une ligne)
## Trous assumés      (axes sans survivante)
```

## Phase 5 — Suite

Dans le chat, **pas** de recopie du document : 5 à 7 lignes (une par survivante, titre + pourquoi) et
le chemin. Puis une question : **Brainstormer l'idée n°…** (Recommandé, invoque `kaizen:brainstorm`
avec l'idée et son ancrage) · **Approfondir un axe** · **S'arrêter là**.
