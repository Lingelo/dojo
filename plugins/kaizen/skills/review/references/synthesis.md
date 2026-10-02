# Fusion et validation des constats

## 1. Normaliser

Pour chaque retour JSON valide : garde les champs du contrat. Valeur hors énumération → corrige si
l'intention est évidente (`"high"` → `P1`), sinon rétrograde la confiance à 50. Un constat sans
`evidence` est rejeté. Un 75/100 dont la première preuve n'est pas une ligne citée avec `fichier:ligne`
descend à 50 (règle « cite la ligne »).

## 2. Dédoublonner

Deux constats sont le même s'ils visent le même fichier, des lignes à ± 3 près, et le **même mode de
défaillance**. Fusionne : garde la sévérité la plus haute, la meilleure preuve, le correctif le plus
concret, et liste tous les relecteurs (« security + adversarial »). Deux relecteurs indépendants qui
convergent renforcent la confiance (+1 ancrage, plafonné à 100) — c'est un signal, pas une preuve.

Deux constats **contradictoires** sur la même ligne (l'un veut ajouter, l'autre retirer) : garde les
deux, signale la tension, ne tranche pas sans preuve.

## 3. Porte de confiance

| Confiance | Destination |
|---|---|
| 100, 75 | constat actionnable |
| 50 + P0 | constat actionnable (marqué « non confirmé ») |
| 50 autre | déplacé vers `testing_gaps` ou `residual_risks` s'il a une valeur, sinon abandonné |
| `pre_existing: true` | section « Préexistants », jamais dans le verdict |

## 4. Valider chaque P0/P1

Avant le rapport, **relis toi-même** les lignes citées de chaque constat P0/P1 (et des P2 à
`gated_auto` qui seraient appliqués) :
- la ligne citée existe-t-elle mot pour mot à cet endroit ?
- la garde, la validation ou le test que le relecteur dit absent n'existe-t-il vraiment nulle part
  (appelant, middleware, défaut du framework) ? Une recherche ciblée suffit.
- l'intention : un commentaire, un commit ou le plan indiquent-ils que c'est voulu ?

Résultat par constat : **confirmé** (garde), **réfuté** (retire, en notant la raison dans la
couverture), **non résolu** (garde, marqué « à vérifier », ne compte pas comme P1 confirmé pour le
verdict, sauf sujet protégé ci-dessous).

Sujets protégés — perte de données, contrôle d'accès/authentification, injection, exposition de
secrets, crypto, concurrence, contrat public : un tel constat ne se **réfute** que sur une preuve citée
qui le contredit. À défaut, il reste « non résolu » et compte pour le verdict.

Plus de 8 constats à valider : confie la validation à un sous-agent `general-purpose` (lecture seule)
par lot, avec la liste des constats et ces règles.

## 5. Conformité au plan

Pour chaque `R` et `AE` du plan : couvert (fichier + test qui le prouve), couvert autrement que prévu
(à signaler), ou non couvert (constat P1 si l'exigence est dans le périmètre de la branche, sinon
note). Une décision `KTD` contournée sans explication est un constat.

## 6. Classer

Tri : sévérité, puis confiance, puis nombre de relecteurs concordants. Numérote les constats ; le
numéro sert à l'utilisateur pour dire « applique 1, 3 et 4 ».
