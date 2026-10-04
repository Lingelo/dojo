---
name: metrics
description: Mesure la santé de la livraison et de la boucle Kaizen — indicateurs DORA approchés depuis git et GitHub (fréquence de livraison, délai de changement, taux de reprise, taux d'échec des changements, temps de rétablissement), taille des lots, et effet cumulatif (leçons créées et réutilisées par les plans, exceptions à la constitution) — puis les interprète avec 1 à 3 actions. Utiliser pour « où en est-on », « nos métriques DORA », « est-ce que kaizen sert à quelque chose », rétrospective, /kaizen:metrics [fenêtre].
allowed-tools: Bash(node:*), Bash(git:*), Bash(gh:*), Read, Write, Glob
argument-hint: "[fenêtre : 30d | 12w | 6m — défaut 90d] [comparer]"
---

# Metrics — est-ce qu'on s'améliore vraiment ?

Kaizen promet que chaque cycle rend le suivant plus facile. Cette skill le **vérifie**. DORA 2025 :
l'IA augmente le débit **et** l'instabilité ; seules les équipes qui gardent de petits lots et un
retour d'expérience transforment l'un sans payer l'autre.

Lis `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

## 1. Mesurer

`node "$K" metrics --since <fenêtre>` (ajoute `--no-github` si `gh` n'est pas authentifié). Avec
`comparer`, lance aussi la fenêtre précédente de même durée — le CLI mesure depuis aujourd'hui, donc
calcule la précédente en lisant deux fenêtres (ex. `--since 180d` et `--since 90d`) et en déduisant
la première moitié ; dis que c'est une approximation.

## 2. Lire honnêtement

Chaque indicateur a sa **méthode** dans la sortie : restitue-la. Ce sont des approximations depuis la
branche par défaut, pas une mesure du système de déploiement. Signale les limites visibles :
historique superficiel (clone `--depth`), merges squash sans accès GitHub (délai indisponible),
fenêtre trop courte (moins de 10 changements → tendances non significatives).

| Indicateur | Lecture |
|---|---|
| Fréquence de livraison | plus haute et régulière = petits lots qui s'intègrent vite |
| Délai de changement | médiane ouverture → merge ; un délai long vient souvent de la revue (DORA 2025) |
| Taux de reprise | part des changements qui corrigent ; en hausse = on livre des défauts |
| Taux d'échec des changements | changements suivis d'un correctif sous 7 jours sur les mêmes fichiers |
| Temps de rétablissement | depuis les incidents tracés (`monitor`, détection → résolution) quand il y a des déploiements réels, sinon depuis les post-mortems (`detected` → `resolved`) |
| Taille des lots | médiane et part au-dessus de `pr.max_lines` — le premier levier selon DORA |
| Boucle Kaizen | leçons nouvelles, **lues** (citées par un plan récent), **appliquées** (citées par un commit), jamais citées, exceptions à la constitution |
| Coût des cycles | `cycle_cost` : cycles work/autopilot clos, durée et tokens médians (session principale + sous-agents), part des sous-agents (`subagent_share`), tokens par rôle (`tokens_by_role`), part des cycles où le garde-fou a bloqué — local à la machine |

**Réutilisation des leçons** : c'est l'indicateur propre à Kaizen. Des leçons écrites mais jamais
citées par un plan = la boucle ne se referme pas (leçons introuvables, mal étiquetées, ou
`learnings-researcher` non lancé) → `/kaizen:prune-learnings` (en commençant par
`learnings_never_cited_sample`) et vérifier la trouvabilité depuis `CLAUDE.md`.

**Coût** : mets-le en regard du gain. Des cycles longs ou chers avec un taux d'échec qui ne baisse pas
→ la cérémonie ne rapporte pas : propose le profil `lean`. Un garde-fou qui bloque dans la plupart des
cycles → vérifications trop lentes ou instables (`gate.targeted`), ou unités trop grosses. Lis
`tokens_by_role` avec la politique de modèles (`node "$K" models`) : un rôle qui pèse lourd sur un modèle
fort est le premier levier d'économie (profil `lean` ou `models.roles`). Dis que la mesure est locale,
et qu'un rôle `inconnu` désigne des sous-agents lancés sans être rapprochés de leur lancement.

## 3. Conclure

Rapport court (≤ 30 lignes) : tableau des valeurs, 2 à 3 constats, et **1 à 3 actions** concrètes
reliées à une skill (« 62 % des PR dépassent 400 lignes → découper en tranches dans /kaizen:plan,
`size` bloquant dans ship » ; « 0 leçon citée sur 14 → prune-learnings + étiquettes »). Pas de jugement
« bon/mauvais » sans référence : compare à la fenêtre précédente quand c'est possible.

Propose d'enregistrer le rapport dans `<root>/metrics/YYYY-MM-DD.md` pour suivre la tendance (une
ligne de frontmatter `date`, `since` ; pas de données personnelles).
