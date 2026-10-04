---
name: monitor
description: Vérifie ou surveille les signaux de production déclarés par l'équipe (.kaizen/config.json → monitor.signals : health-check HTTP natif, ou toute commande qui affiche un nombre — Prometheus, Datadog, CloudWatch, logs) contre les seuils de la config et des plans livrés, et dit quoi faire si un seuil est franchi (retour arrière, post-mortem). Lecture seule, sauf retour arrière demandé ou automatique. Utiliser pour « est-ce que la prod va bien ? », « surveille la prod 30 minutes », « vérifie les signaux du plan », /kaizen:monitor [env] [check|watch] [minutes].
allowed-tools: Bash(node:*), Bash(git:*), Read, Glob, Grep, AskUserQuestion
argument-hint: "[env] [check | watch [minutes]] [plan:<chemin>]"
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

Restitue chaque signal : valeur, seuil, source du seuil (plan ou config), ✅ ou ⛔. Une commande en
échec ou une sortie non numérique n'est pas « vert » : c'est un signal aveugle, à réparer.

## 3. Si un seuil est franchi

1. Le dernier déploiement (`node "$K" deploy list --env <env>`) est-il récent et lié ? Montre-le.
2. Rétablir passe avant comprendre : propose `/kaizen:deploy rollback <env>` (ou le flag à couper
   que prévoit le plan). En mode non interactif, ou si `deploy.auto_rollback` est actif, le retour
   arrière est le défaut prudent ; sinon une question.
3. Puis `/kaizen:postmortem` : la chronologie (déploiement, détection, retour arrière) est dans
   `deploy list` et `.kaizen/state/monitor.jsonl`.

## Rapport

```
MONITOR — <env> · <date> · <check | watch n min>
✅ health 200 · ✅ error_rate 0.002 (≤ 0.01, plan) · ⛔ p95_ms 1240 (> 800, config)
Ensuite : <rien | retour arrière proposé | déclarer un signal manquant>
```
