# `/kaizen:review`

> Une revue de code par des relecteurs spécialisés, choisis selon ce que le diff touche, dont chaque
> constat bloquant est vérifié avant d'être rapporté.

## En bref

| | |
|---|---|
| **Ce qu'elle fait** | Périmètre → intention et plan → sélection des relecteurs → lancement en parallèle → fusion, filtrage par confiance, vérification des P0/P1 → rapport avec verdict |
| **Quand l'utiliser** | Avant de livrer (obligatoire dans `work`) ; sur une PR à relire ; après un correctif non trivial |
| **Quand ne pas l'utiliser** | Relire un **plan** (→ [doc-review](doc-review.md)) ; traiter des commentaires déjà postés sur une PR (→ [address-feedback](address-feedback.md)) |
| **Ce qu'elle produit** | Un rapport : verdict ✅ prêt / ⚠️ réserves / ⛔ pas prêt, constats numérotés, respect de la constitution, conformité au plan, trous de tests, risques, problèmes préexistants, ce qui mérite une leçon |
| **Et ensuite** | `apply` pour appliquer les correctifs, ou « applique 1, 3 et 4 » |

## Exemples

```text
/kaizen:review                              # branche courante vs sa base (non commité inclus)
/kaizen:review 42                           # la PR #42 (sans changer de branche)
/kaizen:review base:release/2.3
/kaizen:review plan:docs/plans/…-plan.md    # vérifier la conformité à ce plan
/kaizen:review apply                        # revue puis application des correctifs
```

## Les relecteurs

| Relecteur | Quand |
|---|---|
| `correctness-reviewer` | toujours. Exécute mentalement le code : bornes, null, états, erreurs avalées, intention non tenue |
| `standards-reviewer` | dès qu'il existe une constitution, des standards, une règle de pack ou une leçon pertinente. Applique chaque **Contrôle** de la constitution et cite la règle violée |
| `testing-reviewer` | tests touchés, ou comportement modifié |
| `security-reviewer` | auth, entrées utilisateur, endpoints, secrets, crypto… (OWASP et CWE dans le titre) |
| `performance-reviewer` | requêtes, boucles lourdes, fan-out, cache |
| `reliability-reviewer` | erreurs, retries, timeouts, jobs, appels externes |
| `api-contract-reviewer` | interface consommée à l'extérieur |
| `data-migration-reviewer` | migrations, backfills, schémas |
| `maintainability-reviewer` | refactors, nouvelles abstractions, ≥ 200 lignes |
| `adversarial-reviewer` | ≥ 50 lignes, ou risque (auth, paiement, concurrence, CI…) : construit des scénarios d'échec |

La sélection se fait **par jugement sur le diff réel**, et chaque relecteur retenu est justifié en
une ligne. Pour un diff de 20 lignes ou moins, sans risque : relecture directe, sans sous-agents.

## Ce qui rend les constats fiables

- **Contrat commun** ([`references/review-contract.md`](../../references/review-contract.md)) :
  - sévérité P0 à P3 ;
  - confiance ancrée à 50, 75 ou 100 ;
  - un correctif concret proposé, avec ses hypothèses nommées ;
  - une liste de non-constats à taire (style, ce que le linter attrape, code intentionnel…).
- **Règle « cite la ligne »** : pas de confiance 75 ou plus sans la ligne verbatim avec
  `fichier:ligne`.
- **Validation** : l'orchestrateur relit lui-même les lignes de chaque P0 et P1. Un constat réfuté
  est retiré. Un sujet protégé (perte de données, accès, injection, secrets) ne peut être écarté que
  sur preuve.

Exemple réel, tiré d'une évaluation : un diff avec `execSync(\`grep "${customer}" …\`)` et
`Math.floor(total / size)` donne le verdict ⛔. L'injection de commande ressort en **P0** (100) et la
dernière page perdue en **P1**. L'orchestrateur a aussi corrigé les numéros de ligne erronés de deux
relecteurs.

## Options

| Option | Effet |
|---|---|
| `apply` | applique les correctifs `gated_auto`, un par un, en revérifiant après chacun ; les `manual` restent listés |
| `mode:agent` | retour JSON sans prose ni modification (utilisé par `work` et `autopilot`) |
| `plan:<chemin>` | plan de référence pour la conformité |
| `base:<ref>` | base de comparaison |

## Bon à savoir

- La revue s'**enregistre** pour la branche courante (`node $K review record`) : c'est ce que le hook
  de push exige avant tout `git push`. Après plus de `review.max_unreviewed_lines` lignes modifiées
  (80 par défaut), il faut une nouvelle revue.
- Le profil (`lean`, `standard`, `full`) ajuste le nombre de relecteurs, jamais l'obligation de revue.
- **Rapport seul par défaut**, jamais de push. Une PR passée en argument fixe le **périmètre**, pas
  l'autorisation de changer de branche.
- Les retours bruts des relecteurs sont gardés dans `.kaizen/state/reviews/<horodatage>/`.

## Voir aussi

[doc-review](doc-review.md) · [work](work.md) · [constitution](constitution.md) · [ship](ship.md)
