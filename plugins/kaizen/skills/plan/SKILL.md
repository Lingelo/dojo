---
name: plan
description: Transforme une idée, des exigences ou un plan issu de /kaizen:brainstorm en plan d'implémentation prêt à exécuter (COMMENT construire) — recherche parallèle (motifs du repo, leçons passées, historique git, doc externe), décisions techniques justifiées, unités de travail avec fichiers, stratégie de preuve et tests, contrat de vérification. Utiliser pour « planifie », « découpe ce travail », « comment implémenter… », /kaizen:plan, ou pour approfondir un plan existant (deepen). N'écrit jamais de code de production.
allowed-tools: Bash(node:*), Bash(git:*), Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, WebSearch, WebFetch
argument-hint: "[description | chemin d'un plan | deepen <chemin>]"
---

# Plan — décider COMMENT construire

`/kaizen:brainstorm` définit **QUOI**, `/kaizen:plan` décide **COMMENT**, `/kaizen:work` exécute.
Un brainstorm préalable est facultatif. **Recherche, décide, écris — n'implémente jamais** : pas de
code de production, pas de tests lancés pour « voir ». Du pseudo-code directionnel est permis.

Lis `${CLAUDE_PLUGIN_ROOT}/references/conventions.md` puis `${CLAUDE_PLUGIN_ROOT}/references/plan-contract.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

**`mode:return`** (posé par `/kaizen:autopilot`) : aucune question ; prends le défaut le plus conservateur et
consigne-le comme hypothèse ; rends `{ status: complete|blocked, plan_path, blockers }`. Une preuve qui
invalide une décision prise en session arrête l'écriture : rends `status: blocked` avec
`settled-decision-invalidated`, la décision et la raison.

## Phase 0 — Source et forme de sortie

1. **Source** — dans l'ordre : chemin passé en argument ; plan écrit par `/kaizen:brainstorm` dans
   cette session ; sinon la description. Avec `deepen <chemin>`, va directement à la section
   « Approfondir ».
2. **Plan existant** — si le chemin désigne un plan déjà prêt (`<!-- kaizen:units -->` présent) et
   qu'aucun approfondissement n'est demandé, propose : l'exécuter, l'approfondir, ou le réviser.
3. **Forme de sortie** (en cas de doute, la plus lourde) :
   - **Direct** — faisable et vérifiable en une passe, sans décision à peser : énonce le changement
     en quelques phrases et propose `/kaizen:work`.
   - **Brief** — travail borné, au plus une décision, aucune surface à risque : plan dans le chat.
   - **Durable** — tout le reste, et toujours si : demande explicite d'un plan, mode `return`,
     surface à risque (auth, paiement, migration, contrat externe). → fichier.
4. Sans brainstorm, si la demande laisse plusieurs lectures produit plausibles, pose les 1 à 3
   questions qui bloquent (une par tour) — ou propose `/kaizen:brainstorm` si c'est plus large.

## Phase 1 — Recherche (parallèle, un seul message)

Prépare un **contexte de travail** autonome (objectif, exigences R/AE, modules supposés, décisions
envisagées) et lance selon le besoin :

| Agent | Quand |
|---|---|
| `kaizen:repo-researcher` | toujours en Durable : motifs à imiter, intégration, tests voisins |
| `kaizen:learnings-researcher` | toujours si `<root>/learnings/` contient des leçons ou si des packs sont déclarés — passe-lui le chemin du CLI, la racine résolue et la liste des packs (`node "$K" packs --json`) |
| `kaizen:git-historian` | le travail modifie du code ancien, central ou déjà source de bugs |
| `kaizen:docs-researcher` | une décision dépend d'un comportement externe incertain ou d'une technologie nouvelle pour le repo — pose-lui des **questions précises** |
| `kaizen:flow-analyst` | comportement multi-étapes et pas de brainstorm préalable avec exemples d'acceptation |

Pendant ce temps, lis toi-même les fichiers que la demande nomme, `node "$K" detect` (commandes de
vérification réelles) et `node "$K" constitution --json` (principes à respecter). Une décision
d'architecture lourde ou irréversible (format de données, fournisseur, interface publique) mérite
`/kaizen:decide` : propose-le plutôt que de la trancher en une ligne de KTD.

## Phase 2 — Décider

- Résous chaque question « reportée à la planification » avec une preuve (code, leçon, doc, pack).
- Formule les **décisions techniques clés** `KTD1…` : décision, raison, alternative écartée, `couvre
  R…`. Une décision prise par l'utilisateur en session est reprise telle quelle avec son annotation.
- Une leçon qui s'applique **change** le plan (contrainte, test, séquence) et est citée ; une règle de
  pack qui s'applique est citée `(pack: <id>, <fichier>)` ; ne la contredis pas sans le dire.
- Ce qui reste vraiment ouvert et bloque : question à l'utilisateur (une à la fois). En `mode:return`,
  consigne l'hypothèse retenue ; ne laisse jamais de `[À CLARIFIER : …]` dans un plan prêt.
- **Constitution** : évalue chaque article (section `kaizen:constitution`). Un article NON NÉGOCIABLE
  impossible à respecter bloque le plan (capsule : bloquant ouvert) — ne le contourne pas.
- **Menaces** : surface à risque (auth, données sensibles, paiement, entrée externe, intégration) →
  section `kaizen:threats` (STRIDE léger), chaque parade portée par une unité.
- **Déploiement** : section `kaizen:rollout` — exposition (flag ?), ordre, retour arrière, ce qui est
  irréversible, signal à surveiller.

## Phase 3 — Structurer

Découpe en **unités** `U1…` selon `plan-contract.md` : une unité ≈ un commit cohérent, ordonnées par
dépendance, chacune avec fichiers exacts, `Couvre`, approche (motif à imiter, chemin cité), stratégie
de **preuve** (test d'abord par défaut pour tout changement de comportement), scénarios de test
(chaque `AE` a le sien ; les cas limites et les leçons « Ce qui n'a pas marché » deviennent des tests),
vérification exécutable.

**Tranches** : regroupe les unités en tranches (`**Tranche :** T1`), une tranche = une PR sous
`pr.max_lines` (config, 400 par défaut) qui laisse la branche par défaut saine. Estime grossièrement
les lignes par unité ; au-delà du plafond, découpe (souvent : modèle et tests → endpoint → interface,
la partie visible derrière un flag).

**Construis ce qui est demandé** : n'ajoute un mécanisme non demandé (garde, retry, option,
abstraction) que si un contrat existant l'exige, si son absence laisse un dommage arriver avant que
quiconque le voie, ou s'il serait coûteux d'ajouter plus tard (données stockées, interface publique,
argent, sécurité) — et dans sa plus petite forme.

## Phase 4 — Écrire

- Plan issu d'un brainstorm : **enrichis le même fichier sur place** (ajoute `kaizen:planning`,
  `kaizen:units`, `kaizen:verification`, `kaizen:done` ; ne réécris pas le contrat produit sauf
  correction validée).
- Sinon : `node "$K" plan new --type <type> --topic <slug>`, puis capsule + contrat produit (`source:
  plan`) + sections de planification.
- Pas de trace du processus dans le fichier. Chemins relatifs. Langue configurée.

## Phase 5 — Contrôle de confiance

1. `node "$K" plan check <chemin>` doit passer : corrige jusqu'au vert.
2. Passe le **contrôle « prêt à implémenter »** de `plan-contract.md` et corrige sur place.
3. **Relecture indépendante obligatoire** (forme Durable) : invoque `kaizen:doc-review <chemin>
   mode:auto`. Elle applique les corrections mécaniques et rend les décisions restantes : pose-les à
   l'utilisateur (une par tour) en interactif, ou consigne-les en `mode:return`. Un verdict ⛔ bloque
   la suite. Puis
relis le plan comme un relecteur hostile : quelle unité est la plus floue ? quelle KTD repose sur une
supposition ? quel risque n'a pas de test ? Si une faiblesse touche une décision, relance une
recherche ciblée (voir « Approfondir ») avant de livrer.

## Phase 6 — Suite

En interactif, demande exactement : « Plan prêt : `<chemin>`. Que veux-tu faire ? » avec :
1. **Lancer l'implémentation** → invoque `kaizen:work <chemin>` (Recommandé).
2. **Tout enchaîner en autonomie** → `kaizen:autopilot <chemin>`.
3. **Approfondir** une section faible → section suivante.
4. **Relire moi-même** → arrêt, donne le chemin et les 3 décisions à vérifier en priorité.

## Approfondir (`deepen`)

Pour chaque section faible (KTD peu étayée, unité floue, risque sans test, leçon non consultée) :
lance l'agent adapté avec une question précise, intègre la réponse **sur place** (pas de section
« résolutions » empilée), ajoute `deepened: <date>` au frontmatter, et repasse le contrôle de
confiance. Résume en 3 à 5 lignes ce qui a changé.
