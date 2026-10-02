---
title: Export CSV des commandes - Plan
type: feat
date: 2026-10-02
topic: export-csv-commandes
artifact: kaizen-plan/v1
source: brainstorm
jira: SHOP-412
---

# Export CSV des commandes - Plan

<!-- kaizen:goal -->
## Capsule d'objectif

**Objectif :** un responsable boutique récupère en un clic, depuis la liste des commandes, un fichier
qu'il ouvre directement dans Excel avec les commandes qu'il voit à l'écran.
**Autorité produit :** périmètre tranché par l'utilisateur en session (2026-10-02).
**Bloquants ouverts :** aucun.

<!-- kaizen:product -->
## Contrat produit

### Résumé
Un bouton « Exporter » sur la liste des commandes télécharge un CSV des commandes correspondant aux
filtres actifs, lisible tel quel dans Excel.

### Exigences

**Contenu**
- R1. L'export contient exactement les commandes correspondant aux filtres actifs de la liste.
- R2. Une ligne par commande : numéro, date, client, statut, total TTC, nombre d'articles.
- R3. Les accents et caractères spéciaux s'affichent correctement à l'ouverture dans Excel.

**Accès et volume**
- R4. Seuls les utilisateurs ayant le droit de voir les commandes peuvent exporter.
- R5. Au-delà de 10 000 commandes, l'export est refusé avec un message invitant à affiner les filtres.

### Décisions clés
- **Synchrone, plafonné à 10 000 lignes** — couvre le besoin observé sans file de jobs. Régit R5.
  (décidé en session : choisi plutôt qu'un export asynchrone par e-mail — trop lourd pour le volume actuel)

### Exemples d'acceptation
- AE1. (couvre R1) Étant donné un filtre « statut = expédiée », quand j'exporte, alors le fichier ne
  contient que des commandes expédiées.
- AE2. (couvre R3) Étant donné un client « Hélène Müller », quand j'ouvre le fichier dans Excel, alors
  le nom s'affiche « Hélène Müller ».
- AE3. (couvre R5) Étant donné 10 001 commandes filtrées, quand j'exporte, alors je vois « Trop de
  commandes (10 001) : affinez les filtres (max 10 000) » et aucun fichier n'est produit.

### Hors périmètre
- Plus tard : export planifié, choix des colonnes, format XLSX.

<!-- kaizen:planning -->
## Contrat de planification

### Décisions techniques clés
- KTD1. Générer le CSV en flux (`send_stream`) plutôt qu'en mémoire — les exports de 10 000 lignes
  restent sous 5 Mo de RAM. Alternative écartée : chaîne complète en mémoire. Couvre R5.
- KTD2. Réutiliser la requête filtrée de `OrdersQuery` utilisée par la liste — garantit R1 par
  construction. Couvre R1.

### Contexte et motifs à suivre
- `app/exports/customers_csv.rb` — export existant à imiter (en-têtes, formatage des montants).
- `app/queries/orders_query.rb` — filtres de la liste, à réutiliser tels quels.

### Leçons et règles appliquées
- `docs/solutions/runtime-errors/export-csv-accents-excel.md` — Excel exige un BOM UTF-8 : sans lui,
  R3 échoue. → BOM en tête de flux, testé par AE2.
- (pack: house-rules, csv-exports.md) — séparateur `;` pour les locales FR. → appliqué.

### Risques
- Requête lente sur 10 000 commandes avec jointures client → `includes(:customer)` (évite un N+1).

<!-- kaizen:constitution -->
## Contrôle constitutionnel

| Article | Verdict | Justification / preuve |
|---|---|---|
| I. Preuve d'abord | ✅ | U1–U3 en test d'abord |
| II. Simplicité | ✅ | export synchrone plafonné, pas de file de jobs (KTD1) |
| III. Petits lots | ✅ | une tranche, ~250 lignes estimées |
| IV. Sécurité par défaut | ✅ | même garde d'autorisation que la liste (U2), voir Menaces |
| V. Autonomie des agents | ✅ | aucune migration ni dépendance ajoutée |

<!-- kaizen:threats -->
## Menaces

- **Divulgation** · données clients exportées · un utilisateur sans droit appelle l'URL d'export
  directement → `authorize_orders!` sur l'endpoint, test 403 (U2).
- **Déni de service** · base de données · exports répétés de gros volumes → plafond 10 000 (R5) et
  génération en flux (KTD1).

<!-- kaizen:rollout -->
## Déploiement et retour arrière

- **Exposition** : directe (bouton visible des seuls rôles autorisés), pas de flag — fonctionnalité
  en lecture seule.
- **Ordre** : aucune migration.
- **Retour arrière** : revert de la PR ; rien d'irréversible (aucune écriture).
- **Signal** : taux d'erreur 5xx de `Orders::ExportsController` et durée p95 ; > 1 % d'erreurs ou
  p95 > 10 s → revert.

<!-- kaizen:units -->
## Unités d'implémentation

### U1. Sérialiseur CSV des commandes
- **Objectif :** transformer une relation de commandes en lignes CSV (R2, R3).
- **Couvre :** R2, R3, AE2
- **Dépend de :** —
- **Fichiers :** `app/exports/orders_csv.rb` (nouveau), `spec/exports/orders_csv_spec.rb` (nouveau)
- **Approche :** suit `app/exports/customers_csv.rb` ; BOM `﻿` en premier ; séparateur `;`.
- **Preuve :** test d'abord.
- **Scénarios de test :** colonnes et ordre ; total formaté ; nom accentué (AE2, octets du BOM) ;
  commande sans articles.
- **Vérification :** `bundle exec rspec spec/exports/orders_csv_spec.rb`
- **Tranche :** T1

### U2. Endpoint d'export avec filtres, droits et plafond
- **Objectif :** exposer l'export filtré, autorisé et plafonné (R1, R4, R5).
- **Couvre :** R1, R4, R5, AE1, AE3
- **Dépend de :** U1
- **Fichiers :** `app/controllers/orders/exports_controller.rb` (nouveau), `config/routes.rb`,
  `spec/requests/orders/exports_spec.rb` (nouveau)
- **Approche :** même `before_action :authorize_orders!` que `OrdersController` ; `OrdersQuery` ;
  comptage avant génération ; flux via KTD1.
- **Preuve :** test d'abord (spec de requête).
- **Scénarios de test :** filtre statut (AE1) ; utilisateur sans droit → 403 ; 10 001 commandes → 422
  avec message (AE3) ; en-têtes `Content-Type` et `Content-Disposition`.
- **Vérification :** `bundle exec rspec spec/requests/orders/exports_spec.rb`
- **Tranche :** T1

### U3. Bouton « Exporter » sur la liste
- **Objectif :** déclencher l'export avec les filtres courants.
- **Couvre :** R1
- **Dépend de :** U2
- **Fichiers :** `app/views/orders/index.html.erb`, `spec/system/orders_export_spec.rb` (nouveau)
- **Approche :** lien qui reprend `request.query_parameters`.
- **Preuve :** test système.
- **Vérification :** `bundle exec rspec spec/system/orders_export_spec.rb`
- **Tranche :** T1

<!-- kaizen:verification -->
## Contrat de vérification
- `bundle exec rspec` · `bundle exec rubocop`
- AE2 vérifié aussi à la main une fois : ouverture du fichier dans Excel.

<!-- kaizen:done -->
## Définition de terminé
- U1–U3 livrées, chacune avec sa preuve.
- R1–R5 et AE1–AE3 couverts par des tests verts.
- `/kaizen:review` sans P0/P1 ouvert ; diff sous `pr.max_lines` (`node "$K" size`).
- Leçon capitalisée si l'implémentation a révélé un piège non documenté.
