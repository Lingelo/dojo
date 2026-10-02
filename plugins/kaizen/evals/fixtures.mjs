// Projet de démonstration partagé par les évaluations : une petite boutique (commandes, totaux),
// en JavaScript sans dépendance, testée avec node:test.

export const CONSTITUTION = `---
name: Boutique
version: 1.0.0
ratified: 2026-09-01
last_amended: 2026-09-01
artifact: kaizen-constitution/v1
---
# Constitution

## Articles

### I. Preuve d'abord — NON NÉGOCIABLE
Tout changement de comportement arrive avec un test qui échouait avant.
**Contrôle :** chaque unité a-t-elle une stratégie de preuve test d'abord ?

### II. Simplicité
Pas de dépendance ni de mécanisme non demandé.
**Contrôle :** aucune dépendance ajoutée sans justification ?

### III. Petits lots
Un changement tient dans une PR relisible.
**Contrôle :** le diff reste-t-il sous le plafond de taille ?

## Politique IA

### IV. Autonomie des agents
Les agents ne mergent jamais, ne poussent pas de force et ne publient pas de version seuls.
**Contrôle :** aucune action réservée faite seule ?
`;

export const SHOP = {
  'package.json': { name: 'boutique', version: '1.0.0', type: 'module', scripts: { test: 'node --test' } },
  'src/orders.js': `export const orders = [];

export function addOrder({ customer, items, status = 'nouvelle' }) {
  const order = { id: orders.length + 1, customer, items, status, date: '2026-09-15' };
  orders.push(order);
  return order;
}

// Total TTC en centimes : prix unitaire (centimes) × quantité, TVA 20 %.
export function totalCents(order) {
  const ht = order.items.reduce((sum, it) => sum + it.priceCents * it.qty, 0);
  return Math.round(ht * 1.2);
}

export function byStatus(status) {
  return orders.filter((o) => o.status === status);
}
`,
  'src/orders.test.js': `import test from 'node:test';
import assert from 'node:assert/strict';
import { addOrder, totalCents, byStatus } from './orders.js';

test('total TTC', () => {
  const o = addOrder({ customer: 'Ana', items: [{ priceCents: 1000, qty: 2 }] });
  assert.equal(totalCents(o), 2400);
});

test('filtre par statut', () => {
  addOrder({ customer: 'Bo', items: [], status: 'expédiée' });
  assert.equal(byStatus('expédiée').length, 1);
});
`,
  'CONSTITUTION.md': CONSTITUTION,
  '.gitignore': 'node_modules\n.kaizen/runs\n',
};

// Plan prêt à exécuter (passe `plan check`) : export CSV des commandes, version bibliothèque.
export const CSV_PLAN = `---
title: Export CSV des commandes - Plan
type: feat
date: 2026-10-02
topic: export-csv-commandes
artifact: kaizen-plan/v1
source: brainstorm
---

# Export CSV des commandes - Plan

<!-- kaizen:goal -->
## Capsule d'objectif

**Objectif :** produire, à partir d'une liste de commandes, un texte CSV qu'Excel ouvre correctement.
**Autorité produit :** périmètre tranché par l'utilisateur (2026-10-02).
**Bloquants ouverts :** aucun.

<!-- kaizen:product -->
## Contrat produit

### Résumé
Une fonction \`ordersToCsv(orders)\` renvoie le CSV des commandes données.

### Exigences
- R1. Une ligne d'en-tête puis une ligne par commande : id, date, client, statut, total TTC en euros.
- R2. Les accents s'affichent correctement dans Excel (BOM UTF-8, séparateur \`;\`).
- R3. Au-delà de 10 000 commandes, la fonction lève une erreur « Trop de commandes (N) : max 10 000 ».

### Exemples d'acceptation
- AE1. (couvre R1) Étant donné une commande de 2 articles à 10,00 €, quand j'exporte, alors la ligne contient \`24,00\`.
- AE2. (couvre R2) Étant donné le client « Hélène Müller », quand j'exporte, alors le texte commence par le BOM et contient « Hélène Müller ».
- AE3. (couvre R3) Étant donné 10 001 commandes, quand j'exporte, alors une erreur mentionne « 10 001 ».

### Hors périmètre
- Endpoint HTTP, bouton, choix des colonnes.

<!-- kaizen:planning -->
## Contrat de planification

### Décisions techniques clés
- KTD1. Fonction pure dans \`src/csv.js\`, sans dépendance ; réutilise \`totalCents\`. Couvre R1.

### Contexte et motifs à suivre
- \`src/orders.js\` — \`totalCents\` donne le total TTC en centimes.

### Risques
- Champs contenant \`;\` ou des guillemets → échappement CSV standard (guillemets doublés).

<!-- kaizen:constitution -->
## Contrôle constitutionnel

| Article | Verdict | Justification / preuve |
|---|---|---|
| I. Preuve d'abord | ✅ | U1–U2 en test d'abord |
| II. Simplicité | ✅ | fonction pure, aucune dépendance |
| III. Petits lots | ✅ | ~80 lignes |
| IV. Autonomie des agents | ✅ | rien de réservé |

<!-- kaizen:threats -->
## Menaces

- **Injection de formule** · fichier ouvert dans Excel · un nom commençant par \`=\` → préfixer d'une apostrophe (U1).

<!-- kaizen:rollout -->
## Déploiement et retour arrière

- **Exposition** : bibliothèque interne, aucun appelant encore.
- **Retour arrière** : revert du commit.

<!-- kaizen:units -->
## Unités d'implémentation

### U1. Sérialiseur CSV
- **Objectif :** transformer des commandes en CSV (R1, R2).
- **Couvre :** R1, R2, AE1, AE2
- **Dépend de :** —
- **Fichiers :** \`src/csv.js\` (nouveau), \`src/csv.test.js\` (nouveau)
- **Approche :** BOM, séparateur \`;\`, montant avec virgule décimale, échappement.
- **Preuve :** test d'abord.
- **Scénarios de test :** en-tête ; total \`24,00\` (AE1) ; BOM et accents (AE2) ; champ avec \`;\`.
- **Vérification :** \`node --test src/csv.test.js\`
- **Tranche :** T1

### U2. Plafond de volume
- **Objectif :** refuser les exports trop gros (R3).
- **Couvre :** R3, AE3
- **Dépend de :** U1
- **Fichiers :** \`src/csv.js\`, \`src/csv.test.js\`
- **Approche :** vérifier la longueur avant de sérialiser.
- **Preuve :** test d'abord.
- **Scénarios de test :** 10 000 passe ; 10 001 lève l'erreur (AE3).
- **Vérification :** \`node --test src/csv.test.js\`
- **Tranche :** T1

<!-- kaizen:verification -->
## Contrat de vérification
- \`npm test\`

<!-- kaizen:done -->
## Définition de terminé
- U1–U2 livrées, chacune avec sa preuve ; R1–R3 et AE1–AE3 couverts par des tests verts.
`;

// Pas de mainteneur pour répondre : les skills interactives doivent avancer sur leurs recommandations.
export const HEADLESS = "Personne n'est disponible pour répondre à tes questions pendant cette session : quand tu devrais demander, prends ta recommandation et consigne-la comme hypothèse dans le livrable.";
