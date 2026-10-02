# `/kaizen:postmortem`

> Apprendre d'un incident sans chercher de coupable, et refermer la boucle : leçon, règle de pack,
> amendement de la constitution, test de non-régression.

« Erreur humaine » est le début de l'analyse (qu'est-ce qui a rendu l'erreur facile et invisible ?),
jamais sa conclusion. Un post-mortem vaut par ses **actions suivies**, pas par sa prose.

## En bref

| | |
|---|---|
| **Ce qu'elle fait** | Rassemble les faits (git, CI, déploiements, PR, logs fournis), reconstitue la chronologie et l'impact, analyse les facteurs contributifs, fixe les actions et leurs porteurs, referme la boucle Kaizen |
| **Quand l'utiliser** | Après un incident de production, une régression livrée, ou un incident évité de justesse |
| **Quand ne pas l'utiliser** | Pour corriger le bug en cours (→ [debug](debug.md) ; `postmortem` l'appelle en diagnostic si la cause n'est pas encore établie) |
| **Ce qu'elle produit** | `docs/postmortems/AAAA-MM-JJ-<titre>.md`, et en général une leçon, un test, voire une proposition d'amendement |
| **Et ensuite** | Les actions sont suivies dans votre outil de tickets ; le temps de rétablissement alimente `/kaizen:metrics` |

## Exemples

```text
/kaizen:postmortem panne des exports CSV du 3 novembre, ~2 h, tous les responsables boutique
/kaizen:postmortem #512
/kaizen:postmortem quasi-incident migration de la table orders
```

## Comment ça se passe

1. **Les faits d'abord** :
   - votre récit ;
   - `git log` de la branche par défaut sur la fenêtre de l'incident, runs de CI (`gh run list`), PR
     mergées, releases ;
   - les logs fournis.

   Claude vous pose ensuite les questions manquantes, une à la fois : début **réel** (souvent avant
   la détection), qui a détecté et comment, ce qui a été tenté.
2. **Chronologie (UTC)**, chaque ligne sourcée : début réel, détection, atténuation, résolution.
   L'écart entre le début et la détection est souvent le vrai sujet.
3. **Facteurs contributifs**, au pluriel :
   - le changement fautif ;
   - ce qui aurait dû l'arrêter (test, revue, contrôle du plan, article de la constitution) ;
   - ce qui a retardé la détection (alerte absente, signal du plan non surveillé) ;
   - ce qui a ralenti le retour arrière ;
   - l'organisation.
4. **Déjà vu ?** : une leçon existante qui n'a pas empêché la récidive est un constat majeur.
5. **Actions** : 3 à 7, chacune avec un type, un porteur, une échéance et un suivi. Une action sans
   porteur n'existe pas.
6. **Boucle Kaizen** :
   - leçon avec `/kaizen:compound` ;
   - test de non-régression ;
   - règle de pack ;
   - `/kaizen:constitution amend` si un principe manquait ou a été contourné.

## Le document

Le frontmatter (`severity`, `detected`, `resolved`, `services`) alimente `/kaizen:metrics` : le temps
de rétablissement va de `detected` à `resolved`. Sections : Résumé · Impact · Chronologie · Facteurs
contributifs · Ce qui a bien marché · Ce qui a manqué de peu · Actions · Boucle Kaizen. Gabarit :
[`templates/postmortem.md`](../../templates/postmortem.md).

## Bon à savoir

- Les logs d'incident regorgent de données sensibles : seuls des extraits assainis (`<REDACTED>`)
  sont autorisés, jamais d'identifiant client, de jeton ni d'e-mail.
- Réserver le fichier : `node $K postmortem new --title "…"`.

## Voir aussi

[debug](debug.md) · [compound](compound.md) · [constitution](constitution.md) · [metrics](metrics.md)
