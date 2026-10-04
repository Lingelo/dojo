# `/kaizen:help`

> Savoir ce qu'est Kaizen et **quelle commande lancer maintenant**, d'après votre situation et l'état
> réel du repo.

## En bref

| | |
|---|---|
| **Ce qu'elle fait** | Diagnostique le repo (`node $K status`), explique Kaizen, et recommande la commande adaptée avec son invocation exacte |
| **Quand l'utiliser** | « Par où commencer ? », « quelle commande pour… ? », « où en suis-je ? », « c'est quoi le garde-fou ? » |
| **Quand ne pas l'utiliser** | Vous savez déjà quelle commande lancer : lancez-la directement |
| **Ce qu'elle produit** | Une réponse dans la conversation. Aucune écriture, aucune commande lancée à votre place |
| **Et ensuite** | La commande recommandée |

## Exemples

```text
/kaizen:help                                  # présentation + où en est le repo + quoi faire ensuite
/kaizen:help j'ai un bug d'arrondi sur les totaux
/kaizen:help je veux livrer ma branche
/kaizen:help c'est quoi le garde-fou de push ?
```

## Le diagnostic

`node $K status` (ou `--json`) résume l'état du repo dans la boucle et en déduit l'étape suivante :

```text
Kaizen — feat/SHOP-12-export (+3 commit(s))
  ✔ initialisé · profil lean
  ✔ constitution v1.1.0
  · 4 plan(s) — dernier : docs/plans/2026-10-04-feat-export-plan.md (implementation-ready) · 7 leçon(s)
  ✘ push : aucune revue enregistrée pour cette branche

Ensuite :
  → /kaizen:review — branche feat/SHOP-12-export : changements pas encore relus
```

Ordre de la déduction :
1. Kaizen non initialisé → `setup`.
2. Pas de constitution → `constitution`.
3. Travail en cours sous garde-fou → reprendre `work`.
4. Branche avec des changements :
   - renonciation en attente → la confirmer ;
   - pas relue → `review` ;
   - relue et commitée → `ship`.
5. Exigences sans plan → `plan`. Plan prêt → `work`.
6. Sinon → `brainstorm` (ou `ideate`, `debug`).

## Voir aussi

[README du plugin](../../README.md) · [Démarrage](../demarrage.md) · [Dépannage](../depannage.md)
