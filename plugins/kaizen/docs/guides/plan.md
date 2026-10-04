# `/kaizen:plan`

> Décider **comment** construire : recherche en parallèle, décisions justifiées, unités de travail
> testables, déploiement et retour arrière. Sans jamais écrire de code de production.

Le plan Kaizen est un document de **décisions**, pas un script d'implémentation. Il dit ce qui a été
décidé et pourquoi, ce qui est dans ou hors du périmètre, quelles unités de travail existent, quels
fichiers elles touchent, quels tests doivent passer, et comment revenir en arrière. L'implémenteur
(`/kaizen:work` ou un humain) garde le jugement sur le code.

## En bref

| | |
|---|---|
| **Ce qu'elle fait** | Recherche (motifs du repo, leçons, historique, doc externe) → décisions (KTD) → contrôle constitutionnel, menaces, déploiement → unités groupées en tranches de PR → `plan check` → `/kaizen:doc-review` |
| **Quand l'utiliser** | Après un brainstorm ; une demande claire mais non triviale ; un ticket ou une spec à transformer en travail exécutable ; approfondir un plan existant |
| **Quand ne pas l'utiliser** | Idée encore floue (→ [brainstorm](brainstorm.md)) ; bug sans cause connue (→ [debug](debug.md)) ; changement d'une ligne : demandez-le directement |
| **Ce qu'elle produit** | Le plan unifié enrichi **sur place** (ou un nouveau fichier `docs/plans/…-plan.md`) ; pour un petit travail, un énoncé direct ou un brief dans le chat |
| **Et ensuite** | « Plan prêt : `<chemin>`. Que veux-tu faire ? » → `work` (recommandé), `autopilot`, approfondir, relire soi-même |

## Exemples

```text
/kaizen:plan                                              # le plan écrit par le brainstorm de cette session
/kaizen:plan docs/plans/2026-10-02-1430-feat-export-csv-commandes-plan.md
/kaizen:plan ajouter un digest e-mail quotidien à 8 h UTC
/kaizen:plan deepen docs/plans/2026-09-12-0900-refactor-auth-plan.md
```

## Comment ça se passe

1. **Source et forme** :
   - **Direct** : le changement est énoncé en quelques phrases ;
   - **Brief** : le plan tient dans le chat ;
   - **Durable** : un fichier. C'est toujours le cas pour l'auth, le paiement, une migration ou un
     contrat externe.
2. **Recherche en parallèle** :

   | Agent | Rôle |
   |---|---|
   | `repo-researcher` | motifs à imiter, points d'intégration, tests voisins, avec chemins exacts |
   | `learnings-researcher` | leçons, ADR, post-mortems et règles de packs qui s'appliquent |
   | `git-historian` | pourquoi le code est ainsi (zone ancienne ou fragile) |
   | `docs-researcher` | comportement d'une dépendance **dans la version de votre lockfile** |
   | `flow-analyst` | parcours et cas d'erreur manquants (si pas de brainstorm) |

3. **Décisions** : chaque KTD a une raison, une alternative écartée et les exigences qu'elle couvre.
   Une leçon qui s'applique **change** le plan et y est citée.
4. **Sections propres à Kaizen** :
   - **Contrôle constitutionnel** : un verdict par article. Un article NON NÉGOCIABLE impossible à
     respecter bloque le plan.
   - **Menaces** (STRIDE léger) si la zone est sensible, chaque parade portée par une unité.
   - **Déploiement et retour arrière** : exposition (flag ?), ordre, retour arrière, ce qui est
     irréversible, signal à surveiller.
5. **Unités** U1… : objectif, `Couvre`, fichiers, approche (motif cité), **preuve** (test d'abord par
   défaut), scénarios de test, vérification exécutable, **tranche**. Une tranche, c'est une PR sous
   `pr.max_lines`, qui laisse la branche par défaut saine.
6. **Contrôles** :
   - `node $K plan check` doit passer ;
   - contrôle de confiance ;
   - `/kaizen:doc-review mode:auto` **obligatoire**, qui corrige le mécanique et vous pose les
     décisions restantes.

## Ce que vérifie `plan check`

- frontmatter (`artifact: kaizen-plan/v1`, pas de `status`) et sections présentes ;
- R, U numérotés sans trou ;
- **chaque R et chaque AE couvert par une unité** ;
- chaque unité avec **Couvre**, **Fichiers**, **Preuve** et **Vérification** ;
- aucun `[À CLARIFIER : …]` restant dans un plan prêt ;
- chaque article de `CONSTITUTION.md` évalué.

Exemple complet : [`templates/plan-example.md`](../../templates/plan-example.md). Contrat :
[`references/plan-contract.md`](../../references/plan-contract.md).

## Options

| Option | Effet |
|---|---|
| `deepen <chemin>` | approfondit les sections faibles par une recherche ciblée, intégrée sur place ; ajoute `deepened:` au frontmatter |
| `mode:return` | aucune question : hypothèses consignées, résultat structuré (utilisé par `autopilot`) |

## Bon à savoir

- **Construis ce qui est demandé** : un mécanisme non demandé (retry, option, abstraction) n'entre
  dans le plan que si son absence laisse un dommage passer inaperçu, ou s'il serait coûteux
  d'ajouter plus tard. Et alors dans sa plus petite forme.
- Pour une décision lourde ou irréversible, le plan propose `/kaizen:decide` plutôt que de la
  trancher en une ligne.
- Pas de trace du processus dans le fichier (« en phase 2, j'ai… »).

## Voir aussi

[brainstorm](brainstorm.md) · [doc-review](doc-review.md) · [work](work.md) · [decide](decide.md)
