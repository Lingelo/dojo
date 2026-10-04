# `/kaizen:deploy`

> Mettre un commit en production par **vos** commandes de déploiement, avec votre approbation pour la
> production, puis surveiller ses signaux et revenir en arrière si un seuil est franchi.

## En bref

| | |
|---|---|
| **Ce qu'elle fait** | Préconditions (CI verte, checklist des plans livrés, retour arrière prêt, signaux sains) → approbation tapée par vous pour un environnement protégé → déploiement → tag `deploy/<env>/…` → surveillance des signaux → retour arrière si un seuil est franchi |
| **Quand l'utiliser** | Mettre une version ou la branche par défaut en staging ou en production ; revenir en arrière |
| **Quand ne pas l'utiliser** | Ouvrir une PR (→ [ship](ship.md)) ; préparer une version (→ [release](release.md)) |
| **Ce qu'elle produit** | Le commit déployé, un tag git partagé, un relevé des signaux pendant la fenêtre de surveillance ; en cas de problème, un tag `rollback/<env>/…` et la chronologie du post-mortem |
| **Et ensuite** | Rien si tout va bien ; sinon [postmortem](postmortem.md) |

## Exemples

```text
/kaizen:deploy staging
/kaizen:deploy production v2.3.0
/kaizen:deploy rollback production erreurs 5xx après la v2.3.0
/kaizen:deploy flag off export_csv production
```

## Configurer

Kaizen n'impose aucune plateforme : il exécute **vos** commandes, déclarées dans `.kaizen/config.json`.
Pour ne pas les écrire à la main, `deploy detect` reconnaît comment le projet se déploie :

| Reconnu par | Plateforme | Retour arrière proposé |
|---|---|---|
| `vercel.json`, `.vercel/` | Vercel | `vercel rollback` |
| `netlify.toml` | Netlify | redéploiement du commit précédent |
| `fly.toml` (app, health-check) | Fly.io | redéploiement du commit précédent |
| remote `heroku`, `app.json` | Heroku | `heroku rollback` |
| `config/deploy.yml` (+ destinations) | Kamal | `kamal rollback <sha>` |
| `config/deploy.rb` (+ étapes) | Capistrano | `cap <étape> deploy:rollback` |
| `Chart.yaml` (+ `values-<env>.yaml`) | Kubernetes (Helm) | `helm rollback` |
| `kustomization.yaml` (overlays) | Kubernetes (Kustomize) | `kubectl rollout undo` |
| `serverless.yml`, `template.yaml` (SAM), `firebase.json` | Serverless, AWS SAM, Firebase | redéploiement du commit précédent |
| workflow GitHub Actions `workflow_dispatch` | votre pipeline existant | le même workflow sur le commit cible (si un input `ref`) |
| workflow de déploiement sur `push` | déploiement continu | Kaizen suit le run du commit ; retour arrière par revert |
| cibles `deploy*`/`rollback*` du Makefile, scripts npm | vos scripts | `rollback*` s'il existe, sinon redéploiement |
| `docker-compose*.yml`, `*.tf` | Compose, Terraform (confiance faible) | redéploiement / réapplication du commit précédent |

```text
node $K deploy detect              # candidats : commandes, retour arrière, confiance, notes
node $K deploy configure fly       # écrit le candidat choisi (sans écraser un environnement existant)
```

Le **redéploiement du commit précédent** lance la même commande depuis un worktree git du commit
cible, sans toucher à votre copie de travail (shell POSIX : Linux, macOS, Git Bash). Chaque candidat
porte ses limites (`notes`) : jeton requis, image taguée par SHA à vérifier, Terraform à relire… Voir
[Configuration](../configuration.md#deploy--déploiement-et-retour-arrière).

```json
"deploy": {
  "environments": {
    "staging":    { "command": "make deploy ENV=staging", "rollback": "make rollback ENV=staging", "url": "https://staging.shop.example" },
    "production": { "command": "make deploy ENV=production", "rollback": "make rollback ENV=production", "url": "https://shop.example" }
  },
  "watch_minutes": 15
}
```

Les commandes reçoivent `KAIZEN_ENV`, `KAIZEN_REF` et `KAIZEN_SHA`. `production` est protégée par
défaut (`"protected": true` pour en protéger d'autres).

## Comment ça se passe

1. **Préconditions** :
   - commit fusionné, CI verte ;
   - ce qui part depuis le dernier déploiement : commits et plans livrés, avec leur retour arrière et
     leur signal. Un plan sans retour arrière ni signal bloque un déploiement protégé ;
   - retour arrière déclaré ;
   - signaux déjà sains : on ne déploie pas par-dessus un incident.
2. **Approbation** (environnement protégé) : Claude affiche un code, vous tapez vous-même
   `kaizen deploy <code>`. Valable 30 minutes, pour ce commit seulement. Claude ne peut pas approuver
   à votre place, et en mode autonome il n'y a pas de déploiement protégé.
3. **Déploiement** : la commande tourne, puis un tag annoté `deploy/<env>/<horodatage>` est posé sur
   le commit et poussé.
4. **Surveillance** pendant `watch_minutes` (voir [monitor](monitor.md)) : les seuils viennent des
   plans livrés (`` `error_rate` > 1 % `` dans leur section « Déploiement et retour arrière ») et de la
   config.
5. **Seuil franchi** : retour arrière d'abord (automatique si `deploy.auto_rollback`), vérification,
   puis proposition de post-mortem.

## Bon à savoir

- Lancer directement la commande de déploiement d'un environnement protégé est **refusé** par un
  hook : elle contournerait l'approbation, le tag et la surveillance.
- Les tags `deploy/…` et `rollback/…` ne se créent que par Kaizen. Ils alimentent les **vraies**
  métriques DORA de [metrics](metrics.md) (fréquence, délai commit → production, taux d'échec, temps
  de rétablissement) et la chronologie des post-mortems.
- Le retour arrière n'exige pas d'approbation : il rétablit, et c'est urgent.
- `autopilot` ne déploie jamais.

## Voir aussi

[monitor](monitor.md) · [release](release.md) · [postmortem](postmortem.md) · [metrics](metrics.md)
