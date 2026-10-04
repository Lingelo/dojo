# Catalogue des relecteurs

Sélectionne par **jugement sur le diff réel** (lis-le), pas par mots-clés. Un relecteur sans surface à
relire coûte du temps et ajoute du bruit.

## Socle

| Relecteur | Agent | Quand |
|---|---|---|
| `correctness` | `kaizen:correctness-reviewer` | toujours (revue ciblée ou complète) |
| `standards` | `kaizen:standards-reviewer` | dès qu'existe `CONSTITUTION.md`, au moins un fichier de standards applicable (`CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `.claude/rules/`), une règle de pack dont `applies_when` correspond, ou une leçon pertinente de `docs/learnings/` |

## Conditionnels génériques

| Relecteur | Agent | Quand le diff touche… |
|---|---|---|
| `testing` | `kaizen:testing-reviewer` | des fichiers de test ou leur infrastructure ; **ou** un comportement modifié (nouvelles branches, mutation d'état, API, flux de contrôle, gestion d'erreur) avec ou sans tests. Pas pour des changements non comportementaux. |
| `maintainability` | `kaizen:maintainability-reviewer` | refactor substantiel, nouvelles abstractions, déplacements de fichiers, couplage, ou ≥ 200 lignes exécutables modifiées |

## Conditionnels par domaine

| Relecteur | Agent | Quand le diff touche… |
|---|---|---|
| `security` | `kaizen:security-reviewer` | middleware d'auth, endpoints publics, entrées utilisateur, contrôles de permission (y compris feature flags qui gardent l'accès), secrets, crypto, upload, désérialisation, URL appelées côté serveur |
| `performance` | `kaizen:performance-reviewer` | forme des requêtes base/ORM, complexité algorithmique, transformations lourdes en boucle, fan-out, politique de cache à impact réel |
| `reliability` | `kaizen:reliability-reviewer` | gestion d'erreur, retries, timeouts, jobs en arrière-plan, handlers asynchrones, webhooks, appels à des services externes |
| `api-contract` | `kaizen:api-contract-reviewer` | une frontière **consommée à l'extérieur** : routes et formes de requête/réponse, sérialiseurs, schémas d'événements publiés, versionnage, signature publique d'un package avec appelants avérés |
| `data-migration` | `kaizen:data-migration-reviewer` | fichiers de migration, dumps de schéma, backfills, transformations de données — pas un simple changement de modèle ou de requête sans migration |
| `adversarial` | `kaizen:adversarial-reviewer` | ≥ 50 lignes de code modifiées ; ou auth/paiement ; écritures persistantes ou publication d'événements ; retries, échecs partiels, concurrence ou ordre ; API externes ; ou un mécanisme de vérification qui pourrait passer au vert à tort (CI, gate, mocks d'infra) |

## Bornes

- Revue ciblée : 1 à 3 relecteurs. Revue complète : en général 3 à 7.
- Au-delà de 7, regroupe ou priorise par risque ; dis lesquels ont été laissés de côté et pourquoi.
- Diff purement documentaire : `standards` (et `correctness` si la doc décrit un comportement
  exécutable, des commandes ou une config).
