---
name: release
description: Prépare une version — commits conventionnels depuis le dernier tag regroupés en notes de version lisibles (nouveautés, corrections, changements cassants avec migration), version SemVer proposée, entrée de CHANGELOG, et checklist de mise en production (vérifications, migrations, flags, retour arrière, communication). Ne tague ni ne publie sans accord explicite. Utiliser pour « prépare la release », « notes de version », « changelog », « quelle version ? », /kaizen:release.
allowed-tools: Bash(node:*), Bash(git:*), Bash(gh:*), Read, Write, Edit, Glob, Grep, AskUserQuestion
argument-hint: "[--from <tag>] [version forcée] [publish]"
---

# Release — des notes que les utilisateurs lisent, une version qui dit la vérité

Lis `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

**Jamais** de tag, de push de tag, de publication de release ni de déploiement sans accord explicite
dans la session (la politique IA de la constitution peut être plus stricte : elle prime).

## 1. Collecter

`node "$K" release notes [--from <tag>]` → commits groupés, changements cassants, niveau et version
proposée (SemVer ; en 0.x un changement cassant monte le mineur). Commits non conventionnels :
signale leur nombre et classe-les toi-même en lisant leur diff.

## 2. Vérifier la version

- Un changement cassant (`!` ou `BREAKING CHANGE:`) → majeure. Vérifie qu'il l'est vraiment (interface
  publique, format de données, configuration) et qu'**aucun** changement cassant ne se cache dans un
  `feat`/`fix` (lis les diffs des interfaces publiques : routes, schémas, exports de package).
- Fichiers de version du projet (`package.json`, `pyproject.toml`, `Cargo.toml`, `version.rb`,
  `.claude-plugin/plugin.json`…) : la version proposée les dépasse-t-elle ?

## 3. Rédiger

Notes pour **les utilisateurs**, pas pour les développeurs : ce qui change pour eux, en une phrase par
point, regroupé (Nouveautés, Corrections, Performances, Changements cassants). Chaque changement
cassant a sa **migration** (avant → après, étapes). Liens vers PR et plans (`docs/plans/…`) quand
ils éclairent. Supprime le bruit (chore, ci, tests, refactors invisibles).

Mets à jour `CHANGELOG.md` (format Keep a Changelog : `## [x.y.z] - YYYY-MM-DD`) s'il existe ou si
l'utilisateur le veut, et la version du manifeste (`package.json`…) : **dans l'arbre de travail,
sans commiter**, y compris sur la branche par défaut — c'est relisible et se défait d'un
`git checkout`. Le commit de release, le tag et la publication restent à l'étape 5, sur accord.

## 4. Checklist de mise en production

Depuis `rollout` de `node "$K" release notes --json` (plans cités par les commits ou modifiés dans la
plage, section `kaizen:rollout` déjà extraite) et le diff. Un plan avec `missing` non vide (pas de
retour arrière, pas de signal, pas de section) est un **point bloquant de la checklist** : demande le
retour arrière et le signal avant de publier, ne les invente pas.
- `node "$K" verify` vert sur le commit à taguer ; CI verte (`gh run list --branch <défaut> --limit 5`) ;
- migrations à jouer et dans quel ordre (expand → migrate → contract) ;
- feature flags à basculer, et leur défaut ;
- retour arrière de la version et ce qui est irréversible ;
- signaux à surveiller après la mise en production, **avec leur seuil** et l'action quand il est
  franchi ; un seuil franchi après la mise en production → retour arrière, puis `/kaizen:postmortem`
  (c'est ainsi que la production revient dans la boucle) ;
- communication (utilisateurs, support) pour les changements visibles.

## 5. Publier (seulement sur accord)

Avec `publish` et confirmation : mise à jour des fichiers de version, commit
`chore(release): vX.Y.Z`, tag annoté `vX.Y.Z`, push du commit et du tag, `gh release create vX.Y.Z
--notes-file <notes>`. Sinon, livre les notes, la version et la checklist, et indique les commandes.
