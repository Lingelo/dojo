# Boucle d'implémentation

## Pour chaque unité, dans l'ordre

```
tant qu'il reste des unités :
  - marquer la tâche « en cours »
  - lire les fichiers de l'unité, le motif à imiter, les leçons citées (lectures en parallèle)
  - déjà fait ? (fichiers présents, capacité attendue, vérification déjà vraie) → vérifier, marquer
    terminé, passer : ne jamais réimplémenter en silence
  - trouver les tests existants des fichiers touchés (découverte des tests, ci-dessous)
  - choisir la stratégie de preuve (tableau ci-dessous)
  - preuve d'abord : écrire/renforcer le test, le lancer, CONSTATER L'ÉCHEC pour la bonne raison
  - implémenter en suivant les conventions et le motif cité
  - lancer les tests ciblés, puis l'impact transverse (appelants, sérialisation, migrations, docs)
  - consigner la preuve (ci-dessous)
  - commit de l'unité
  - marquer la tâche « terminée »
```

Dépendance hors repo (réglage d'une console, DNS, données en base…) : décide d'après l'état **observé**
du livrable, jamais d'après un arbre git propre. Ré-appliquer seulement si c'est sûr ou autorisé ;
sinon demander ou bloquer.

## Stratégie de preuve

| Situation | Action |
|---|---|
| Un test existant échoue déjà pour le comportement visé | c'est la preuve rouge ; pas de doublon |
| Un test existant possède ce comportement | le renforcer, constater l'échec, puis implémenter |
| Comportement nouveau, emplacement de test naturel | nouveau test qui échoue d'abord |
| Code existant sans tests qu'on va modifier | test de **caractérisation** d'abord (capturer l'existant) |
| Renommage, config pure, style, fichiers générés, surface manuelle | exception : consigner la raison et la vérification de remplacement |

Règles :
- Ne jamais écrire le test et l'implémentation dans la même étape en mode test d'abord.
- Un test doit échouer quand le comportement qu'il nomme casse, et continuer de passer quand seule
  l'implémentation change. Il ne vaut rien si sa valeur attendue vient du code testé, si un mock fournit
  le résultat attendu, ou s'il affirme des appels internes au lieu de ce que le code renvoie, stocke ou
  envoie.
- Pas d'export, drapeau ou hook de production utilisé seulement par les tests quand le vrai point
  d'entrée peut piloter le comportement.
- Pas de nouveau test en doublon quand un test existant est le bon foyer : renforce-le.

## Découverte des tests

Avant de modifier un fichier, trouve ses tests (fichiers qui l'importent ou partagent son nom :
`*.test.*`, `*_spec.*`, `test_*.py`, `*Test.java`…). Les scénarios du plan sont un point de départ ;
vérifie s'il en existe d'autres. Nouveau comportement → nouveaux tests ; comportement changé → tests
modifiés ; comportement supprimé → tests retirés.

## Construis ce qui est demandé

Les unités et le périmètre du plan définissent ce qui se construit. N'ajoute un mécanisme non demandé
(garde, retry, repli, validation, option, abstraction) que si un contrat existant l'exige, ou si :
- son absence laisse un dommage arriver avant que quiconque le remarque (trace que c'est possible ici) ;
- l'ajouter plus tard coûterait cher (données stockées ou leur format, interface publique, argent,
  sécurité).

Alors dans sa plus petite forme ; sinon, ne le construis pas et signale-le en une ligne (« envisagé,
non construit : … »). Ne réduis jamais le comportement demandé pour loger un garde-fou. Un élément listé
hors périmètre reste non construit, sauf preuve nouvelle — dis laquelle.

Quand tu remplaces une fonction, un type ou un module dont **tous** les appelants sont dans le repo,
mets à jour les appelants et supprime l'ancienne version dans le même changement (pas d'alias). Une
interface utilisée hors du repo, ou que le plan dit de garder, continue de fonctionner.

## Quand ça résiste

- Deux correctifs successifs pour le même échec n'ont pas marché → **arrête de patcher** : nomme
  l'hypothèse commune aux deux et vérifie-la. Si elle vient du plan et que la corriger reste dans le
  périmètre, corrige-la et note le changement ; sinon c'est un bloquant (décision acquise remise en
  cause, autorité manquante, information que seul l'utilisateur a).
- Bug dont la cause n'est pas évidente → applique la discipline de `/kaizen:debug` (chaîne causale
  complète avant de corriger).

## Preuve consignée (par unité)

Comportement changé ? · tests existants inspectés · tests ajoutés/modifiés/inchangés · échec rouge
constaté (ou caractérisation) · vérification lancée et résultat · exception et sa raison. Garde-la dans
la tâche et reprends-la dans le résumé final (et dans le retour en `mode:return`).

## Commits

Un commit par unité, après vérification verte de l'unité :
```bash
git add <fichiers de l'unité>          # jamais -A, jamais commit -a
git commit -m "<type>(<JIRA>): <description à l'impératif>" -m "Unité U3 du plan <chemin>. Couvre R2, AE1."
```
Une unité qui applique une leçon citée par le plan ajoute au corps du commit
`-m "Applique docs/learnings/<…>.md"` : c'est le signal « leçon appliquée » de `/kaizen:metrics`.
Clé Jira extraite de la branche (`[A-Z][A-Z0-9]+-\d+`), sinon `<type>: …`. Aucun fichier du
travail en cours de l'utilisateur dans un commit sans son accord.

## Interface utilisateur

Changement visible : vérifie dans un navigateur si un outil est disponible (plugin `playwright` du
marketplace, MCP navigateur) — rendu, états vide/erreur/chargement, clavier, petit écran. Sinon,
consigne la vérification manuelle à faire.
