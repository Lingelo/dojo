# `/kaizen:monitor`

> Savoir si un environnement va bien **selon vos signaux et vos seuils**, et quoi faire sinon.

## En bref

| | |
|---|---|
| **Ce qu'elle fait** | Mesure chaque signal déclaré (health-check HTTP natif, ou toute commande qui affiche un nombre), le compare au seuil du plan livré ou de la config, et propose le retour arrière si un seuil est franchi |
| **Quand l'utiliser** | « La prod va-t-elle bien ? », surveiller un moment sensible, vérifier les signaux d'un plan |
| **Quand ne pas l'utiliser** | Juste après un déploiement : [deploy](deploy.md) surveille déjà |
| **Ce qu'elle produit** | Un relevé par signal (valeur, seuil, source), conservé dans `.kaizen/state/monitor.jsonl` ; en cas de violation, un incident daté (tag `incident/<env>/…`) |
| **Et ensuite** | Rien, ou `/kaizen:deploy rollback` puis [postmortem](postmortem.md) |

## Exemples

```text
/kaizen:monitor production
/kaizen:monitor production watch 30
/kaizen:monitor staging plan:docs/plans/2026-10-04-feat-export-csv-plan.md
/kaizen:monitor production incidents
/kaizen:monitor production continu
```

## Déclarer des signaux

Dans `.kaizen/config.json`, voir [Configuration](../configuration.md#monitor--signaux-de-production) :

```json
"monitor": {
  "signals": {
    "health":     { "type": "http", "url": "https://shop.example/health", "expect": 200 },
    "error_rate": { "command": "curl -s 'http://prometheus:9090/api/v1/query?query=…' | jq -r '.data.result[0].value[1]'", "max": 0.01 },
    "p95_ms":     { "command": "./scripts/p95.sh {env}", "max": 800 }
  }
}
```

- `type: "http"` : disponibilité, sans aucun outil.
- `command` : n'importe quelle source (Prometheus, Datadog, CloudWatch, une requête SQL, un `grep` sur
  des logs). Le dernier mot de la sortie doit être un nombre.
- `max` / `min` : seuils. `{env}` est remplacé par l'environnement.

## Seuils du plan

La section « Déploiement et retour arrière » d'un plan cite le signal par son nom :

```markdown
- **Signal** : `error_rate` > 1 % ou `p95_ms` > 1000 → retour arrière
```

Ce seuil l'emporte sur celui de la config pendant la surveillance du déploiement qui livre ce plan.
Un signal cité par un plan mais non déclaré est signalé : c'est un trou de surveillance.

## Incidents

Une violation confirmée par `watch` (après déploiement) ou `patrol` (contrôle planifié), ou une alerte
reçue par `monitor alert`, ouvre un **incident** : un tag `incident/<env>/<détection>` sur le commit
déployé. Un retour arrière le résout ; sinon `monitor incident resolve`. Tant qu'il est ouvert, une
nouvelle violation n'en crée pas un second.

```bash
node "$K" monitor incident list --env production                 # détection, résolution, durée
node "$K" monitor incident open --env production --at 2026-10-04T08:12:00Z --summary "lenteurs paiement"
node "$K" monitor incident resolve --env production
```

La détection datée alimente la chronologie de [postmortem](postmortem.md) et le DORA de
[metrics](metrics.md) : un incident avant le déploiement suivant compte comme un échec, et le temps de
rétablissement court de la détection à la résolution (ou au retour arrière).

## Surveillance continue

La surveillance de [deploy](deploy.md) dure `deploy.watch_minutes`. Pour qu'un incident survenu trois
jours plus tard soit détecté sans action manuelle, branchez l'une des deux voies, ou les deux : les
alertes comme voie principale, le contrôle périodique comme filet.

Les deux workflows ci-dessous se génèrent avec `node "$K" audit fix monitor_patrol` et
`audit fix monitor_alert` (`--env production`, `--ref <sha du dépôt Kaizen>` pour l'épingler).

### Contrôle périodique : `monitor patrol`

`patrol` mesure les signaux ; un signal rouge est re-mesuré jusqu'à `monitor.consecutive` échantillons
avant d'ouvrir un incident. Exit 1 en cas de violation : le planificateur le signale.

- **Routine Claude Code** : `/schedule` toutes les 30 minutes avec « lance `/kaizen:monitor production
  patrol` ; en cas de violation, propose le retour arrière puis `/kaizen:postmortem` ».
- **Workflow CI planifié** (tags partagés, sans machine allumée) :

```yaml
# .github/workflows/kaizen-patrol.yml
on:
  schedule: [{ cron: '*/30 * * * *' }]
permissions: { contents: write }          # pousser le tag d'incident
jobs:
  patrol:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }           # tags deploy/… et incident/… compris
      - run: node path/to/kaizen/scripts/kaizen.mjs monitor patrol --env production
```

### Alerte entrante : `monitor alert`

Les alertes que l'équipe a déjà (Prometheus Alertmanager, PagerDuty, Datadog…) appellent un point
d'entrée qui transmet la charge utile à `monitor alert`. Formats reconnus :

| Outil | Ouverture | Résolution | Heure retenue |
|---|---|---|---|
| Alertmanager | `status: firing` | `status: resolved` | `startsAt` / `endsAt` |
| PagerDuty (webhooks v3) | `incident.triggered` | `incident.resolved` | `occurred_at` |
| Datadog (gabarit de webhook) | `alert_transition: Triggered` | `Recovered` | `date` |
| JSON simple | `{"status": "firing", "summary": "…", "at": "…"}` | `"status": "resolved"` | `at` |

Exemple de point d'entrée sans serveur : un workflow `repository_dispatch` que l'outil d'alerte (ou un
petit relais) appelle par l'API GitHub.

```yaml
# .github/workflows/kaizen-alert.yml
on:
  repository_dispatch: { types: [alert] }
permissions: { contents: write }
jobs:
  alert:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      # Charge utile passée par l'environnement, jamais interpolée dans le script : pas d'injection.
      - env: { PAYLOAD: '${{ toJson(github.event.client_payload) }}' }
        run: printf '%s' "$PAYLOAD" | node path/to/kaizen/scripts/kaizen.mjs monitor alert --env production --file -
```

`--env` l'emporte sur le label `env`/`environment` de l'alerte. L'heure de détection est celle de
l'alerte, pas celle de la réception.

## Bon à savoir

- Une violation n'est retenue qu'après `monitor.consecutive` échantillons de suite hors seuil (2 par
  défaut), toutes les `monitor.interval_seconds` (60 par défaut) : un pic isolé ne déclenche rien.
- Une commande en échec ou une sortie non numérique compte comme rouge : c'est un signal aveugle.
- Rétablir passe avant comprendre : en cas de violation, le retour arrière vient d'abord.

## Voir aussi

[deploy](deploy.md) · [plan](plan.md) · [postmortem](postmortem.md)
