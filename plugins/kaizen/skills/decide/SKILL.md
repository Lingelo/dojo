---
name: decide
description: Prend une décision technique difficile ou irréversible sur preuves — cadre la question, explore le code, les leçons, la constitution et la doc externe, compare 2 à 4 options réelles (dont « ne rien faire »), donne un verdict argumenté avec son niveau de confiance et le signal qui ferait changer d'avis, puis l'enregistre en ADR (docs/adr/). Utiliser pour « faut-il adopter X ? », « A ou B ? », « on migre vers… ? », « documente cette décision », /kaizen:decide. Lecture seule jusqu'à l'ADR.
allowed-tools: Bash(node:*), Bash(git:*), Read, Write, Glob, Grep, Agent, AskUserQuestion, WebSearch, WebFetch
argument-hint: "[question ou choix à trancher] [adr-only]"
---

# Decide — un verdict fondé, puis un ADR

Rendre une **position tranchée et ancrée dans le projet** sur une question qui engage : adopter une
technologie, choisir entre des approches, migrer, accepter une dette. Puis l'écrire en **ADR** pour
que la raison survive à la conversation.

Lis `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`. Gabarit : `${CLAUDE_PLUGIN_ROOT}/templates/adr.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

**Jamais de verdict non mérité.** Une affirmation de la conversation est une piste à vérifier, pas une
preuve. Si une information qui changerait la recommandation manque et reste introuvable : rends
**« Bloqué — contexte manquant »** (ce qui manque, pourquoi ça compte, comment l'obtenir).

**`adr-only`** : la décision est déjà prise (dans la conversation ou un plan) → saute à l'étape 5.

## 1. Cadrer

- Reformule la question en une phrase **décidable** (« Adopter Temporal pour les workflows de
  facturation, ou garder les jobs Sidekiq ? »).
- **Réversibilité** : facile (un revert), coûteuse (migration, refonte), irréversible (format de
  données publié, contrat externe, fournisseur). Plus c'est irréversible, plus la barre de preuve
  monte. Une décision facile à défaire ne mérite pas d'ADR : dis-le et réponds simplement.
- Critères : ce qui compte **ici** (constitution, contraintes du plan, volumes, compétences de
  l'équipe, coût), pondérés. Ne pose une question à l'utilisateur que si un critère décisif est
  introuvable.

## 2. Ancrer (parallèle)

- **Décisions antérieures** (obligatoire) : `node "$K" adr list`, `node "$K" learnings search <sujet>`,
  plans liés, `CONSTITUTION.md`. Une décision passée sur le même sujet se cite et se respecte, ou se
  remplace explicitement (`supersedes`).
- **Code** : `kaizen:repo-researcher` sur la zone (usage actuel, points d'intégration, coût d'un
  changement) ; `kaizen:git-historian` si la zone a une histoire.
- **Externe** (adoption, migration, comparaison) : `kaizen:docs-researcher` avec des questions
  précises — maturité, maintenance (dernières versions, activité), licence, limites connues,
  compatibilité avec les versions du lockfile, coût. Sources primaires, datées.

## 3. Comparer

2 à 4 options **réellement différentes**, toujours avec « ne rien faire / garder l'existant ». Pour
chacune : ce qu'elle optimise, coût d'adoption (estimation grossière en jours, fichiers touchés),
risques, réversibilité, ce que disent les leçons et la constitution. Un tableau critères × options,
puis la prose qui explique ce que le tableau ne dit pas.

Avant de conclure, attaque ta recommandation : « dans un an cette décision s'est révélée mauvaise —
pourquoi ? » Si l'histoire est plausible et non couverte, ajuste ou baisse la confiance.

## 4. Verdict

```markdown
**Recommandation : <option>** — confiance <haute | moyenne | basse>
Pourquoi : <les 2 ou 3 raisons décisives, avec preuves citées>
À quelles conditions : <ce qui doit rester vrai>
Ce qui me ferait changer d'avis : <signal observable>
Coût / prochain pas : <premier pas concret, réversible si possible (spike, flag, pilote)>
```

En interactif, demande la décision (options + « autre »), recommandée en premier. L'utilisateur
tranche ; sa décision fait foi même si elle diffère de la recommandation (l'ADR consigne les deux).

## 5. ADR

`node "$K" adr new --title "<décision>"` réserve `docs/adr/NNNN-<slug>.md`. Remplis le gabarit :
contexte avec preuves, options, décision et raison décisive, conséquences (y compris les dettes
acceptées), **signal de révision**, `status: accepted` si l'utilisateur a tranché (sinon `proposed`),
`reversibility`, `deciders`. Si elle remplace un ADR, mets à jour l'ancien (`status: superseded`,
`superseded_by`). Puis :
- si un plan est en cours, cite l'ADR dans sa KTD concernée ;
- si la décision crée une règle durable pour l'équipe (« toute nouvelle file passe par… »), propose
  une règle de pack ou un amendement de constitution — sans l'écrire d'office.
