# Contrat du plan unifié (`kaizen-plan/v1`)

Un seul fichier par sujet, sous `<root>/plans/`. `/kaizen:brainstorm` en écrit la première version
(exigences seules) ; `/kaizen:plan` l'enrichit **sur place** (comment construire) ; `/kaizen:work`
l'exécute ; `/kaizen:review` vérifie le code contre lui.

Exemple complet de référence : `${CLAUDE_PLUGIN_ROOT}/templates/plan-example.md`.

Le chemin est réservé par `node "$K" plan new --type <type> --topic <slug>` :
`<root>/plans/YYYY-MM-DD-HHMM-<type>-<topic>-plan.md`.

## Frontmatter

```yaml
---
title: Export CSV des commandes - Plan      # suffixe « - Plan », identique au H1
type: feat                                  # feat | fix | refactor | perf | docs | chore…
date: 2026-10-02
topic: export-csv-commandes                 # slug, clé de reprise
artifact: kaizen-plan/v1
source: brainstorm                          # brainstorm | plan (qui a écrit le contrat produit)
jira: SHOP-412                              # optionnel : ticket d'origine
origin: docs/ideation/…                     # optionnel : document amont
deepened: 2026-10-03                        # optionnel : date d'approfondissement
---
```

Pas de champ `status` : l'avancement se déduit de git, jamais d'un champ mutable.

## Sections et marqueurs

Chaque section est précédée de son marqueur. Les titres suivent la langue configurée, les marqueurs
jamais. `node "$K" plan list` considère un plan « prêt à implémenter » quand `<!-- kaizen:units -->`
est présent.

| Marqueur | Section (fr) | Écrite par | Obligatoire |
|---|---|---|---|
| `kaizen:goal` | Capsule d'objectif | brainstorm / plan | oui |
| `kaizen:product` | Contrat produit | brainstorm (ou plan si pas de brainstorm) | oui |
| `kaizen:relationships` | Comment ce travail s'articule | brainstorm | si le sujet a été découpé |
| `kaizen:planning` | Contrat de planification | plan | oui (plan prêt) |
| `kaizen:constitution` | Contrôle constitutionnel | plan | oui si `CONSTITUTION.md` existe |
| `kaizen:threats` | Menaces | plan | si surface à risque (auth, données sensibles, paiement, entrée externe, intégration tierce) |
| `kaizen:rollout` | Déploiement et retour arrière | plan | oui dès que le changement atteint la production |
| `kaizen:units` | Unités d'implémentation | plan | oui (plan prêt) |
| `kaizen:verification` | Contrat de vérification | plan | oui (plan prêt) |
| `kaizen:done` | Définition de terminé | plan | oui (plan prêt) |

### Capsule d'objectif (`kaizen:goal`)

- **Objectif** — ce qui est vrai pour les utilisateurs ou opérateurs *après*, formulé pour rester
  l'objectif même avec une autre implémentation. Un lecteur qui n'a rien lu d'autre doit pouvoir le
  tenir en tête.
- **Moyen** — seulement si une approche est imposée (« passer par la file existante »).
- **Autorité produit** — qui a tranché le périmètre (l'utilisateur dans cette session, un ticket…).
- **Bloquants ouverts** — ou « aucun ».

### Contrat produit (`kaizen:product`)

Plancher : **Résumé** (1 à 3 lignes, tourné vers l'avenir) et **Exigences** (`R1.` une phrase
d'intention + au plus un qualificatif ; groupées par préoccupation sous des intertitres en gras quand
elles couvrent des sujets distincts ; numérotation continue).

Selon la matière (omettre sinon) : Problème · Décisions clés (index de provenance : la décision en
gras, une ligne de raison, `Régit R3, R5`) · Acteurs · Parcours clés · **Exemples d'acceptation**
(`AE1. (couvre R2) Étant donné …, quand …, alors …` — obligatoires dès qu'une exigence est
conditionnelle) · Critères de succès · Hors périmètre (« plus tard » / « hors identité du produit ») ·
Dépendances et hypothèses · Questions ouvertes (« À résoudre avant planification » / « Reportées à la
planification ») · Sources.

**Zones floues** : tant qu'une réponse manque, écris-la sur place
`[À CLARIFIER : question précise — défaut proposé si personne ne répond]` plutôt que de deviner
(« connexion » → `[À CLARIFIER : e-mail + mot de passe, SSO ou les deux ?]`). Admis dans un plan
« exigences » ; **interdit** dans un plan prêt à implémenter (`plan check` échoue).

Une exigence n'engage que ce que l'utilisateur a demandé ou choisi, et ce qu'il faut pour que ça
marche. Un garde-fou que personne n'a demandé (audit, alerte, option…) va dans Hors périmètre ou
Questions ouvertes, pas dans les exigences.

### Contrat de planification (`kaizen:planning`)

- **Décisions techniques clés** — `KTD1. <décision>` : raison, alternative écartée, `couvre R…`.
- **Contexte et motifs à suivre** — fichiers et motifs existants à imiter (chemins exacts).
- **Leçons et règles appliquées** — chaque leçon de `<root>/solutions/` ou règle de pack qui contraint
  le plan, citée (`docs/solutions/…` ou `(pack: id, fichier)`), avec ce qu'elle change ici.
- Selon la matière : Conception technique (diagramme si la structure le mérite) · Impact transverse ·
  Risques et dépendances · Notes de doc / exploitation.

### Contrôle constitutionnel (`kaizen:constitution`)

Si `CONSTITUTION.md` existe (`node "$K" constitution --json`), **chaque article** est évalué, dans un
tableau, avant toute unité :

```markdown
| Article | Verdict | Justification / preuve |
|---|---|---|
| I. Preuve d'abord | ✅ | chaque unité a une stratégie de preuve test d'abord |
| IV. Petits lots | ⚠️ exception | U3 dépasse : migration générée de 600 lignes, non découpable — relue à part |
```

Un article **NON NÉGOCIABLE** n'admet pas de ⚠️ : si le plan ne peut pas le respecter, il est
bloqué (capsule : bloquant ouvert) ou la constitution doit être amendée. Toute exception est reprise
dans la description de la PR.

### Menaces (`kaizen:threats`)

Seulement si le travail touche une surface à risque. Modèle léger **STRIDE** sur les flux nouveaux
ou modifiés : pour chaque menace plausible (usurpation, altération, répudiation, divulgation, déni de
service, élévation de privilège), une ligne : actif visé · scénario · parade dans le plan (unité qui
la porte) ou risque accepté (et par qui). Pas de menace théorique sans chemin dans ce changement.

### Déploiement et retour arrière (`kaizen:rollout`)

- **Exposition** — directe, derrière un feature flag (nom, défaut, qui le bascule), progressive.
- **Ordre** — migrations en expand → migrate → contract ; ce qui doit être déployé avant quoi.
- **Retour arrière** — comment on revient (désactiver le flag, revert, migration inverse) et ce qui
  n'est pas réversible (données écrites, e-mails envoyés) — à dire explicitement.
- **Signal** — ce qu'on surveille après déploiement pour savoir que ça marche (log, métrique, erreur)
  et le seuil qui déclenche le retour arrière.

### Unités d'implémentation (`kaizen:units`)

Des paquets de travail dimensionnés pour un commit chacun, ordonnés par dépendance :

```markdown
### U1. Sérialiseur CSV des commandes
- **Objectif :** …
- **Couvre :** R1, R2, AE1
- **Dépend de :** —
- **Fichiers :** `app/exports/orders_csv.rb` (nouveau), `spec/exports/orders_csv_spec.rb` (nouveau)
- **Approche :** … (suit `app/exports/customers_csv.rb`)
- **Preuve :** test d'abord | caractérisation d'abord | exception (raison + vérification de remplacement)
- **Scénarios de test :** cas nominal ; commande sans lignes ; caractères accentués (BOM, docs/solutions/…)
- **Vérification :** `bundle exec rspec spec/exports/orders_csv_spec.rb` vert
- **Tranche :** T1
```

**Tranches** : une tranche = **une PR**, sous le plafond `pr.max_lines` (400 lignes relisibles par
défaut). Le rapport DORA 2025 montre que l'IA grossit les PR et que la revue devient le goulot :
découpe le plan en tranches livrables et relisables séparément (chaque tranche laisse la branche par
défaut fonctionnelle — derrière un flag si besoin). Un plan d'une seule PR peut omettre le champ.

### Contrat de vérification (`kaizen:verification`)

Commandes réelles du repo (`node "$K" detect`), contrôles ciblés par unité, contrôles manuels ou
navigateur s'il y a de l'UI, et ce qui prouve chaque `AE`.

### Définition de terminé (`kaizen:done`)

Liste vérifiable : toutes les unités livrées, chaque R couvert par une preuve, vérifications vertes,
revue passée sans P0/P1 ouvert, leçon capitalisée si elle passe le test de durabilité.

## Contrôle « prêt pour la planification » (après brainstorm)

1. **Complet** — aucun TBD ni placeholder ; chaque question ouverte est classée ; les
   `[À CLARIFIER : …]` restants sont tous dans « À résoudre avant planification ».
2. **Cohérent** — capsule, exigences, parcours, exemples et périmètre ne se contredisent pas ; aucune
   règle n'est écrite en entier à deux endroits.
3. **Focalisé** — une seule unité de travail cohérente ; le reste est contexte, plus tard ou hors
   périmètre.
4. **Exploitable** — `/kaizen:plan` peut décider *comment* sans inventer de comportement produit,
   d'acteur, de périmètre ou de critère de succès.

## Contrôle « prêt à implémenter » (après plan)

D'abord le contrôle **déterministe** : `node "$K" plan check <chemin>` (frontmatter, sections,
numérotation continue, aucun `[À CLARIFIER`, chaque R et AE couvert par une unité, champs obligatoires
des unités, chaque article de la constitution évalué). Il doit passer. Puis le jugement :

1. Chaque `R` est couvert par au moins une unité ; chaque `AE` par un scénario de test.
2. Chaque unité a des fichiers exacts, une stratégie de preuve et une vérification exécutable.
3. Chaque `KTD` est justifiée par une preuve (code, leçon, doc, pack), pas par une préférence.
4. Les leçons et règles de pack pertinentes sont citées, ou leur absence est un constat vérifié.
5. Aucun bloquant ouvert, ou le plan est explicitement marqué bloqué dans la capsule.
6. Les tranches tiennent sous `pr.max_lines` et chacune laisse la branche par défaut saine.
7. Le retour arrière est décrit, et ce qui est irréversible est dit.
