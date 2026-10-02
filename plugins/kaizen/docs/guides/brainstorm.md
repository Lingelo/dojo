# `/kaizen:brainstorm`

> Définir **quoi** construire, par un dialogue d'une question à la fois, ancré dans le code et les
> leçons passées.

Le brainstorm répond à « qu'est-ce que ça doit être ? » et n'écrit **aucun code**. Il produit la
première version du **plan unifié** : un seul fichier qui commence avec les exigences, puis que
`/kaizen:plan` enrichit sur place avec le « comment ».

## En bref

| | |
|---|---|
| **Ce qu'elle fait** | Lit le contexte (code, leçons, packs, constitution), pose les questions qui comptent, propose 2 ou 3 approches, écrit les exigences |
| **Quand l'utiliser** | Une idée ou une demande encore floue ; un périmètre contesté ; plusieurs lectures possibles |
| **Quand ne pas l'utiliser** | Bug avec symptôme (→ [debug](debug.md)) ; « donne-moi des idées » (→ [ideate](ideate.md)) ; travail déjà spécifié (→ [plan](plan.md)) |
| **Ce qu'elle produit** | Petit travail : une conclusion dans le chat. Sinon `docs/plans/AAAA-MM-JJ-HHMM-<type>-<sujet>-plan.md` avec capsule d'objectif et contrat produit (R1…, AE1…) |
| **Et ensuite** | Menu : planifier (recommandé), tout enchaîner (`lfg`), affiner, s'arrêter |

## Exemples

```text
/kaizen:brainstorm export CSV des commandes pour les responsables boutique
/kaizen:brainstorm rendre les relances de paiement plus sûres
/kaizen:brainstorm                     # Claude demande ce que vous voulez explorer
```

## Comment ça se passe

1. **Reprise** : un plan récent sur le même sujet est proposé à la reprise plutôt que dupliqué.
2. **Taille** :
   - **légère** : quelques questions, conclusion dans le chat ;
   - **standard** : dialogue, approches et fichier ;
   - **profonde** : multi-acteurs ou risque, avec en plus une analyse des parcours.
3. **Ancrage**, sans vous déranger : code de la zone, `CONCEPTS.md`, leçons, packs, constitution, et
   agents de recherche si besoin. Une contradiction avec l'existant vous est montrée **avant** de
   continuer.
4. **Dialogue** : une question par tour, avec la recommandation de Claude en premier. Une décision
   déjà prise dans la conversation n'est pas redemandée. Il fait aussi un test de pression : est-ce
   le bon problème ? existe-t-il une version plus simple ? un angle mort (sécurité, données
   existantes, accessibilité) ?
5. **Approches** : 2 ou 3 vraiment différentes, avec coûts et risques. Vous choisissez, puis Claude
   écrit une synthèse de cadrage à valider.
6. **Écriture** du contrat produit :
   - exigences groupées par préoccupation ;
   - exemples d'acceptation pour tout comportement conditionnel ;
   - décisions annotées « décidé en session » ;
   - points flous marqués `[À CLARIFIER : question — défaut proposé]`.
7. **Contrôles** : `plan check` au stade exigences, puis « prêt pour la planification » : complet,
   cohérent, focalisé, exploitable.

## Ce que contient le fichier

```markdown
<!-- kaizen:goal -->
## Capsule d'objectif
**Objectif :** un responsable boutique récupère en un clic un fichier lisible dans Excel…

<!-- kaizen:product -->
## Contrat produit
### Exigences
- R1. L'export contient exactement les commandes correspondant aux filtres actifs.
### Exemples d'acceptation
- AE1. (couvre R1) Étant donné un filtre « expédiée », quand j'exporte, alors…
```

Le contrat complet est dans [`references/plan-contract.md`](../../references/plan-contract.md).

## Bon à savoir

- Une exigence n'engage que ce que vous avez demandé ou choisi. Un garde-fou que personne n'a
  demandé va en « Hors périmètre » ou en question ouverte.
- Si la demande mélange plusieurs sujets, Claude propose d'en traiter un. Les autres deviennent du
  contexte dans la section « Comment ce travail s'articule ».
- `mode:return` (utilisé par `lfg`) : même dialogue, mais un résultat structuré au lieu du menu
  final.

## Voir aussi

[plan](plan.md) · [ideate](ideate.md) · [lfg](lfg.md)
