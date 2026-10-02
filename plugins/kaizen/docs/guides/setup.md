# `/kaizen:setup`

> Préparer un repo pour Kaizen, vérifier qu'il est en bonne santé, ou créer un Kaizen Pack.

## En bref

| | |
|---|---|
| **Ce qu'elle fait** | Crée la config et les dossiers, fait valider les commandes de vérification, règle la langue, le tracker, l'emplacement des documents et le plafond des PR, rend les leçons trouvables depuis `CLAUDE.md`, propose la constitution |
| **Quand l'utiliser** | Première utilisation dans un repo ; `check` quand quelque chose semble anormal ; `pack:<nom>` pour créer un pack |
| **Quand ne pas l'utiliser** | Écrire les principes du projet (→ [constitution](constitution.md), que `setup` propose à la fin) |
| **Ce qu'elle produit** | `.kaizen/config.json`, `docs/{plans,solutions,ideation}/`, une ligne dans `.gitignore`, éventuellement une section dans `CLAUDE.md` |
| **Et ensuite** | `/kaizen:constitution`, puis `/kaizen:brainstorm <idée>` ou `/kaizen:ideate` |

## Exemples

```text
/kaizen:setup                 # installation guidée
/kaizen:setup check           # bilan de santé, aucune écriture
/kaizen:setup pack:house-rules
/kaizen:setup pack:house-rules première règle : tout export CSV commence par un BOM
```

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
   aille lire `docs/solutions/` avant de planifier ou de déboguer.
7. **Constitution** : proposée si elle est absente, vérifiée si elle existe.
8. **Taille des PR** : `pr.max_lines` (400 par défaut).
9. **Bilan**.

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
- Un repo qui contient déjà des documents au format Compound Engineering (`docs/plans/`,
  `docs/solutions/`) est compatible : les leçons existantes sont lues telles quelles.

## Voir aussi

[Démarrage](../demarrage.md) · [Configuration](../configuration.md) · [Kaizen Packs](../packs.md) · [constitution](constitution.md)
