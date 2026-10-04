# `/kaizen:monitor`

> Savoir si un environnement va bien **selon vos signaux et vos seuils**, et quoi faire sinon.

## En bref

| | |
|---|---|
| **Ce qu'elle fait** | Mesure chaque signal déclaré (health-check HTTP natif, ou toute commande qui affiche un nombre), le compare au seuil du plan livré ou de la config, et propose le retour arrière si un seuil est franchi |
| **Quand l'utiliser** | « La prod va-t-elle bien ? », surveiller un moment sensible, vérifier les signaux d'un plan |
| **Quand ne pas l'utiliser** | Juste après un déploiement : [deploy](deploy.md) surveille déjà |
| **Ce qu'elle produit** | Un relevé par signal (valeur, seuil, source), conservé dans `.kaizen/state/monitor.jsonl` |
| **Et ensuite** | Rien, ou `/kaizen:deploy rollback` puis [postmortem](postmortem.md) |

## Exemples

```text
/kaizen:monitor production
/kaizen:monitor production watch 30
/kaizen:monitor staging plan:docs/plans/2026-10-04-feat-export-csv-plan.md
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

## Bon à savoir

- Une violation n'est retenue qu'après `monitor.consecutive` échantillons de suite hors seuil (2 par
  défaut), toutes les `monitor.interval_seconds` (60 par défaut) : un pic isolé ne déclenche rien.
- Une commande en échec ou une sortie non numérique compte comme rouge : c'est un signal aveugle.
- Rétablir passe avant comprendre : en cas de violation, le retour arrière vient d'abord.

## Voir aussi

[deploy](deploy.md) · [plan](plan.md) · [postmortem](postmortem.md)
