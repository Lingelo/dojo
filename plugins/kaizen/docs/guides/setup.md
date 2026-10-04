# `/kaizen:setup`

> Mettre en place le SDLC sur un projet : diagnostiquer ce qui lui manque, installer Kaizen, vérifier
> qu'il est en bonne santé, ou créer un Kaizen Pack.

## En bref

| | |
|---|---|
| **Ce qu'elle fait** | Crée la config et les dossiers, fait valider les commandes de vérification, règle la langue, le tracker, l'emplacement des documents et le plafond des PR, rend les leçons trouvables depuis `CLAUDE.md`, propose la constitution |
| **Quand l'utiliser** | Première utilisation dans un repo ; `audit` pour savoir ce qui manque au projet et le corriger dans l'ordre ; `check` quand quelque chose semble anormal ; `pack:<nom>` pour créer un pack |
| **Quand ne pas l'utiliser** | Écrire les principes du projet (→ [constitution](constitution.md), que `setup` propose à la fin) |
| **Ce qu'elle produit** | `.kaizen/config.json`, `docs/{plans,learnings,ideation}/`, une ligne dans `.gitignore`, éventuellement une section dans `CLAUDE.md` |
| **Et ensuite** | `/kaizen:constitution`, puis `/kaizen:brainstorm <idée>` ou `/kaizen:ideate` |

## Exemples

```text
/kaizen:setup audit           # maturité SDLC du projet, corrections guidées par priorité
/kaizen:setup                 # installation guidée
/kaizen:setup check           # bilan de santé, aucune écriture
/kaizen:setup pack:house-rules
/kaizen:setup pack:house-rules première règle : tout export CSV commence par un BOM
```

## L'audit : mettre en place le SDLC

`node $K audit` évalue le projet sur cinq domaines et donne une note à chacun :

| Domaine | Contrôles |
|---|---|
| **Fondations** | dépôt distant, CI qui lance les tests, tests automatisés, lint, typage, `.env` ignoré, détection de secrets |
| **Flux** | protection de la branche par défaut (via `gh`), CODEOWNERS, modèle de PR, Dependabot/Renovate, `CLAUDE.md` |
| **Livraison** | déploiement outillé (ou reconnu par `deploy detect`), retour arrière, production protégée |
| **Exploitation** | signaux surveillés, endpoint de santé (route trouvée dans le code) |
| **Boucle Kaizen** | Kaizen initialisé, constitution, leçons trouvables |

Puis Claude propose de corriger chaque point, **P1 d'abord** (ce qui protège), un par un, avec votre
accord :
- **gabarits** générés depuis votre stack, jamais par-dessus un fichier existant :
  `audit fix ci` (GitHub Actions : installation et commandes de vérification détectées),
  `pr_template`, `dependabot` (écosystèmes détectés), `codeowners --owner @équipe`, `gitignore_env`,
  `monitor_patrol` et `monitor_alert` (détection continue des incidents, `--env`, `--ref <sha>`) ;
- **déploiement** : `deploy detect`, vous choisissez, `deploy configure <id>` ;
- **réglages d'administration** (protection de branche) : Claude donne les réglages exacts, vous les
  appliquez ;
- **skills** : constitution, installation.

L'audit se relance à la fin pour montrer l'avant/après.

## L'installation, étape par étape

1. **Initialiser** : `node $K init`, idempotent (n'écrase jamais une config existante).
2. **Vérifications** : Claude vous montre les commandes `test`, `lint` et `typecheck` détectées.
   Vous les gardez, les ajustez, ou désactivez le garde-fou. Il les lance une fois pour s'assurer
   qu'elles passent déjà sur la branche par défaut.
3. **Langue** : `auto` (suit la conversation), ou fixée.
4. **Tracker** : `auto` (Jira lu dans la branche, GitHub via `gh`).
5. **Emplacement** : `docs_root` (`docs` par défaut). À changer **avant** les premiers documents si
   `docs/` est déjà un site publié.
6. **Trouvabilité** (avec votre accord) : une courte section dans `CLAUDE.md`, pour que tout agent
   aille lire `docs/learnings/` avant de planifier ou de déboguer.
7. **Constitution** : proposée si elle est absente, vérifiée si elle existe.
8. **Taille des PR** : `pr.max_lines` (400 par défaut).
9. **Déploiement et monitoring** (facultatif) : `deploy detect` reconnaît votre plateforme et propose
   commandes, retour arrière et health-check ; vous choisissez. Voir [deploy](deploy.md).
10. **Profil** : `lean` (recommandé pour commencer), `standard` ou `full`. Il fixe aussi le modèle de
    chaque agent. Voir [Configuration](../configuration.md#profile) et
    [`models`](../configuration.md#models--le-bon-modèle-pour-chaque-tâche).
11. **Bilan**.

## Le bilan (`check`)

| Point | Commande |
|---|---|
| Racine et config | `node $K root`, `node $K config` |
| Vérifications | `node $K detect` |
| Leçons | `node $K learnings validate` |
| Packs | `node $K packs` |
| Constitution | `node $K constitution check` |
| Garde-fou | `node $K gate status` (un garde-fou resté actif sans travail en cours → `gate off`) |

Chaque point affiche ✔ ou ⚠, avec la correction proposée.

## Bon à savoir

- Ce que `setup` crée est à **commiter** : la config et les dossiers sont partagés par l'équipe.
  `.kaizen/config.local.json` et `.kaizen/state/` ne sont pas versionnés.

## Voir aussi

[Démarrage](../demarrage.md) · [Configuration](../configuration.md) · [Kaizen Packs](../packs.md) · [constitution](constitution.md)
