# Claude Code Marketplace

Marketplace de plugins pour Claude Code, fournissant des outils et workflows de développement.

## Plugins disponibles

| Plugin | Description | Composants |
|--------|-------------|------------|
| [**security**](plugins/security/README.md) | Bloque l'accès aux fichiers sensibles + scanne les commits pour détecter les secrets + circuit breaker | Hook, Utility |
| [**notifications-system**](plugins/notifications-system/README.md) | Sons système et notifications OS | Hook |
| [**git**](plugins/git/README.md) | Commits conventionnels + push securisé (bloque main/master) | Skills |
| [**playwright**](plugins/playwright/README.md) | MCP Playwright + agents tests E2E (planner, generator, healer) | MCP, Agents |
| [**statusline**](plugins/statusline/README.md) | Statusline avec suivi des coûts, git et support multi-plans | Command, Script |
| [**experts**](plugins/experts/README.md) | Agent architecte pour analyse de code et évolutions | Agent |
| [**frustration-detector**](plugins/frustration-detector/README.md) | Détecte la frustration et adapte le style de Claude (moins de blabla, plus d'action) | Hook |
| [**motion-studio**](plugins/motion-studio/README.md) | Motion design en code : HTML/CSS/SVG/Canvas → MP4/WebM/GIF image par image, son synchronisé (Playwright + ffmpeg) | Skill, Script |
| [**kaizen**](plugins/kaizen/README.md) | SDLC assisté par IA (adapté de Compound Engineering) : constitution d'ingénierie appliquée comme contrôles, brainstorm → plan (traçabilité, menaces, retour arrière, tranches de PR) → doc-review → work (garde-fou) → review multi-agents → ship → watch-pr, polish UI, leçons/ADR/post-mortems relus à chaque cycle, métriques DORA, release | Skills, Agents, Hook, Script |

## Installation

### 1. Ajouter la Marketplace

```bash
/plugin marketplace add <YOUR_GIT_URL>
```

Ou via le mode interactif :
```bash
/plugin
# Aller dans l'onglet "Marketplaces" > "Add marketplace"
# Coller l'URL de votre repository git
```

### 2. Installer les plugins

**Interactif (recommandé) :**
```bash
/plugin
# Aller dans l'onglet "Discover" et sélectionner les plugins à installer
```

**Installation directe :**
```bash
/plugin install security@angelo-plugins
/plugin install notifications-system@angelo-plugins
/plugin install git@angelo-plugins
/plugin install playwright@angelo-plugins
/plugin install statusline@angelo-plugins
/plugin install experts@angelo-plugins
/plugin install frustration-detector@angelo-plugins
/plugin install motion-studio@angelo-plugins
/plugin install kaizen@angelo-plugins
```

## Configuration équipe

Ajouter dans le `.claude/settings.json` de votre projet pour auto-configurer tous les membres de l'équipe :

```json
{
  "extraKnownMarketplaces": {
    "angelo-plugins": {
      "source": {
        "source": "git",
        "url": "<YOUR_GIT_URL>"
      }
    }
  },
  "enabledPlugins": {
    "security@angelo-plugins": true,
    "git@angelo-plugins": true
  }
}
```

## Gestion des plugins

| Commande | Description |
|----------|-------------|
| `/plugin` | Ouvrir le gestionnaire de plugins interactif |
| `/plugin install name@marketplace` | Installer un plugin |
| `/plugin uninstall name@marketplace` | Supprimer un plugin |
| `/plugin enable name@marketplace` | Activer un plugin désactivé |
| `/plugin disable name@marketplace` | Désactiver sans supprimer |
| `/plugin marketplace list` | Lister les marketplaces enregistrées |
| `/plugin marketplace update` | Mettre à jour les métadonnées |

## Exemples d'utilisation

### Plugin Security
Deux protections automatiques via hooks `PreToolUse` :
- **Blocage fichiers sensibles** — empêche l'accès aux `.env`, `credentials.json`, `.pem`, etc.
- **Secret Scanner** — scanne les `git commit` pour détecter ~30 types de secrets (Anthropic, OpenAI, AWS, GitHub, GitLab, Slack, Stripe...) et bloque si des clés API ou tokens sont trouvés dans les fichiers stagés.

Aucune commande nécessaire - fonctionne automatiquement via hook.

> **Note sécurité** : Ce plugin utilise des **hooks `PreToolUse`** plutôt que les `deny` rules de `settings.json`. Les deny rules ont des [bugs connus](https://github.com/anthropics/claude-code/issues/6699) où elles sont parfois ignorées. Les hooks avec exit code 2 garantissent un blocage fiable.

### Plugin Git
```bash
/commit
# Analyse les changements et cree un commit conventionnel avec le Jira de la branche

/push
# Pousse les commits (BLOQUE si sur main/master)
```

### Statusline
```bash
/statusline-setup
# Configure la statusline avec suivi des coûts, git, et support multi-plans (Pro, Max5, Max20, Pay-as-you-go)
```
Nécessite `jq` et optionnellement `ccusage`.

### Experts
```bash
# L'agent se déclenche sur les questions d'architecture
Analyse l'architecture du module orders
Comment découper ce service monolithique ?
Quelle est la dette technique de ce projet ?
```
Agent Opus pour analyses approfondies et propositions d'évolution.

### Playwright
Le plugin inclut un serveur MCP Playwright et 3 agents spécialisés pour les tests E2E :
- **Planner** — explore l'application et conçoit les scénarios de test
- **Generator** — génère le code de test Playwright
- **Healer** — débugge et corrige les tests en échec

### Frustration Detector
Détecte automatiquement la frustration dans vos prompts et adapte le style de Claude :
- **Colère** (`putain`, `wtf`, `fuck`...) → mode action silencieuse, zéro blabla
- **Impatience** (`finis`, `just do it`...) → code uniquement, pas d'explication
- **Confusion** (`ça marche pas`, `I'm stuck`...) → diagnostic bref + fix immédiat
- **Sarcasme** (`merci pour rien`, `I'll use Cursor`...) → action immédiate, pas d'excuses

Fonctionne en FR et EN (~200 termes détectés). Aucune commande nécessaire.

### Motion Studio
```bash
/motion-video Teaser 8s 16:9 pour le lancement de notre API, style sombre, accent orange
```
Storyboard → composition HTML/CSS/SVG/Canvas → stills de contrôle → rendu MP4 image par image
(horloge virtuelle, motion blur, supersampling) avec bruitages et musique synchronisés. Dépendances (Playwright, Chromium, ffmpeg) installées automatiquement au premier usage.

### Kaizen

```bash
/kaizen:setup                                   # config, détection de la stack, dossiers docs/
/kaizen:constitution                            # principes non négociables du projet
/kaizen:brainstorm export CSV des commandes     # QUOI construire → docs/plans/…-plan.md
/kaizen:plan                                    # COMMENT → unités, tests, retour arrière + relecture du plan
/kaizen:work                                    # test d'abord, garde-fou, revue multi-agents
/kaizen:ship                                    # PR relisible, puis /kaizen:watch-pr jusqu'à « prête »
/kaizen:learn                                   # la leçon, relue par le prochain plan
/kaizen:autopilot                               # ou tout enchaîner après le brainstorm
```

Documentation : [démarrage](plugins/kaizen/docs/demarrage.md) · [guides par skill](plugins/kaizen/docs/README.md).

### Claude Factory — Dream Consolidation
```bash
/factory:dream              # Consolide les CLAUDE.md et rules/
/factory:dream --dry-run    # Rapport sans modifications
```
Déduplication, détection de contradictions, nettoyage des références obsolètes.

## Structure

```
marketplace-claude-code/
├── .claude-plugin/
│   └── marketplace.json      # Registre de la marketplace
├── plugins/
│   ├── security/             # Protection fichiers sensibles + secret scanner + circuit breaker
│   ├── notifications-system/ # Notifications sons système + OS
│   ├── git/                  # Commits + push securise
│   ├── playwright/           # MCP + Agents tests E2E
│   ├── statusline/           # Statusline personnalisée
│   ├── experts/              # Agent architecte
│   ├── frustration-detector/ # Détection frustration + adaptation style
│   └── motion-studio/        # Vidéos motion design depuis HTML (Playwright + ffmpeg)
└── README.md
```

## Contribuer

1. Créer un nouveau plugin dans `plugins/votre-plugin/`
2. Ajouter `.claude-plugin/plugin.json` avec les métadonnées
3. Ajouter commands, agents, skills ou hooks selon les besoins
4. Enregistrer dans `.claude-plugin/marketplace.json`
5. Ajouter un `README.md` documentant votre plugin

## Licence

MIT
