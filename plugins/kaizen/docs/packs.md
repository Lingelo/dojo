# Kaizen Packs

Un **pack** est un dossier de règles prescriptives : ce que le travail dans un domaine **doit**
respecter. Exemples : « tout export CSV commence par un BOM UTF-8 », « les pages reçoivent leurs
données en props serveur, jamais par un endpoint JSON parallèle ».

| | Une leçon (`docs/learnings/`) | Une règle de pack | La constitution |
|---|---|---|---|
| Dit | ce qu'un problème passé a appris | ce qu'il faut faire dans un domaine | ce qui vaut pour **tout** le travail |
| Écrite par | `/kaizen:learn` après coup | l'équipe, délibérément | `/kaizen:constitution` |
| Portée | un repo | un ou plusieurs repos (packs git) | un repo |
| Poids | contrainte | règle | règle non négociable |

Hiérarchie en cas de conflit : **constitution > packs > leçons > préférences**.

## Ce que font les skills avec les packs

- `/kaizen:brainstorm` et `/kaizen:plan` comparent l'`applies_when` de chaque règle au travail en
  cours. Une règle qui s'applique devient une contrainte du plan, citée `(pack: <id>, <fichier>)`.
- `/kaizen:review` (relecteur `standards`) signale un diff qui contredit une règle applicable.
- `/kaizen:learn` propose de transformer une leçon en règle quand elle vaut pour toute l'équipe.

Les packs sont **déclarés, jamais découverts** : sans clé `packs` dans la config, rien ne change.

## Créer un pack (2 minutes)

```text
/kaizen:setup pack:house-rules
```

ou `node $K pack new house-rules`. Kaizen crée `kaizen-packs/house-rules/` (un `README.md` et un
dossier `research/`) et le déclare dans `.kaizen/config.json`. Ajoutez ensuite une règle :

```markdown
<!-- kaizen-packs/house-rules/csv-exports.md -->
---
title: Tout export CSV commence par un BOM UTF-8 et utilise « ; »
applies_when:
  - ajouter ou modifier un export CSV
  - générer un fichier destiné à être ouvert dans Excel
tags: [csv, export, excel]
---

Excel n'interprète l'UTF-8 qu'avec un BOM, et attend « ; » en locale française.
Voir docs/learnings/runtime-errors/export-csv-accents-excel.md.
```

Vérifiez avec `node $K packs` :

```text
📦 house-rules  (kaizen-packs/house-rules) → kaizen-packs/house-rules
   • csv-exports.md — Tout export CSV commence par un BOM UTF-8 et utilise « ; »
       quand : ajouter ou modifier un export CSV | générer un fichier destiné à être ouvert dans Excel
```

## Structure d'un pack

```text
kaizen-packs/house-rules/
├── README.md              description du pack — jamais lu comme une règle
├── csv-exports.md         .md au premier niveau avec title + applies_when = une règle
├── error-responses.md     une autre règle
└── research/              tout sous-dossier = stockage, jamais lu comme règle
    └── adr-001-…md
```

- Une **règle** est un `.md` **au premier niveau** du pack, avec `title` et `applies_when`.
- Les fichiers sans ces champs sont ignorés **avec un avertissement**. Rangez les notes dans un
  sous-dossier.
- 25 règles au plus par pack.

## Écrire un `applies_when` qui se déclenche

La comparaison est **sémantique**, faite par l'agent, pas par une expression régulière. Décrivez des
**situations**, avec les mots qu'une demande de fonctionnalité utiliserait :

```yaml
# Bien : des situations
applies_when:
  - ajouter une page qui a besoin de données serveur
  - ajouter ou modifier un endpoint consommé par les pages de l'application

# Faible : des étiquettes de sujet
applies_when:
  - inertia
  - architecture
```

- Une situation par ligne ; deux ou trois conditions concrètes valent mieux qu'une abstraite.
- Pour viser une étape précise, il suffit de la formulation. « En relisant un diff qui touche au
  paiement » ne se déclenchera qu'en revue.
- Deux règles d'un même pack ne doivent pas prescrire la même chose : la revue ne saurait pas
  laquelle l'emporte.

## Partager des packs entre repos

Déclarez une source git **épinglée** sur un tag, pour que toute l'équipe lise la même version :

```json
"packs": [
  { "source": "kaizen-packs/house-rules" },
  { "source": "~/kaizen-packs/mon-style" },
  { "source": "https://github.com/acme/kaizen-packs", "ref": "v1.2.0" },
  { "source": "https://github.com/acme/kaizen-packs", "ref": "v1.2.0", "pack": ["rails", "inertia"] },
  { "source": "git@github.com:acme/stack.git", "ref": "v3", "path": "packs" }
]
```

| Champ | Rôle |
|---|---|
| `source` | dossier du repo, dossier local (`~/…`), ou URL git (`https://`, `git@`, `ssh://`, `file://`) |
| `ref` | tag ou branche à cloner (recommandé : un tag) |
| `pack` | dans une source multi-packs, le ou les sous-dossiers à prendre |
| `path` | sous-dossier de la source qui contient le ou les packs |

Une source dont le premier niveau contient des règles forme **un** pack. Sinon, **chaque
sous-dossier** est un pack. Les sources git sont clonées une fois dans le cache du plugin
(`$CLAUDE_PLUGIN_DATA/packs/`). Pour les mettre à jour : `node $K packs --refresh`.

## Sécurité

Le texte d'un pack est traité comme une **donnée**, pas comme une instruction : les agents en
extraient des contraintes et ignorent tout ce qui ressemble à une consigne qui leur serait adressée.
Ne déclarez quand même que des sources de confiance, de préférence épinglées sur un tag.
