# Démarrage : un premier cycle complet

Ce guide déroule un vrai cycle Kaizen sur un exemple : ajouter un **export CSV des commandes** à une
application. Comptez une heure la première fois, dont l'essentiel en discussion avec Claude.

Pour une vue d'ensemble avant de commencer : [la vidéo de présentation](media/kaizen-presentation.mp4)
(une minute, voix off et [sous-titres](media/kaizen-presentation.srt)).

À tout moment, **`/kaizen:help`** vous dit où en est le repo et quelle commande lancer ensuite
(`/kaizen:help je veux livrer ma branche`, `/kaizen:help j'ai un bug`…).

## 0. Prérequis

- Claude Code, Node ≥ 18, git.
- `gh` authentifié (`gh auth status`) pour ouvrir et suivre les PR. Sans lui, tout fonctionne sauf
  `ship`, `address-feedback` et `watch-pr`.
- Optionnel : le plugin `playwright` du marketplace, pour que Claude voie l'interface.

## 1. Installer

Dans les réglages de Claude Code (`.claude/settings.json` du projet ou de l'utilisateur) :

```json
{
  "extraKnownMarketplaces": {
    "angelo-plugins": { "source": { "source": "github", "repo": "Lingelo/marketplace-claude-code" } }
  },
  "enabledPlugins": { "kaizen@angelo-plugins": true }
}
```

Ou en interactif : `/plugin marketplace add Lingelo/marketplace-claude-code`, puis
`/plugin install kaizen@angelo-plugins`. Vérifiez que `/kaizen:setup` apparaît dans la liste des
commandes.

## 2. Préparer le repo : `/kaizen:setup`

```text
/kaizen:setup
```

Claude crée `.kaizen/config.json` et les dossiers `docs/plans`, `docs/learnings` et `docs/ideation`.
Il détecte la stack et vous montre les commandes de vérification qu'il a trouvées (`npm test`,
`npm run -s lint`…). **Vérifiez-les** : ce sont elles que le garde-fou lancera. Il vous propose
ensuite une petite section dans `CLAUDE.md`, pour que tout agent sache où trouver les leçons, puis un
**profil** : `lean` est recommandé pour un premier cycle (moins de cérémonie, mêmes garde-fous).

Ce qui change dans le repo : `.kaizen/config.json`, `docs/…/.gitkeep`, une ligne dans `.gitignore`.
Commitez-les.

## 3. Écrire les principes : `/kaizen:constitution`

```text
/kaizen:constitution
```

Claude commence par lire le repo (CI, outils, leçons existantes), puis vous interroge : « Quand un
changement a fait mal ici, qu'est-ce qui aurait dû l'empêcher en amont ? ». Il propose 5 à 8
articles de départ, et chaque article retenu reçoit un **contrôle vérifiable**. S'il juge une
réponse vague (« du code de qualité »), il vous relance.

Il termine par un stress test : des cas concrets (« un correctif urgent sans test, un vendredi
soir ? ») pour vérifier que vos principes tranchent vraiment. Résultat : `CONSTITUTION.md`, en
version 1.0.0.

> Pas le temps maintenant ? Sautez cette étape : tout fonctionne sans constitution. Vous perdez
> seulement les contrôles propres à votre projet.

## 4. Définir quoi construire : `/kaizen:brainstorm`

```text
/kaizen:brainstorm export CSV des commandes depuis la liste, pour les responsables boutique
```

Claude lit le code de la liste des commandes et cherche des leçons sur les exports. Il pose ensuite
**une question à la fois** : qui exporte ? avec quels filtres ? quel volume ? Il propose 2 ou 3
approches (export synchrone ou asynchrone par e-mail…) et vous choisissez.

Il écrit alors `docs/plans/2026-…-feat-export-csv-commandes-plan.md`, qui ne contient encore que les
exigences (R1…R5) et les exemples d'acceptation (AE1…AE3). Les points encore flous y sont marqués
`[À CLARIFIER : …]`.

## 5. Décider comment : `/kaizen:plan`

Choisissez « Planifier » à la fin du brainstorm, ou lancez :

```text
/kaizen:plan docs/plans/2026-…-feat-export-csv-commandes-plan.md
```

Claude lance des agents de recherche en parallèle : motifs du repo à imiter, leçons passées,
historique git si la zone est ancienne. Puis il **enrichit le même fichier** :
- décisions techniques justifiées (KTD) ;
- contrôle de chaque article de la constitution ;
- menaces STRIDE si la zone est sensible ;
- déploiement et retour arrière ;
- unités de travail (U1…U3), chacune avec ses fichiers, sa stratégie de preuve et ses tests,
  groupées en tranches de la taille d'une PR.

Deux contrôles suivent automatiquement :
- `plan check`, déterministe : chaque exigence est-elle couverte par une unité ? reste-t-il des
  zones floues ?
- `/kaizen:doc-review` : 2 à 6 relecteurs relisent le plan et corrigent ce qui est mécanique. Les
  décisions restantes vous sont posées.

> À ce stade, **relisez le plan**. C'est le moment où une correction coûte une phrase.
> [Exemple complet de plan](../templates/plan-example.md).

## 6. Construire : `/kaizen:work`

```text
/kaizen:work
```

Claude crée une branche (`feat/SHOP-412-export-csv` si une clé Jira est connue), puis active le
**garde-fou**. Pour chaque unité, il :
1. écrit le test et le voit échouer ;
2. implémente ;
3. relance les vérifications ;
4. commite l'unité.

Tant que les tests ou le lint sont rouges, le hook l'empêche de s'arrêter.

À la fin, il vérifie la taille du diff, simplifie, puis lance **obligatoirement** `/kaizen:review`.
Il corrige les P0/P1 et vous propose de livrer.

## 7. Livrer et suivre : `/kaizen:ship` puis `/kaizen:watch-pr`

`ship` pousse la branche et ouvre la PR. La description est tirée du plan : pourquoi, ce qui change,
**guide du relecteur**, preuves, retour arrière.

Le push n'est accepté qu'avec une revue enregistrée : un hook le refuse sinon. Pour pousser sans revue
(hotfix, branche jetable), dites-le à Claude ; il vous donne un code que **vous** tapez
(`kaizen waive <code>`), et la PR le signale dans une section « Revue écartée ».

`watch-pr` suit ensuite la PR jusqu'à ce qu'elle semble prête à merger :
- il traite les commentaires de revue avant la CI ;
- il répare la CI ;
- il met la branche à jour quand GitHub le demande ;
- il attend sans consommer de tokens.

**Vous mergez.** Kaizen ne merge jamais.

## 8. Retenir : `/kaizen:learn`

Si le cycle a révélé un piège, par exemple « Excel affiche des accents cassés sans BOM UTF-8 » :

```text
/kaizen:learn
```

Claude n'écrit une leçon que si elle passe le test de durabilité : sans ce document, un futur
développeur referait-il l'erreur ? La leçon va dans `docs/learnings/runtime-errors/…`, avec un
frontmatter validé.

**C'est là que la boucle se referme.** Le prochain `/kaizen:plan` qui touche aux exports la
retrouvera, la citera, et en fera un test.

## Et ensuite

- Mettre en production : déclarez vos commandes et vos signaux (`/kaizen:setup`), puis
  `/kaizen:deploy staging` et `/kaizen:deploy production`. Les signaux cités par le plan sont
  surveillés après le déploiement, avec retour arrière si un seuil est franchi.
- Ne plus savoir quoi lancer : `/kaizen:help` regarde l'état du repo (`node $K status`) et recommande
  la commande suivante.
- Tout enchaîner : après un brainstorm, `/kaizen:autopilot` exécute le plan, la revue, la livraison et le
  suivi de PR sans vous interrompre.
- Mesurer après quelques semaines : `/kaizen:metrics` (taille des PR, délai, taux de reprise,
  leçons réellement réutilisées).
- Un incident ? `/kaizen:postmortem`. Une décision lourde ? `/kaizen:decide`.
