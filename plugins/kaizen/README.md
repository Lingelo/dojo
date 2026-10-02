# Kaizen Plugin

**Chaque unité de travail doit rendre la suivante plus facile.**

Kaizen structure le travail avec Claude Code en une boucle (brainstorm, plan, work, review, compound)
dont la dernière étape **consigne ce qui a été appris** là où le prochain cycle le relira. Le
développement classique accumule de la dette : chaque correctif laisse un savoir local que quelqu'un
devra redécouvrir. Kaizen inverse la tendance : 80 % planification et revue, 20 % exécution, et une
mémoire du projet qui s'enrichit à chaque cycle.

```
 ideate ─► brainstorm ─► plan ─► work ─► review ─► compound
                          ▲                           │
                          └──── docs/solutions/ ◄─────┘   leçons relues par chaque plan et chaque revue
 debug ─► correctif ─► review ─► compound                  refresh : entretien des leçons
 lfg   : tout enchaîner jusqu'à la PR                      packs   : règles d'équipe prescriptives
```

> Inspiré très fortement du plugin [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin)
> d'Every (MIT) : même philosophie, mêmes contrats d'artefacts (plan unifié, schéma des leçons,
> personas de revue). Kaizen en est une version **allégée, uniquement pour Claude Code et en
> français**, intégrée aux plugins de ce marketplace (`git`, `security`, `playwright`). Elle ajoute un
> **garde-fou par hook** et un **CLI déterministe sans dépendances**. Voir [LICENSE](LICENSE).

## Installation

```json
{
  "enabledPlugins": {
    "kaizen@angelo-plugins": true
  }
}
```

Prérequis : Node ≥ 18 et git. Aucune dépendance npm. Puis, dans un repo :

```
/kaizen:setup
```

## Les commandes

### La boucle

| Commande | Rôle | Produit |
|---|---|---|
| `/kaizen:brainstorm <idée>` | Définit **QUOI** construire, par un dialogue d'une question à la fois ancré dans le code et les leçons | `docs/plans/…-plan.md` (contrat produit : R1…, AE1…) |
| `/kaizen:plan [plan\|idée]` | Décide **COMMENT** : recherche parallèle (motifs du repo, leçons, historique git, doc externe), décisions justifiées, unités avec tests | le **même** fichier enrichi (KTD, U1…, vérification) |
| `/kaizen:work [plan]` | Exécute unité par unité, test d'abord, un commit par unité, garde-fou actif ; revue obligatoire avant livraison | commits + PR |
| `/kaizen:review [PR\|base:] [apply]` | Revue multi-agents choisis selon le diff, filtrée par confiance, constats bloquants vérifiés, conformité au plan | rapport + verdict |
| `/kaizen:compound` | Capitalise **une** leçon durable, validée, trouvable | `docs/solutions/<catégorie>/<leçon>.md` |

### Autour de la boucle

| Commande | Rôle |
|---|---|
| `/kaizen:ideate [sujet\|surprends-moi]` | 5 angles en parallèle, chaque idée avec une base vérifiable, critique à froid, 5–7 survivantes classées → `docs/ideation/` |
| `/kaizen:debug <symptôme\|ticket>` | Reproduction, traçage, une hypothèse à la fois, chaîne causale complète **avant** de corriger, correctif test d'abord |
| `/kaizen:refresh [zone] [élaguer]` | Audite les leçons contre le code actuel : garder / mettre à jour / fusionner / remplacer / supprimer, avec preuves |
| `/kaizen:lfg <demande\|plan>` | Autonome : plan ou debug → work → simplification → revue + correctifs → compound → push → PR → CI (2 réparations max). Ne merge jamais seul. |
| `/kaizen:setup [pack:<nom>] [check]` | Config, détection de la stack, trouvabilité depuis `CLAUDE.md`, création de packs, bilan de santé |

### Usage type

```text
/kaizen:brainstorm rendre les relances de paiement plus sûres
/kaizen:plan
/kaizen:work
/kaizen:review
/kaizen:compound
```

Ou, après le brainstorm : `/kaizen:lfg`.

## Ce qui fait l'effet cumulatif

1. **`/kaizen:compound` écrit une leçon seulement si elle passe le test de durabilité.** Le
   contrefactuel : « sans ce document, un futur développeur referait-il l'erreur ? ». Frontmatter
   structuré (module, `problem_type`, symptômes, cause, `applies_when`, tags), vocabulaire repris du
   corpus existant, mise à jour d'une leçon existante plutôt qu'un doublon, validation par le CLI.
2. **L'agent `learnings-researcher` relit ces leçons** à chaque plan, brainstorm, revue et debug, et
   les convertit en contraintes, pièges à éviter et tests à prévoir. Le plan les cite, la revue
   signale un diff qui refait une erreur documentée.
3. **`/kaizen:refresh` empêche le corpus de pourrir** : une leçon fausse est pire qu'aucune.
4. **Kaizen Packs** : des règles prescriptives d'équipe (« tout export CSV commence par un BOM »),
   déclarées dans la config, éventuellement partagées entre repos via git. Brainstorm et plan s'y
   ancrent, review les fait appliquer, et chaque contrainte est citée `(pack: id, fichier)`.

## Agents (15)

| Rôle | Agents |
|---|---|
| Recherche | `repo-researcher`, `learnings-researcher`, `git-historian`, `docs-researcher`, `flow-analyst` |
| Revue (socle) | `correctness-reviewer`, `standards-reviewer` (standards du projet, packs, leçons) |
| Revue (selon le diff) | `security-reviewer`, `testing-reviewer`, `performance-reviewer`, `reliability-reviewer`, `api-contract-reviewer`, `data-migration-reviewer`, `maintainability-reviewer`, `adversarial-reviewer` |

Les relecteurs partagent un contrat ([`references/review-contract.md`](references/review-contract.md)) :
- sortie JSON ;
- sévérité P0 à P3 ;
- confiance ancrée (50, 75 ou 100) ;
- règle « cite la ligne » : pas de confiance 75 ou plus sans la ligne verbatim ;
- liste de non-constats à supprimer.

L'orchestrateur fusionne les constats, retire les doublons, puis **relit lui-même les lignes citées
de chaque P0 et P1** avant de rendre son verdict.

## Garde-fou qualité (hook `Stop`)

Pendant `/kaizen:work` et `/kaizen:lfg`, le hook `Stop` relance les vérifications du projet (test,
lint, typecheck, détectés automatiquement ou configurés). Claude ne peut pas terminer tant qu'elles
sont rouges. Le hook ne coûte rien en dehors de ces skills. Après 3 blocages consécutifs, il laisse
passer en exigeant que l'échec soit signalé, ce qui empêche toute boucle infinie.

Stacks détectées :
- Node (npm, pnpm, yarn, bun) ;
- Python (pytest, ruff, mypy, uv, poetry) ;
- Go ;
- Rust ;
- Maven et Gradle ;
- Ruby (rspec, rubocop) ;
- PHP ;
- Makefile.

## Fichiers dans le repo

```
.kaizen/config.json          configuration versionnée (config.local.json = surcharge perso, ignorée)
.kaizen/state/               état local (garde-fou, revues) — auto-ignoré par git
docs/plans/                  plans unifiés (un fichier par sujet, qui grossit du QUOI au COMMENT)
docs/solutions/              leçons capitalisées
docs/ideation/               idées classées
kaizen-packs/<pack>/         règles d'équipe (si créées)
```

```json
{
  "docs_root": "docs",
  "language": "auto",
  "tracker": "auto",
  "verify": { "test": "pnpm vitest run", "lint": "pnpm eslint ." },
  "gate": { "enabled": true, "max_blocks": 3, "timeout_seconds": 600, "max_age_hours": 24 },
  "packs": [
    { "source": "kaizen-packs/house-rules" },
    { "source": "https://github.com/org/packs", "ref": "v1.2.0", "pack": ["rails"] }
  ]
}
```

## CLI

Les skills délèguent tout le travail déterministe à `scripts/kaizen.mjs`, qu'on peut aussi lancer à la main :

```bash
K=plugins/kaizen/scripts/kaizen.mjs
node $K init                               # .kaizen/ + docs/{plans,solutions,ideation}
node $K detect                             # stack + commandes de vérification
node $K verify                             # lance les vérifications (exit 1 si rouge)
node $K plan new --type feat --topic export-csv   # réserve un fichier de plan (atomique)
node $K plan list
node $K learnings search csv excel         # leçons pertinentes, classées
node $K learnings validate                 # frontmatter de toutes les leçons
node $K learnings stats                    # vocabulaire du corpus
node $K packs                              # règles des packs déclarés
node $K pack new house-rules               # crée et déclare un pack
node $K gate on|off|status                 # garde-fou
```

## Intégration au marketplace

- **git** : même format de commit, `<type>(<JIRA>): …`, clé Jira lue dans la branche ; `/push` utilisé
  pour la livraison s'il est installé.
- **security** : ses hooks restent actifs ; les relecteurs n'affichent jamais de secret
  (`<REDACTED>`).
- **playwright** : utilisé par `work` et `lfg` pour vérifier les changements d'interface.
- **experts** : l'agent `architect` reste disponible pour les décisions d'architecture lourdes pendant
  `/kaizen:plan`.
