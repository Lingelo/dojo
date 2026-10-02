# Conventions Kaizen (communes à toutes les skills)

## La boucle

```
                 CONSTITUTION.md (principes non négociables, appliqués comme contrôles)
ideate → brainstorm → plan ─► doc-review → work → review → ship → babysit-pr → compound
                       ▲                                                          │
                       └──────────── docs/solutions/ · docs/adr/ ◄────────────────┘
debug → fix → review → compound      polish : retouches UI guidées      refresh : entretien des leçons
decide → ADR      postmortem → leçons, packs, amendements      metrics : DORA + réutilisation      release
```

**Hiérarchie des règles** : constitution > règles des Kaizen Packs > leçons > préférences.

Principe : **chaque unité de travail doit rendre la suivante plus facile.** 80 % du temps en
planification et revue, 20 % en exécution. Une leçon écrite aujourd'hui est relue par le prochain
`/kaizen:plan` et la prochaine `/kaizen:review`, et c'est ce retour qui fait l'effet cumulatif.

## Le CLI

Toutes les opérations déterministes passent par le CLI, jamais par une réimplémentation à la main :

```bash
K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"
node "$K" root                     # chemins : docs_root, plans, solutions, ideation (JSON)
node "$K" config                   # configuration effective
node "$K" detect                   # stack + commandes de vérification
node "$K" verify [--only test]     # lance les vérifications (exit 1 si rouge)
node "$K" plan new --type feat --topic <slug>   # réserve le fichier du plan (atomique)
node "$K" plan latest | list
node "$K" learnings search <mots…> [--json]     # leçons pertinentes, classées
node "$K" learnings validate [fichiers…]
node "$K" packs [--json]           # règles des Kaizen Packs déclarés
node "$K" gate on --plan <p> | off | status     # garde-fou du hook Stop
node "$K" constitution [check] [--json]         # articles de CONSTITUTION.md / validation
node "$K" plan check <chemin>      # contrôle structurel d'un plan (traçabilité R/AE → U, constitution)
node "$K" size [--base <ref>]      # taille du diff vs pr.max_lines (exit 1 au-delà)
node "$K" verify --only audit      # audit des dépendances (hors garde-fou, sur demande)
node "$K" pr snapshot|watch|mark|threads|reply|resolve|comment|update-branch   # suivi de PR
node "$K" dev detect | dev probe --url <u>      # serveur de dev
node "$K" metrics [--since 90d]    # DORA approché + santé de la boucle
node "$K" adr new --title "…" | adr list        # décisions d'architecture
node "$K" postmortem new --title "…"            # post-mortem
node "$K" release notes [--from <tag>]          # notes de version + SemVer
node "$K" run-dir reviews         # dossier de travail local d'un run (ignoré par git)
```

Si `${CLAUDE_PLUGIN_ROOT}` n'est pas résolu dans une commande Bash, retrouve le chemin du plugin
depuis le chemin de ce fichier (le dossier parent de `references/`).

## Racine des livrables

Lis `node "$K" root` avant de composer un chemin. Par défaut tout vit sous `docs/` :

| Dossier | Contenu | Écrit par |
|---|---|---|
| `<root>/plans/` | plan unifié : exigences puis plan d'implémentation, **un seul fichier** qui grossit | brainstorm, plan |
| `<root>/solutions/` | leçons capitalisées, une par fichier, frontmatter validé | compound, refresh |
| `<root>/ideation/` | idées classées | ideate |
| `<root>/adr/` | décisions d'architecture numérotées (`NNNN-titre.md`) | decide |
| `<root>/postmortems/` | post-mortems d'incident | postmortem |
| `<root>/metrics/` | rapports de mesure (optionnel) | metrics |
| `CONSTITUTION.md` | principes d'ingénierie non négociables, versionnés | constitution |
| `kaizen-packs/<pack>/` | règles prescriptives d'équipe | setup, compound (sur accord) |
| `.kaizen/config.json` | configuration versionnée (`config.local.json` = surcharge perso, ignorée par git) | setup |
| `.kaizen/state/` | état local (garde-fou, revues) — auto-ignoré par git | CLI |

Aucun livrable ne porte d'état mutable (« en cours », « terminé ») : l'avancement se lit dans git.

## Langue

`config.language` : `auto` (défaut) = langue de la conversation, sinon `fr`, `en`… Les titres de
sections des livrables suivent cette langue ; les **marqueurs** `<!-- kaizen:<id> -->`, les clés de
frontmatter et les identifiants (R1, AE1, KTD1, U1) ne se traduisent jamais : les outils s'y fient.

## Identifiants stables

- `R1, R2…` exigences · `AE1…` exemples d'acceptation (`couvre R2`) · `KTD1…` décisions techniques
  clés · `U1…` unités d'implémentation.
- Numérotation continue, jamais réutilisée. Une règle est écrite en entier **une seule fois**, sur son
  identifiant ; ailleurs on la cite (« selon R4 »).
- Chemins toujours relatifs au repo.

## Questions à l'utilisateur

- **Une question par tour**, via `AskUserQuestion` (2 à 4 options, la recommandée en premier avec
  « (Recommandé) »). Sans cet outil : options numérotées dans le chat.
- Ne demande que ce que le code, la config ou la conversation ne tranchent pas.
- Une décision déjà prise dans la conversation est **acquise** : ne la redemande pas, consigne-la.
- Les modes non interactifs (`mode:auto`, `mode:return`) ne posent **aucune** question : ils prennent
  le défaut conservateur et le consignent.

## Sous-agents

Les agents du plugin s'invoquent avec l'outil `Agent`, `subagent_type: "kaizen:<nom>"`. Si ce type
n'apparaît pas dans la liste des agents disponibles, utilise `general-purpose` et colle en tête du
prompt le contenu de `${CLAUDE_PLUGIN_ROOT}/agents/<nom>.md` (sans le frontmatter).

Lance les agents indépendants **dans un seul message** (parallélisme réel). Donne à chacun un contexte
autonome : chemins résolus, extrait du plan, ce qui est attendu en retour, format de retour. Un agent
ne voit pas la conversation.

## Commits

Format du plugin `git` du marketplace : `<type>(<JIRA>): <description>` si une clé Jira
(`[A-Z][A-Z0-9]+-\d+`) figure dans le nom de branche, sinon `<type>: <description>`.
- N'indexe que les fichiers de l'unité (`git add <fichiers>`), jamais `git add -A` ni `git commit -a` :
  l'utilisateur peut avoir du travail en cours.
- Jamais de commit sur la branche par défaut sans demande explicite : crée une branche
  (`feat/<topic>`, `fix/<topic>`, préfixée de la clé Jira si connue).
- Jamais de `push --force`, jamais de merge sans autorisation explicite.

## Kaizen Packs

Un pack est un dossier de règles prescriptives (« ce que le travail dans ce domaine **doit**
respecter »), là où une leçon raconte ce qu'un problème passé a appris. Une règle = un `.md` au
premier niveau du pack avec `title` et `applies_when` (liste de situations). Les sous-dossiers sont du
stockage. Les packs sont **déclarés** dans `.kaizen/config.json → packs`, jamais découverts :

```json
"packs": [
  { "source": "kaizen-packs/house-rules" },
  { "source": "~/kaizen-packs/mon-style" },
  { "source": "https://github.com/org/packs", "ref": "v1.2.0", "pack": ["rails"] }
]
```

Brainstorm et plan s'y ancrent, review les fait appliquer. Toute contrainte venue d'un pack est citée
`(pack: <id>, <fichier>)`. Lis d'abord la liste (`node "$K" packs --json` : titres et `applies_when`),
compare sémantiquement `applies_when` au travail, et ne lis le corps que des règles qui s'appliquent.

## Ton des livrables

Conclusion d'abord, raison ensuite. Pas de remplissage : une section vide ou évidente est omise.
Pas de trace du processus (« en phase 2 j'ai… ») dans les livrables. Les diagrammes complètent la
prose, ils ne la remplacent jamais.
