---
name: review
description: Revue de code multi-agents Kaizen — sélectionne les relecteurs spécialisés selon ce que touche le diff (justesse toujours ; sécurité, tests, performance, fiabilité, contrats d'API, migrations, maintenabilité, adversarial, standards/packs/leçons selon le cas), les lance en parallèle, fusionne, filtre par confiance, vérifie chaque constat bloquant et rend un verdict contre le plan. Rapport seul par défaut ; applique les correctifs avec « apply ». Utiliser pour « relis mon code », « revue de la branche/PR », /kaizen:review.
allowed-tools: Bash(node:*), Bash(git:*), Bash(gh:*), Read, Write, Edit, Glob, Grep, Agent
argument-hint: "[vide = branche courante | n° ou URL de PR | base:<ref>] [plan:<chemin>] [apply] [mode:agent]"
---

# Review — revue multi-agents

Aider à livrer un changement **correct dans le périmètre convenu**. Trouver les défauts et
améliorations dont les conséquences justifient une action. Un changement adéquat n'a besoin d'aucun
constat ; un défaut grave reste grave même dans un petit diff.

Lis `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`, puis au moment de sélectionner les relecteurs
`${CLAUDE_PLUGIN_ROOT}/skills/review/references/persona-catalog.md`, et au moment de fusionner
`${CLAUDE_PLUGIN_ROOT}/skills/review/references/synthesis.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

## Principes

- **Rapport seul par défaut ; jamais de push.** On n'applique que si l'invocation contient `apply` ou
  si l'utilisateur a demandé explicitement de corriger. Jamais de push, de PR ni de ticket.
- **Aucune question bloquante.** Déduis intention, plan et périmètre des jetons, de git, de la PR et de
  la conversation ; note l'incertitude dans le rapport.
- **Aucun changement de branche.** Un numéro de PR choisit le *périmètre*, pas l'autorisation de
  `checkout`. Un diff non commité ne se relit que depuis le checkout qui le contient.
- **Montre la revue, pas la machinerie** : ce qui est examiné, quelles lentilles et pourquoi, les
  constats.

## Étape 1 — Périmètre

- **Branche courante** (défaut) : base = `base:<ref>` si donné, sinon
  `git merge-base HEAD origin/<défaut>` (repli : branche par défaut locale). Diff = `git diff <base>`
  (inclut le non commité) + liste des fichiers. Rien à relire → dis-le et arrête.
- **PR** (numéro/URL) : `gh pr view <n> --json title,body,baseRefName,headRefName,files` et
  `gh pr diff <n>` (ou les outils GitHub MCP si `gh` est absent). Commentaires de revue existants :
  à prendre en compte pour ne pas répéter ce qui est déjà signalé.
- Exclus du diff relu : lockfiles, fichiers générés, binaires, vendored (mentionne-les).
- **Profondeur** :
  - **Légère** — ≤ 20 lignes, aucune surface à risque, docs/config seulement : relis toi-même avec le
    contrat des relecteurs, sans sous-agents.
  - **Ciblée** — < 100 lignes et un seul domaine : 1 à 3 relecteurs.
  - **Complète** — sinon.

## Étape 2 — Intention et plan

Écris un **résumé d'intention** de 2 à 3 lignes (ce que le changement veut accomplir). Source du plan :
`plan:<chemin>`, sinon un plan cité dans les commits de la branche, sinon `node "$K" plan list` (un
plan dont le `topic` correspond à la branche). Plan trouvé → extrais les R, AE, KTD et unités : ce
sont les critères de l'étape 6.

## Étape 3 — Sélection

Selon `persona-catalog.md` : `correctness` toujours (hors profondeur légère), puis seulement les
relecteurs dont le domaine est **présent dans le diff** — par jugement sur le diff, pas par mots-clés.
Pour `standards` : rassemble `CONSTITUTION.md` (`node "$K" constitution --json`), les fichiers de standards, `node "$K" packs --json` (règles dont
`applies_when` correspond) et `node "$K" learnings search <termes du diff>` (leçons pertinentes).
Le **profil** (`node "$K" config` → `profile`, voir `conventions.md`) ajuste la sélection : `lean` =
socle (`correctness`, `standards`) + `security` si surface à risque ; `full` = `adversarial` dès la
profondeur ciblée. Annonce en une ligne par relecteur pourquoi il est retenu.

## Étape 4 — Lancer en parallèle

Lis `${CLAUDE_PLUGIN_ROOT}/references/review-contract.md`. Crée le dossier de run avec
`node "$K" run-dir reviews` (il affiche le chemin ; ignoré par git). Lance **tous** les relecteurs retenus
**dans un seul message** (outil `Agent`, `subagent_type: "kaizen:<nom>"`), chacun avec ce prompt :

```
<contrat>
{contenu de review-contract.md}
</contrat>
<contexte-de-revue>
Relecteur : <nom>
Intention : <résumé d'intention>
Plan (extraits R/AE/KTD pertinents) : <… ou « aucun »>
Fichiers modifiés : <liste>
Diff : <diff inline, ou chemin d'un fichier .patch du dossier de run à lire s'il est gros>
Règles à appliquer (standards seulement) : <citations de standards, règles de packs, leçons>
</contexte-de-revue>
Rends uniquement le JSON du contrat.
```

Gros diff (> ~1500 lignes) : écris-le dans `<run>/diff.patch` et passe le chemin. Attends **tous** les
retours ; un retour en erreur ou non-JSON = relecteur en échec (noté dans la couverture, jamais
ignoré en silence). Enregistre chaque retour dans `<run>/<nom>.json`.

## Étape 5 — Fusionner, filtrer, valider

Suis `synthesis.md` : normalisation, dédoublonnage, porte de confiance, vérification de chaque
constat P0/P1 par relecture des lignes citées, classement, et compte rendu des préexistants à part.

## Étape 6 — Rapport

```markdown
## Revue — <branche ou PR> · <N fichiers, +a/−b>
**Verdict : ✅ Prêt | ⚠️ Prêt avec réserves | ⛔ Pas prêt** — <une phrase>
**Couverture :** correctness, security (auth touchée), testing (…) · ignorés : …

### Constats
| # | Sév. | Conf. | Fichier:ligne | Constat | Correctif | Relecteur |
|---|---|---|---|---|---|---|
| 1 | P0 | 100 | `app/x.rb:42` | … | … | security |

<pour chaque P0/P1 : 2 à 4 phrases de why_it_matters + la ligne citée>

### Constitution
| Article | Respecté ? | Preuve |  — seulement si `CONSTITUTION.md` existe ; exceptions du plan rappelées

### Conformité au plan
| Exigence | Couverte par | Preuve |  — R/AE non couverts ou couverts différemment = constat

### Trous de tests · Risques résiduels
### Préexistants (hors diff, pour information)
### À capitaliser
- <constat qui révèle un piège récurrent → candidat à /kaizen:learn ou à une règle de pack>
```

Verdict : ⛔ s'il reste un P0, ou un P1 confirmé ; ⚠️ s'il reste des P1/P2 non bloquants ou une
couverture incomplète ; ✅ sinon.

**Enregistre la revue** (périmètre = branche courante, dans tous les modes) :
`node "$K" review record --verdict <ready|reserves|blocked> --run <dossier de run>` (✅ → `ready`,
⚠️ → `reserves`, ⛔ → `blocked`). C'est ce que le hook de push exige ; une revue d'une autre PR ou
d'une autre branche ne s'enregistre pas. L'enregistrement est refusé si aucun relecteur n'a
réellement tourné (un hook consigne chaque appel `Agent` à un relecteur de code) — sauf profondeur
légère (≤ 20 lignes) : ne le contourne pas, lance les relecteurs.

## Étape 7 — Appliquer (seulement avec `apply`)

Applique les constats `gated_auto` retenus, du plus sévère au moins sévère, un par un ; relance la
vérification ciblée après chacun (`node "$K" verify`) ; annule un correctif qui casse quelque chose.
Les `manual` restent listés avec leur proposition. Commit des correctifs au format conventionnel
(`fix(<JIRA>): corrections de revue …`, corps citant la leçon appliquée le cas échéant), fichiers
concernés seulement. Ré-enregistre ensuite la revue avec le verdict **après** correctifs
(`node "$K" review record --verdict …`). Résume appliqué / non appliqué.

## `mode:agent` (pour /kaizen:work et /kaizen:autopilot)

Aucune prose : rends le JSON fusionné
`{ verdict, coverage: {ran, failed, skipped}, findings: [...], plan_conformance: [...],
testing_gaps, residual_risks, pre_existing_count, recorded: bool }`. Ne modifie jamais l'arbre dans ce
mode, même si l'appelant appliquera ensuite (l'enregistrement de la revue sous `.kaizen/state/` n'est
pas une modification de l'arbre).
