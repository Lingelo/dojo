---
name: {{nom du projet}}
version: 1.0.0
ratified: {{YYYY-MM-DD}}
last_amended: {{YYYY-MM-DD}}
artifact: kaizen-constitution/v1
---

# Constitution d'ingénierie — {{nom du projet}}

{{1 à 2 lignes : ce que cette constitution gouverne (ce repo, ce service…) et pour qui elle est écrite
(humains et agents).}}

Hiérarchie : **constitution > règles des Kaizen Packs > leçons de `docs/solutions/` > préférences.**
Un plan qui s'écarte d'un article le justifie dans son contrôle constitutionnel ; un article
**NON NÉGOCIABLE** n'admet aucune exception sans amendement.

## Articles

<!-- 5 à 9 articles. Chacun : une règle de 1 à 3 phrases, un contrôle vérifiable, des exceptions
     éventuelles. Exemples de départ ci-dessous — à garder, réécrire ou supprimer pendant l'interview. -->

### I. {{Titre}} — NON NÉGOCIABLE

{{Règle : ce qui est toujours vrai, formulé pour être vérifiable.}}

**Contrôle :** {{la question qu'un relecteur ou un agent pose au plan et au diff, à laquelle on répond par oui ou non avec une preuve.}}

### II. {{Titre}}

{{Règle.}}

**Contrôle :** {{…}}

**Exceptions :** {{quand c'est permis, et comment l'exception est consignée.}}

## Politique IA

<!-- Ce que les agents peuvent faire seuls, ce qui exige un humain. C'est un article comme les autres :
     garde la numérotation continue. -->

### {{N}}. Autonomie des agents

{{Ex. : Les agents peuvent créer des branches, commiter, pousser une branche de travail et ouvrir une PR.
Ils ne mergent jamais, ne poussent jamais sur la branche par défaut, ne réécrivent jamais l'historique
partagé. Une migration de données, l'ajout d'une dépendance ou un changement d'infrastructure exige
l'accord explicite d'un humain dans la session.}}

**Contrôle :** {{Toute action de ce type dans la PR est-elle tracée à un accord humain (session, commentaire de PR) ?}}

## Gouvernance

- **Amendement** — par `/kaizen:constitution amend` : proposition, impact (plans en cours, packs et
  leçons en conflit), accord explicite, puis mise à jour de la version et de `last_amended`.
- **Versionnage** — MAJEUR : article retiré ou redéfini de façon incompatible ; MINEUR : article
  ajouté ou élargi ; CORRECTIF : clarification sans changement de sens.
- **Application** — `/kaizen:plan` évalue chaque article (section « Contrôle constitutionnel »),
  `/kaizen:doc-review` et `/kaizen:review` le vérifient, toute exception est justifiée dans le plan et
  rappelée dans la PR.
- **Revue** — relue au moins une fois par trimestre ou après un post-mortem qui la met en cause.
