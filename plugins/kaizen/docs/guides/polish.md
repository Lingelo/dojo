# `/kaizen:polish`

> Vous regardez la fonctionnalité qui tourne, vous dites ce qui ne va pas, Claude ajuste à chaud.

`polish` sert à **peaufiner** une fonctionnalité qui marche déjà. C'est vous qui dirigez : pas de
checklist autonome, pas de QA générale. Claude démarre le serveur de dev, ouvre la page, attend vos
retours et applique chaque retouche sur la surface concernée.

## En bref

| | |
|---|---|
| **Ce qu'elle fait** | Détecte et démarre le serveur de dev, ouvre la page (Playwright), applique vos retouches une à une, vérifie par capture, commite en local |
| **Quand l'utiliser** | Avant de livrer une fonctionnalité visible : espacements, textes, états, responsive, accessibilité |
| **Quand ne pas l'utiliser** | La fonctionnalité ne marche pas encore (→ [work](work.md) ou [debug](debug.md)) ; vous voulez une QA autonome |
| **Ce qu'elle produit** | Des commits locaux (`style(…)` ou `fix(…)`), et le serveur laissé en marche |
| **Et ensuite** | `/kaizen:ship` pour livrer ; `/kaizen:learn` si une retouche révèle une règle d'interface à retenir |

## Exemples

```text
/kaizen:polish                         # branche courante
/kaizen:polish 42                      # la PR #42
/kaizen:polish feat/export /orders     # une branche, en ouvrant la route /orders
```

## Comment ça se passe

1. **Espace de travail** : jamais la branche par défaut. Sur elle, avec un arbre propre, Claude crée
   une branche locale `polish/<sujet>` et vous le dit. Une PR ou une branche déjà extraite dans un
   autre worktree est travaillée là-bas.
2. **Serveur de dev** : `node $K dev detect` trouve la commande, le dossier et le port. Sont
   reconnus :
   - Next.js, Nuxt, SvelteKit, Remix, Astro, Angular, Vite, Gatsby, CRA, Storybook ;
   - Rails, Django, Phoenix, Laravel, Procfile ;
   - les monorepos (`apps/*`, `packages/*`).

   `.claude/launch.json` fait foi s'il existe. Ensuite :
   - un port déjà occupé n'est réutilisé que si c'est bien ce projet. Sinon Claude vous demande, il
     ne tue jamais un processus d'office ;
   - le serveur est démarré en arrière-plan, puis `node $K dev probe` vérifie qu'il répond. En cas
     d'échec, vous voyez les 20 dernières lignes de son log.
3. **Ouverture** : la page touchée par la branche, via le MCP Playwright du plugin `playwright` s'il
   est installé. Sinon, l'URL vous est donnée.
4. **Boucle** : pour chaque retour, retouche de la surface concernée en respectant le design system,
   puis capture si c'est visuel (à 375 px pour le mobile).
5. **Clôture**, quand vous dites que c'est fini : `verify` doit rester vert, puis commit local des
   seuls fichiers retouchés. Le rapport donne l'URL du serveur, toujours en marche.

## `.claude/launch.json`

Après une détection réussie, Claude propose d'enregistrer la configuration du serveur :

```json
{
  "configurations": [
    { "name": "web", "runtimeExecutable": "pnpm", "runtimeArgs": ["dev"], "cwd": "apps/web", "port": 3000 }
  ]
}
```

## Bon à savoir

- **Jamais de push ni de PR** : c'est le rôle de `/kaizen:ship`.
- Le serveur de dev est **toujours** lancé, même si vous prévenez que vous ne regarderez pas : la page
  servie est la preuve de la retouche. Le rapport donne son URL et `kill <pid>` pour l'arrêter.
- Pour un serveur Node maison (`node server.js`), le port est lu dans le fichier
  (`process.env.PORT || 5173`, `.listen(8080)`).
- Les retours récurrents (états vide, chargement et erreur, focus clavier, contrastes, textes
  tronqués) vous sont proposés **une fois**, sans être imposés.

## Voir aussi

[ship](ship.md) · [work](work.md)
