# Cours — Méthodologie Agile : le Scrumban appliqué au projet Pinball Hetic

> Objectif : avoir la théorie (Agile → Scrum → Kanban → Scrumban) ET des preuves concrètes,
> tirées de l'historique git et de `docs/TESTABILITY_REFACTORS.md`, pour pouvoir l'expliquer
> à l'oral avec des exemples réels du projet plutôt que des généralités de cours.

---

## Partie 1 — La théorie

### 1.1 Agile, le socle commun

Agile n'est pas une méthode mais un **état d'esprit**, posé par le Manifeste Agile (2001), qui
privilégie :

- les individus et interactions plutôt que les processus et outils
- un logiciel qui fonctionne plutôt qu'une documentation exhaustive
- la collaboration avec le client plutôt que la négociation contractuelle
- l'adaptation au changement plutôt que le suivi d'un plan figé

Concrètement, ça se traduit par des livraisons **courtes et itératives** (on livre un incrément
qui marche, on observe, on ajuste) plutôt qu'un cycle en cascade (tout spécifier → tout
construire → livrer à la fin). Scrum et Kanban sont deux **implémentations concrètes** de cet
état d'esprit — pas des synonymes d'Agile.

### 1.2 Scrum — le cadre en itérations fixes

Scrum découpe le travail en **sprints** (durée fixe, souvent 1 à 2 semaines). Éléments clés :

- **Rôles** : Product Owner (priorise le besoin), Scrum Master (facilite/enlève les blocages),
  Dev Team (réalise)
- **Artefacts** : Product Backlog (tout ce qu'il reste à faire, priorisé), Sprint Backlog
  (ce qu'on s'engage à livrer ce sprint), l'Incrément (le livrable à la fin du sprint)
- **Cérémonies** : Sprint Planning (on choisit quoi faire), Daily (point rapide quotidien),
  Sprint Review (démo de l'incrément), Sprint Retrospective (qu'est-ce qu'on améliore pour le
  prochain sprint)
- **Definition of Done** : critère explicite pour dire qu'un item est "vraiment fini" (testé,
  revu, mergé...)

Scrum est adapté à du **développement de nouvelles fonctionnalités planifiables** : on sait
avant de commencer à peu près ce qu'on va livrer et en combien de temps.

### 1.3 Kanban — le flux continu

Kanban n'a **pas d'itérations fixes**. Le travail est visualisé sur un tableau (colonnes type
"à faire / en cours / fait"), avec :

- une **limite de WIP** (Work In Progress) : on limite le nombre d'items "en cours" en même
  temps, pour éviter de tout démarrer sans rien finir
- un **système tiré (pull)** : on ne commence un nouvel item que quand on a de la capacité
  libre, pas parce qu'un planning l'impose
- pas de cérémonies obligatoires de type sprint — le flux est continu, on mesure le **lead
  time**/**cycle time** (temps entre la demande et la livraison) plutôt que la vélocité par sprint
- une amélioration continue du flux, au fil de l'eau plutôt qu'à date fixe

Kanban est adapté à du **flux imprévisible** : bugs, dette technique, demandes de support — des
choses qu'on ne peut pas toujours planifier à l'avance dans un sprint.

### 1.4 Scrumban — l'hybride

Le Scrumban combine les deux : on garde la **structure Scrum** (sprints/incréments pour le
développement de features planifiables, cérémonies de revue/rétro pour ajuster) mais on gère le
backlog en **flux Kanban** (priorisation continue, limite de WIP, items tirés un par un plutôt
que tous embarqués en bloc dans un sprint). C'est une méthode fréquemment adoptée par des petites
équipes ou des projets qui doivent gérer **en parallèle** du développement de nouvelles features
(mieux planifiable en sprints) et de la maintenance/dette technique continue (mieux gérée en flux
tiré, sans date fixe).

---

## Partie 2 — Comment ça s'est concrètement passé sur Pinball Hetic

### 2.1 Le côté "Scrum" : des incréments livrés par Pull Request

Le repo a **81 Pull Requests mergées** sur `dev`, chacune nommée par type de travail
(`feat/...`, `fix/...`, `refacto/...`). Chaque PR est un **incrément fonctionnel autonome**,
revu avant merge (CI verte = lint + build + test obligatoires). C'est l'équivalent d'une
Definition of Done : un incrément n'est "fini" que s'il passe la CI et est revu.

**Exemple concret à citer à l'oral — la map Zelda** :
- 13 juin : premier commit de la map Zelda
- 17 juin : PR #74 mergée — la map est jouable, c'est un **incrément démontrable**, comme une
  sprint review où on montre "voilà ce qui marche maintenant"
- Équipe : Anthony, Hugo, Florian, Imrane (Web3 HETIC) — 4 personnes, sans rôles Scrum formels
  séparés (pas de PO/SM dédiés, le rôle est partagé selon qui pousse la PR)

### 2.2 Le côté "Kanban" : un backlog de dette technique en flux tiré

Le fichier `docs/TESTABILITY_REFACTORS.md` (647 lignes) **est littéralement un tableau Kanban en
texte**. On y retrouve toutes les caractéristiques du Kanban :

- **Priorisation explicite** : chaque item est tagué `P1`/`P2`/`P3` (comme des colonnes de
  criticité), ex. *"P1 SRP+OCP — décomposer animate en stages ordonnés..."*
- **Items tirés un par un**, chacun avec un identifiant court (`slice 1`, `slice 7a`, `M1` à
  `M8`, `G1` à `G6`, `S1` à `S5`, `D1`/`D2`, `C1`, `N1`/`N2`...) — chaque identifiant = un item
  du board, traité, testé, mergé indépendamment avant de passer au suivant (limite de WIP
  naturelle : un refactor à la fois)
- **États de type board** : le doc parle littéralement de *"BACKLOG VIDE (convergence atteinte)"*
  puis plus tard de *"BACKLOG DRAINÉ — 3 items human-gated"* — l'équivalent d'un board Kanban qui
  atteint zéro dans sa colonne "à faire", avec quelques items bloqués en attente de décision
  humaine (une colonne "Blocked" implicite)
- **Découverte continue de nouveaux items en cours de route**, sans attendre un sprint planning :
  *"P3-discovered backlog"*, *"N1/N2 discovered smells"* — le flux ne s'arrête jamais, contrairement
  à un sprint qui a un périmètre figé au départ
- **Grooming régulier** : des commits comme `docs(test): refresh backlog status post-merge`
  montrent que le backlog est retoiletté après chaque vague de changement, plutôt qu'à date fixe

**Exemple concret à citer à l'oral — le dedup Stranger Things / Zelda** : après le merge de la
map Zelda (17 juin), une duplication de code est apparue avec la map Stranger Things (système de
boss reveal, transitions d'ambiance, cinematic strobe, visuels de bumper — construits en copiant
le pattern existant pour aller vite). Plutôt que de la traiter dans l'urgence, elle a été
**ajoutée au backlog** puis traitée deux semaines plus tard (30 juin – 1er juillet) en 9 commits
dédiés (`M1` à `M8` + `SRP`), 122 fichiers touchés, ~2500 lignes. C'est exactement le principe
Kanban : la dette est visible, priorisée, puis tirée du backlog quand la capacité est là — pas
forcément dans le même sprint que la feature qui l'a créée.

Autre donnée chiffrée intéressante trouvée dans ce backlog : au moment d'un audit de
convergence, le repo comptait **1929 tests unitaires**, avec une couverture globale d'environ
**38%** (et ~57% sur `game-engine` spécifiquement) — utile si tu veux relier ce cours à la
question de couverture de code posée par ailleurs.

### 2.3 Pourquoi cet hybride avait du sens pour une équipe comme la vôtre

- 4 personnes, pas de rôles Scrum formalisés (PO/SM) → un cadre Scrum "pur" avec cérémonies
  strictes aurait été lourd pour la taille de l'équipe
- Les nouvelles features (une map, un écran) sont **plannables et démontrables** → bien adaptées
  à une logique d'incrément type sprint (scope clair, "done" = jouable et mergé)
- La dette technique et les bugs découverts en testant (ex. duplication cross-map, bugs de
  collision, régressions) sont **imprévisibles par nature** → mal adaptés à un sprint planifié à
  l'avance, bien mieux gérés en flux continu priorisé (Kanban), qu'on peut piocher dès qu'il y a
  de la capacité libre entre deux features

---

## Partie 3 — Vocabulaire à avoir en tête pour l'oral

| Terme | Définition courte |
|---|---|
| Sprint | Itération à durée fixe, se termine par un incrément livrable |
| Product/Sprint Backlog | Liste priorisée de tout le travail restant (globale / pour ce sprint) |
| Definition of Done | Critères objectifs pour dire qu'un item est terminé |
| WIP limit | Nombre max d'items travaillés en parallèle, pour finir avant de recommencer |
| Système tiré (pull) | On prend un nouvel item quand on a de la capacité, pas sur planning imposé |
| Lead time / Cycle time | Temps entre la demande et la livraison / entre le début du travail et la livraison |
| Rétrospective | Cérémonie d'amélioration continue du process, à date fixe en Scrum |
| Dette technique | Travail de nettoyage/refactor reporté, qui doit être traité tôt ou tard |
| Code review / Pull Request | Revue du code avant fusion — porte la "Definition of Done" dans ce projet |

### Chiffres clés à retenir pour la slide

- 81 Pull Requests mergées sur `dev`
- Backlog de dette technique dédié, priorisé P1/P2/P3, dans `docs/TESTABILITY_REFACTORS.md`
- Cas Zelda : incrément livré en 4 jours (13→17 juin), dette identifiée et traitée 2 semaines
  après (30 juin–1er juillet), 9 commits, ~2500 lignes
- 1929 tests unitaires au dernier audit, couverture ~38% globale / ~57% sur `game-engine`
