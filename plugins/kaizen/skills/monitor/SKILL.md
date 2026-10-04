---
name: monitor
description: Vérifie ou surveille les signaux de production déclarés par l'équipe (.kaizen/config.json → monitor.signals : health-check HTTP natif, ou toute commande qui affiche un nombre — Prometheus, Datadog, CloudWatch, logs) contre les seuils de la config et des plans livrés, et dit quoi faire si un seuil est franchi (retour arrière, post-mortem). Lecture seule, sauf retour arrière demandé ou automatique. Trace les incidents (détection datée, résolution) détectés hors de la fenêtre après déploiement : contrôle planifiable (patrol) ou alerte de l'outil de l'équipe. Utiliser pour « est-ce que la prod va bien ? », « surveille la prod 30 minutes », « vérifie les signaux du plan », « mets en place une surveillance continue », « une alerte vient de tomber », /kaizen:monitor [env] [check|watch|patrol|incidents] [minutes].
allowed-tools: Bash(node:*), Bash(git:*), Read, Glob, Grep, AskUserQuestion
argument-hint: "[env] [check | watch [minutes] | patrol | incidents | continu] [plan:<chemin>]"
---

# Monitor — les signaux de production, contre leurs seuils

**Résultat :** l'utilisateur sait si l'environnement va bien **selon les signaux et seuils déclarés**,
et, s'il ne va pas bien, quoi faire maintenant.

Lis `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

## 1. Quoi surveiller

`node "$K" config` → `monitor.signals`. Aucun signal déclaré → n'improvise pas de mesure : explique
comment en déclarer (`${CLAUDE_PLUGIN_ROOT}/docs/configuration.md`, section `monitor`), propose un
health-check HTTP sur l'`url` de l'environnement si elle existe, et arrête.

Seuils : ceux de la config, remplacés par ceux des plans livrés au dernier déploiement de
l'environnement (section rollout, `` `nom` > seuil ``), ou du plan passé en `plan:<chemin>`. Un
signal cité par un plan mais non déclaré (`unknown_plan_signals`) est un trou de surveillance : dis-le.

## 2. Mesurer

- **`check`** (défaut) : `node "$K" monitor check --env <env>` — un échantillon de chaque signal.
- **`watch [minutes]`** : `node "$K" monitor watch --env <env> --minutes <n>` — échantillons réguliers
  (`monitor.interval_seconds`), arrêt à la première violation confirmée (`monitor.consecutive`
  échantillons de suite).
- **`patrol`** : `node "$K" monitor patrol --env <env>` — contrôle confirmé pour une exécution
  planifiée ; une violation ouvre un incident (sans doublon tant qu'il est ouvert), exit 1.
- **`incidents`** : `node "$K" monitor incident list --env <env>` — détection, résolution, durée.

Restitue chaque signal : valeur, seuil, source du seuil (plan ou config), ✅ ou ⛔. Une commande en
échec ou une sortie non numérique n'est pas « vert » : c'est un signal aveugle, à réparer.

## 3. Si un seuil est franchi

1. Le dernier déploiement (`node "$K" deploy list --env <env>`) est-il récent et lié ? Montre-le.
2. Rétablir passe avant comprendre : propose `/kaizen:deploy rollback <env>` (ou le flag à couper
   que prévoit le plan). En mode non interactif, ou si `deploy.auto_rollback` est actif, le retour
   arrière est le défaut prudent ; sinon une question.
3. La violation est un **incident** (`watch` et `patrol` l'ouvrent ; sinon
   `node "$K" monitor incident open --env <env> --summary "…"`, avec `--at` si la détection réelle est
   antérieure). Le retour arrière le résout ; un correctif déployé, ou un rétablissement sans
   déploiement, se trace par `node "$K" monitor incident resolve --env <env>`.
4. Puis `/kaizen:postmortem` : la chronologie (déploiement, détection, retour arrière, résolution) est
   dans `deploy list`, `monitor incident list` et `.kaizen/state/monitor.jsonl`.

## 4. Surveillance continue (`continu`)

Au-delà de la fenêtre après déploiement, aide l'équipe à brancher l'une des deux voies, ou les deux
(détail et exemples : `${CLAUDE_PLUGIN_ROOT}/docs/guides/monitor.md`, « Surveillance continue ») :

- **Contrôle périodique** : `node "$K" monitor patrol --env production` planifié — routine Claude Code
  (`/schedule`), cron, ou workflow CI `schedule` qui pousse les tags (`git push origin 'refs/tags/incident/*'`).
- **Alerte entrante** (voie principale si l'équipe a déjà des alertes) : Alertmanager, PagerDuty ou
  Datadog appellent un point d'entrée — par exemple un workflow GitHub `repository_dispatch` — qui lance
  `node "$K" monitor alert --env production --file <payload>` ; l'heure de détection est celle de
  l'alerte, sa résolution ferme l'incident.

Ne crée aucun fichier de workflow ni de routine sans l'accord de l'utilisateur.

## Rapport

```
MONITOR — <env> · <date> · <check | watch n min>
✅ health 200 · ✅ error_rate 0.002 (≤ 0.01, plan) · ⛔ p95_ms 1240 (> 800, config)
Incident : <aucun | ouvert depuis <heure> (source) | résolu>
Ensuite : <rien | retour arrière proposé | déclarer un signal manquant | brancher la surveillance continue>
```
