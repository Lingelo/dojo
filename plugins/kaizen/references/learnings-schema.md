# Schéma des leçons (`<root>/learnings/`)

Contrat de frontmatter des leçons écrites par `/kaizen:learn` et entretenues par
`/kaizen:prune-learnings`. Validation : `node "$K" learnings validate <fichier>` (exit 1 si invalide).

## Le test de durabilité

Une leçon n'a sa place que si elle porte un **raisonnement durable** que le code final, les tests, les
types, les commentaires et la doc existante ne rendent pas évident, et dont la perte ferait
plausiblement **revenir le problème, prendre un vrai risque, ou refaire une enquête coûteuse**.

> Contrefactuel : si ce document disparaissait, un futur développeur qui lit l'implémentation finale
> referait-il probablement l'erreur ou la même enquête ?

L'effort fourni, la taille du diff ou le fait d'avoir fini ne suffisent pas. Si le test échoue : on
n'écrit rien et on dit pourquoi.

## Deux pistes, selon `problem_type`

| Piste | `problem_type` |
|---|---|
| **Bug** (diagnostiqué et corrigé) | `build_error`, `test_failure`, `runtime_error`, `performance_issue`, `database_issue`, `security_issue`, `ui_bug`, `integration_issue`, `logic_error` |
| **Savoir** (pratique, motif, décision) | `best_practice`, `documentation_gap`, `workflow_issue`, `developer_experience`, `architecture_pattern`, `design_pattern`, `tooling_decision`, `convention` — prends la valeur la plus précise, `best_practice` en dernier recours |

### Champs requis (les deux pistes)

- `title` — titre clair, identique au H1
- `date` — `YYYY-MM-DD`
- `module` — module ou zone touchée
- `problem_type` — énumération ci-dessus
- `component` — vocabulaire ouvert (voir « Vocabulaire du corpus d'abord ») ; défauts suggérés :
  `data_model`, `api_layer`, `service_layer`, `background_job`, `database`, `frontend`, `messaging`,
  `infrastructure`, `observability`, `authentication`, `payments`, `development_workflow`,
  `testing_framework`, `documentation`, `tooling`
- `severity` — `critical` | `high` | `medium` | `low`

### Piste bug — requis en plus

- `symptoms` — liste de 1 à 5 symptômes observables
- `root_cause` — vocabulaire ouvert ; défauts : `wrong_api`, `data_integrity`, `concurrency`,
  `async_timing`, `memory_leak`, `config_error`, `logic_error`, `test_isolation`, `missing_validation`,
  `missing_permission`, `missing_workflow_step`, `inadequate_documentation`, `missing_tooling`,
  `incomplete_setup`
- `resolution_type` — `code_fix` | `migration` | `config_change` | `test_fix` | `dependency_update` |
  `environment_setup` | `workflow_improvement` | `documentation_update` | `tooling_addition` |
  `seed_data_update`
- optionnel : `framework_version` (ex. `rails 7.1.2`, `node 22.4.0`)

### Piste savoir — optionnels

`applies_when` (≤ 5 situations), `symptoms`, `root_cause`, `resolution_type`.

### Optionnels (les deux pistes)

- `category` — sous-dossier de `learnings/`
- `tags` — ≤ 8 mots-clés en minuscules-avec-tirets
- `related_components` — autres composants
- `retire_when` — le changement **hors du repo** qui rendrait la leçon caduque et comment le vérifier
  (bug amont ouvert, version d'outil…). Une chaîne ; entre guillemets si elle contient ` #` ou `: `.

## Vocabulaire du corpus d'abord

Un repo qui a déjà des leçons a son propre vocabulaire, et ses recherches s'appuient dessus. Avant de
classer, échantillonne le frontmatter et les dossiers existants (`node "$K" learnings stats`) :
- `component` : la valeur que le corpus utilise déjà pour cette zone ;
- `root_cause` : la valeur déjà utilisée pour **cette même cause**, où qu'elle soit ;
- en cas de graphies concurrentes, la plus fréquente (égalité : la plus récente) ;
- les défauts suggérés seulement si rien ne couvre la zone ou la cause. Pas de quasi-synonyme.
- Dossier : celui qui couvre déjà la zone ; sinon le tableau ci-dessous.

## Dossiers par défaut

| `problem_type` | Dossier |
|---|---|
| `build_error` | `learnings/build-errors/` |
| `test_failure` | `learnings/test-failures/` |
| `runtime_error` | `learnings/runtime-errors/` |
| `performance_issue` | `learnings/performance-issues/` |
| `database_issue` | `learnings/database-issues/` |
| `security_issue` | `learnings/security-issues/` |
| `ui_bug` | `learnings/ui-bugs/` |
| `integration_issue` | `learnings/integration-issues/` |
| `logic_error` | `learnings/logic-errors/` |
| `developer_experience` | `learnings/developer-experience/` |
| `workflow_issue` | `learnings/workflow-issues/` |
| `best_practice` | `learnings/best-practices/` |
| `documentation_gap` | `learnings/documentation-gaps/` |
| `architecture_pattern` | `learnings/architecture-patterns/` |
| `design_pattern` | `learnings/design-patterns/` |
| `tooling_decision` | `learnings/tooling-decisions/` |
| `convention` | `learnings/conventions/` |

Nom de fichier : `<slug-du-titre>.md`, sans date (la date est dans le frontmatter).

## Sûreté YAML

Mets entre guillemets doubles tout élément de liste qui commence par `` ` [ * & ! | > % @ ? `` ou qui
contient `": "`. Exemple : `- "\`npm ci\` échoue avec EINTEGRITY"`.

## Gabarits

- Piste bug : `${CLAUDE_PLUGIN_ROOT}/templates/learning-bug.md`
- Piste savoir : `${CLAUDE_PLUGIN_ROOT}/templates/learning-knowledge.md`
