---
name: doc-review
description: Relit un plan ou des exigences Kaizen avant qu'on les construise — contrôle déterministe (plan check), puis relecteurs spécialisés en parallèle (cohérence et faisabilité toujours ; périmètre, sécurité, adversarial, design selon le document), vérification des constats, corrections mécaniques appliquées, décisions soumises à l'auteur. Appelée automatiquement par /kaizen:plan ; utilisable seule : « relis ce plan », « challenge cette spec », /kaizen:doc-review [chemin].
allowed-tools: Bash(node:*), Bash(git:*), Read, Edit, Glob, Grep, Agent, AskUserQuestion
argument-hint: "[chemin du plan | vide = dernier plan] [mode:auto]"
---

# Doc review — relire le plan avant de construire

Un défaut corrigé dans un plan coûte une phrase ; dans du code, une PR de plus. Aider l'auteur à
finir un document **sûr** qu'il peut exécuter : trouver ce qui changerait le résultat ou gênerait
vraiment l'exécution, corriger ce qui est mécanique, soumettre le reste. Un document adéquat n'a
besoin d'aucun changement.

Lis `${CLAUDE_PLUGIN_ROOT}/references/conventions.md` et `${CLAUDE_PLUGIN_ROOT}/references/plan-contract.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

**`mode:auto`** (posé par `/kaizen:plan` et `/kaizen:lfg`) : aucune question. Applique `safe_auto` et
les `gated_auto` qui précisent sans changer de décision ; rends
`{ verdict: ready|ready-with-notes|blocked, applied: [...], decisions_needed: [...], coverage }`.

## 1. Document

Chemin donné, sinon `node "$K" plan latest`. Vérifie qu'il est lisible sur disque. Classe-le :
**exigences** (pas de `<!-- kaizen:units -->`) ou **plan prêt**.

## 2. Contrôle déterministe

`node "$K" plan check <chemin>`. Ses erreurs sont des constats certains (confiance 100) : corrige
directement celles qui sont mécaniques (numérotation, champ manquant que le plan permet de remplir,
article de constitution oublié dans le tableau quand le verdict est évident) ; les autres deviennent
des décisions.

## 3. Relecteurs

Toujours `kaizen:plan-coherence-reviewer` et `kaizen:plan-feasibility-reviewer`, plus :

| Relecteur | Quand |
|---|---|
| `kaizen:plan-scope-reviewer` | tout plan prêt ; des exigences avec > 8 éléments, plusieurs priorités ou des « plus tard » |
| `kaizen:plan-security-reviewer` | auth, sessions, endpoints exposés, données sensibles (personnelles, paiement, jetons), intégrations tierces |
| `kaizen:plan-adversarial-reviewer` | domaine à enjeu (auth, paiement, migration, données personnelles, intégrations), nouvelle abstraction ou motif d'architecture, plan sans brainstorm préalable (`source: plan`), périmètre élargi, alternatives non tranchées |
| `kaizen:plan-design-reviewer` | écrans, composants, parcours, formulaires, accessibilité |

Annonce l'équipe (une ligne par relecteur conditionnel et sa raison). Lis
`${CLAUDE_PLUGIN_ROOT}/references/doc-review-contract.md` et lance **tous** les relecteurs **dans un
seul message**, chacun avec : le contrat, le chemin du plan (à lire en entier), la constitution
(`node "$K" constitution --json`) et les règles de packs applicables, les décisions acquises (Key
Decisions annotées, KTD « décidé en session »), et sa lentille.

## 4. Synthèse

- Normalise et dédoublonne (même ancre, même problème) ; deux relecteurs concordants renforcent la
  confiance.
- Porte : 75–100 retenus ; 50 seulement si P0 ; `quote` non retrouvé verbatim dans le plan → rejeté.
- **Vérifie toi-même** chaque P0/P1 : relis le passage et le code cité. Réfuté → retiré (noté dans la
  couverture).
- Un constat qui rejuge une décision acquise sans preuve qu'elle ne peut pas marcher → retiré.

## 5. Appliquer et décider

- **Applique** les `safe_auto` (références, comptes, terminologie) et les `gated_auto` qui précisent
  sans changer de décision — **sur place**, dans le format du document, sans empiler de section
  « corrections ». Relance `plan check`.
- **Décisions** (`manual`, ou `gated_auto` qui change le comportement) : en interactif, une question
  par décision via `AskUserQuestion`, avec le passage cité, la conséquence, et ta recommandation en
  premier ; applique la réponse. En `mode:auto` : laisse-les dans le retour.

## 6. Rapport

```markdown
## Relecture du plan — <titre>
**Verdict : ✅ prêt | ⚠️ prêt avec réserves | ⛔ bloqué** — <une phrase>
**Équipe :** coherence, feasibility, security (endpoint d'export), …
**Appliqué :** 4 corrections (2 références, 1 terme, 1 exemple d'acceptation ajouté)
**Décisions prises :** …
**Restant :** <constats non résolus, avec ancre>
```

⛔ si un P0 reste ou si `plan check` échoue encore ; ⚠️ s'il reste des P1/P2 non résolus.
