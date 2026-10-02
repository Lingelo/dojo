---
name: polish
description: Peaufine l'expérience d'une fonctionnalité qui marche déjà, guidé par l'utilisateur sur la page vivante — détecte et démarre le serveur de dev (Next, Vite, Nuxt, SvelteKit, Astro, Angular, Rails, Django, Phoenix, Laravel, .claude/launch.json), ouvre la page dans le navigateur (Playwright), applique à chaud chaque retour (espacements, textes, états, responsive, accessibilité), vérifie par capture, et commite en local. Utiliser pour « peaufinons l'UI », « polish », « ajustons le rendu avant de livrer », /kaizen:polish. Ne pousse jamais, ne fait pas de QA autonome.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion
argument-hint: "[n° de PR, branche, ou vide = branche courante] [url ou route à ouvrir]"
---

# Polish — l'utilisateur regarde, Claude ajuste

Mettre une fonctionnalité **qui marche** devant l'utilisateur et transformer ses observations en
retouches ciblées sur la page en cours d'exécution. **C'est l'utilisateur qui dirige** ce qu'on
regarde et ce qu'on change : pas de checklist autonome, pas de QA générale.

Lis `${CLAUDE_PLUGIN_ROOT}/references/conventions.md`.
`K="${CLAUDE_PLUGIN_ROOT}/scripts/kaizen.mjs"`

**Terminé quand :** l'utilisateur dit qu'il a fini, chaque retouche demandée est visible sur la page
ou rapportée comme bloquée, et les changements sont commités **en local**. Un blocage serveur ou de
copie de travail termine aussi la session, rapporté avec ce qu'il faut pour reprendre.

**Limites** : jamais sur la branche par défaut ; jamais de push ni de PR (c'est `/kaizen:ship`) ;
on ne touche qu'à la surface concernée par les retours.

## 1. Espace de travail

- PR ou branche nommée : si elle est déjà extraite dans un autre worktree (`git worktree list`),
  travaille là-bas ; sinon `gh pr checkout <n>` / `git switch <branche>` **seulement** si l'arbre
  courant est propre. Sans argument : la branche courante.
- Branche par défaut avec un arbre propre → crée une branche locale `polish/<sujet-court>` et dis-le
  (sans risque : rien n'est poussé). Arbre sale sur la branche par défaut, ou HEAD détaché : dis-le et
  arrête.

## 2. Serveur de dev

1. `node "$K" dev detect` → candidats (commande, dossier, port, URL, source). `.claude/launch.json`
   fait foi s'il existe. Plusieurs candidats (monorepo) → demande lequel ; aucun → demande la commande
   et le port, sans deviner.
2. **Port déjà occupé** (`node "$K" dev probe --url <url> --timeout-seconds 2` répond) : réutilise-le
   seulement si c'est bien ce projet (page attendue, process visible dans `lsof -i :<port>` ou `ss`) ;
   sinon demande : arrêter ce process, autre port, ou abandonner. Ne tue jamais un process d'office.
3. Sinon démarre-le **en arrière-plan** (outil Bash, `run_in_background: true`) dans son dossier,
   avec son environnement, sortie redirigée vers un fichier temporaire
   (`mktemp -d "${TMPDIR:-/tmp}/kaizen-polish-XXXXXX"`).
4. `node "$K" dev probe --url <url> --timeout-seconds 60`. Injoignable → montre les 20 dernières lignes
   du log du serveur lancé et demande : corriger l'URL/la commande, ou arrêter.
5. Après une détection automatique réussie, propose **une fois** d'enregistrer le tuple dans
   `.claude/launch.json` (`{"configurations":[{"name","runtimeExecutable","runtimeArgs","cwd","port","env"}]}`).

## 3. Ouvrir et attendre

Ouvre la page (route passée en argument, sinon celle que la branche touche — `git diff --name-only`
vers les fichiers de pages/routes) avec l'outil navigateur disponible : MCP Playwright du plugin
`playwright` (`browser_navigate`, `browser_take_screenshot`, `browser_resize`), sinon donne l'URL.
Puis dis :

```text
Serveur de dev : <url>
Parcours la fonctionnalité et dis-moi ce qui pourrait être mieux.
```

**N'entame pas de revue pendant qu'il navigue.** Attends ses retours.

## 4. Boucle

Pour chaque retour :
1. Reformule en une ligne ce que tu vas changer si c'est ambigu (sinon, fais-le).
2. Inspecte le minimum (composant, styles, textes) ; édite **la surface concernée** en suivant le design
   system et les composants existants (pas de nouvelle couleur ou d'espacement magique si des jetons
   existent) ; le rechargement à chaud met la page à jour.
3. Si l'utilisateur demande à voir, ou si le retour est visuel : capture après changement (et à
   375 px de large si le retour concerne le mobile). Sans outil navigateur, demande-lui ce qu'il voit.
4. Garde une liste courante : retour → changement → fichier.

Retours récurrents qui valent la peine d'être anticipés quand ils touchent la zone : états vide /
chargement / erreur, focus clavier visible, contrastes, textes tronqués, petits écrans, double
soumission. Propose-les **une fois**, en une ligne, sans les imposer.

## 5. Clore

Quand l'utilisateur dit qu'il a fini :
1. `node "$K" verify` (les retouches ne doivent rien casser) ; rouge → corrige ou annule la retouche
   fautive.
2. Commit local conventionnel (`style(<JIRA>): …` ou `fix(<JIRA>): …` selon la nature), fichiers
   nommés explicitement — les modifications antérieures de l'utilisateur hors polish restent hors du
   commit.
3. Rapport : retouches appliquées, bloquées (et pourquoi), commit(s), URL du serveur **toujours en
   marche** (dis comment l'arrêter). Suggère `/kaizen:ship` pour livrer, et `/kaizen:compound` si une
   retouche a révélé une règle d'UI à retenir (ou une règle de pack « design »).
