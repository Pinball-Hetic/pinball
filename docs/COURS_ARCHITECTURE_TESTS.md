# Cours — Architecture du projet & Tests unitaires

> Document de référence rédigé à partir de l'état réel du repo (pas seulement du CLAUDE.md) le 2026-07-07.
> Objectif : comprendre comment le projet est organisé et comment fonctionnent les tests, pour pouvoir
> naviguer dans le code et écrire/lire des tests en autonomie.

---

## Partie 1 — Architecture

### 1.1 La forme générale : un monorepo

Le projet est un **monorepo** géré avec **Bun** (workspaces), pas npm/yarn/pnpm. Concrètement, à la racine :

```
apps/       → des programmes qu'on déploie tels quels (un par écran/service)
packages/   → des librairies internes, réutilisées par les apps, pas déployées seules
```

Le fichier racine `package.json` déclare les workspaces (`apps/*`, `packages/*`, `packages/maps/*`) et des
scripts globaux comme `bun run test`, qui exécutent la commande dans **chaque package** via `bun --filter "*"`.

### 1.2 Les 5 apps

| App | Rôle |
|---|---|
| `playfield` | L'écran de jeu 3D — Next.js + Three.js (rendu) + Rapier (physique) |
| `dmd` | L'écran "DMD" (le petit écran de score façon flipper rétro) — Next.js + Socket.io, purement réactif aux events reçus |
| `backglass` | L'écran de classement/leaderboard — Next.js, fetch REST + refresh Socket.io |
| `server` | Le backend — Express + Prisma + WebSocket, source de vérité du score et du classement |
| `input-bridge` | Le pont USB-Série ↔ Socket.io — lit les events de la carte ESP32 (boutons physiques) et les relaie au server. Pas de serveur HTTP, pas de port exposé |

Une règle importante à retenir : **playfield ne doit jamais re-render React quand un event réseau arrive**
(sinon Three.js démonte la scène 3D). C'est pour ça que les inputs passent par des `useRef` et pas du `useState`.

### 1.3 Les packages (les briques réutilisables)

- **`game-engine`** — toute la physique et la logique de jeu, **sans React**. Organisé en 3 couches (clean
  architecture) :
  - `domain/` — constantes et types purs (positions des bumpers, types d'events, constantes de flipper...)
  - `infrastructure/` — tout ce qui touche Rapier (le moteur physique) et Three.js (colliders, découpe des
    flippers, traitement des collisions...)
  - `use-cases/` — les actions de jeu, en logique pure (lancer la bille, gérer un bumper touché, faire
    "drainer" la bille...)

  Règle SRP à retenir : chaque fichier a une seule responsabilité. Le CLAUDE.md du repo donne une table
  précise "si je veux changer X → je touche le fichier Y", à consulter avant de modifier la physique.

- **`maps/`** — le système de "cartouches" de jeu (Stranger Things, Zelda...). Le moteur (`game-engine`) est
  générique ; chaque map est un package plugin (`@pinball/map-strangerthings`, etc.) qui fournit son
  contenu (règles de score, sons, textures, écrans dmd/backglass). Un **registry central**
  (`packages/maps/index.ts`, `backglass.ts`, `dmd.ts`) est le **seul** endroit autorisé à importer
  `@pinball/map-*` — une règle ESLint (`no-restricted-imports`) interdit d'importer une map directement
  ailleurs, pour garder le moteur générique.

- **`shared-types`** — les types partagés entre toutes les apps (events Socket.io, contrats de score,
  boutons du cabinet). C'est la source unique de vérité pour éviter que server/playfield/dmd divergent.

- **`dmd-core` / `ui`** — logique d'affichage bas niveau du DMD, composants UI partagés.

### 1.4 Un parcours concret : du bouton physique à l'écran

C'est le meilleur moyen de comprendre comment tout s'articule :

1. Un joueur appuie sur un bouton physique → l'ESP32 envoie une ligne texte sur USB-série
   (`BTN:WHITE_LEFT:DOWN`).
2. `input-bridge` lit cette ligne, la parse, et émet un event Socket.io (`input:button`) au `server`.
3. Le `server` reçoit l'event et le **rebroadcast à tout le monde** (`io.emit`), y compris à
   `input-bridge` lui-même.
4. `playfield` reçoit l'event dans un hook (`usePhysicalInputs.ts`), qui remplit un `callbacksRef`
   (pas de re-render !). Ce callback traduit l'id physique du bouton en **action de jeu**
   (`FLIP_LEFT`, `PLUNGE`...) via une table de correspondance unique (`BUTTON_ACTION`), puis déclenche
   l'effet réel (flipper qui bouge, plunger qui charge...).
5. En parallèle, `dmd` et `backglass` reçoivent aussi les events pertinents (score, etc.) et mettent à
   jour leur affichage.

En dev, il existe un mode `simulate-esp32` qui permet de tester toute cette chaîne au clavier sans
ESP32 physique branché, en repassant par exactement le même chemin (via `input-bridge`).

### 1.5 Où regarder selon ce qu'on veut changer

Cette table (issue du CLAUDE.md du repo) est le réflexe à avoir avant de toucher au jeu 3D :

| Je veux changer... | Je vais dans... |
|---|---|
| Position/taille d'un collider | `PlayfieldColliderFactory.ts` |
| Quels meshes du GLB ont une physique | `PlayfieldTrimeshBuilder.ts` |
| Réglage des flippers | `FlipperConstants.ts` + `DetectFlipperHit.ts` |
| Physique bumper/bille | `Ball.ts` + `BumperHit.ts` |
| Nouveau capteur/target | `Ball.ts` + `PlayfieldColliderFactory.ts` + `CollisionEventProcessor.ts` + `GameEvents.ts` |
| L'UI (score, overlay) | `GameOverlay.tsx` / `DebugPanel.tsx` |
| L'état de jeu (vies, score) | `useGameState.ts` |

---

## Partie 2 — Les tests unitaires

### 2.1 Le framework : `bun test`, pas Jest ni Vitest

Le repo n'utilise **ni Jest ni Vitest** : les tests tournent avec **`bun test`**, le test-runner intégré à
Bun. La syntaxe ressemble beaucoup à Jest (`describe`, `test`, `expect`, `beforeEach`) mais on les importe
explicitement depuis `bun:test` :

```ts
import { test, expect, describe, beforeEach } from 'bun:test'
```

### 2.2 Convention : les tests vivent à côté du code, pas dans un dossier séparé

Il n'y a pas de dossier `__tests__/` ni `test/`. Chaque fichier source a son test **juste à côté**, avec le
même nom + `.test.ts` (ou `.test.tsx` pour les composants React) :

```
packages/game-engine/src/domain/Plunger.ts
packages/game-engine/src/domain/Plunger.test.ts   ← à côté, pas dans un sous-dossier
```

Le repo compte aujourd'hui **171 fichiers de test**, répartis dans quasiment tous les packages/apps.

### 2.3 Anatomie d'un test — exemple réel (`Plunger.test.ts`)

```ts
import { test, expect, describe, beforeEach } from 'bun:test'
import { Plunger, type PlungerState } from './Plunger'

let plunger: Plunger

beforeEach(() => {
  plunger = new Plunger()          // état frais avant CHAQUE test
})

describe('startCharge', () => {
  test('marks charging and records the start time', () => {
    plunger.startCharge(1000)
    const state = plunger.getState()
    expect(state.isCharging).toBe(true)
    expect(state.chargeStartTime).toBe(1000)
  })
})
```

Ce qu'il faut en retenir :
- `describe` regroupe des tests qui parlent de la même méthode/comportement.
- `beforeEach` réinitialise l'état pour que les tests soient indépendants les uns des autres.
- `test(...)` = un scénario ; `expect(x).toBe(y)` = une assertion.
- Comme `game-engine` est de la logique pure (pas de React, pas de DOM), ces tests sont rapides et
  simples : on instancie une classe, on l'utilise, on vérifie l'état.

### 2.4 Tests de composants React (dmd, backglass)

Ces apps ont des composants React (`.test.tsx`). Comme `bun test` n'a pas de vrai navigateur, le repo
utilise **`happy-dom`** (un DOM simulé) pour que `render(<Component />)` fonctionne. C'est activé via un
fichier `bunfig.toml` dans chaque app concernée :

```toml
# apps/dmd/bunfig.toml
[test]
preload = ["./happydom.ts"]
```

`@testing-library/react` et `@testing-library/jest-dom` sont utilisés par-dessus pour écrire des
assertions lisibles (`toBeInTheDocument()`, etc.).

### 2.5 Comment lancer les tests

- Un seul package : se placer dans le dossier et lancer `bun test` (ex. `cd packages/game-engine && bun test`)
- Un seul fichier : `bun test src/domain/Plunger.test.ts`
- Filtrer par nom de test : `bun test -t "startCharge"`
- Tout le monorepo d'un coup (comme en CI) : `bun run test` **à la racine** (ça lance `bun --filter "*" test`,
  c'est-à-dire le script `test` de chaque `package.json`)

### 2.6 ⚠️ Point d'attention important sur `playfield`

En vérifiant chaque `package.json`, il y a une anomalie à connaître :

```json
// apps/playfield/package.json
"test": "bun test src/audio"
```

Alors que **toutes les autres apps/packages** ont `"test": "bun test"` (= tout le dossier `src`),
**`playfield` restreint son script `test` au seul dossier `src/audio`**.

Concrètement : `playfield` a **18 fichiers de test**, mais **17 d'entre eux** (ceux dans
`components/pinball/`, `hooks/`, etc.) **ne sont exécutés ni par `bun run test` à la racine, ni par la CI**
(`ci.yml` appelle exactement `bun run test`). Seul `PlayfieldMusicDirector.test.ts` (dans `src/audio`)
tourne réellement dans le pipeline global.

C'est très probablement lié à la remarque coverage d'Anthony : si quelqu'un mesure "le %" en se basant sur
ce qui tourne réellement en CI, tout un pan de `playfield` (17 fichiers de test bien réels, qui existent
et ont l'air corrects) est invisible. Deux pistes à creuser avec l'équipe : soit c'est volontaire (ces
tests nécessitent un setup — genre Three.js/Rapier — pas encore branché en CI), soit c'est un oubli et il
suffit de changer `"test": "bun test"` dans `apps/playfield/package.json`.

### 2.7 Les tests end-to-end (Playwright)

En plus des tests unitaires, il y a 3 specs Playwright dans `tests/e2e/` (`playfield.spec.ts`,
`dmd.spec.ts`, `backglass.spec.ts`). Ce sont des tests "smoke" (juste vérifier que ça charge), lancés avec
`bun run test:e2e` (= `playwright test`). Ils ont besoin de la stack **Docker lancée en vrai**
(`docker compose up`) — sans ça, ils échouent/skip, c'est normal et documenté dans le config.

Pyramide de tests du projet : beaucoup de tests unitaires (rapides, logique pure) → peu de tests
e2e (lents, bout en bout, juste pour un smoke test général).

### 2.8 La CI (GitHub Actions)

Le pipeline (`.github/workflows/ci.yml`) fait, dans l'ordre, sur chaque push/PR vers `dev` :

```
install → lint (tous les packages) → build (tous les packages) → test (tous les packages) → validate-map
```

Point important : **il n'y a aujourd'hui aucun seuil de couverture configuré dans la CI**. Le pipeline
vérifie juste que les tests passent (vert/rouge), pas un pourcentage minimum.

### 2.9 Et la couverture de code (%), concrètement ?

Bun sait générer un rapport de couverture nativement :

```bash
bun test --coverage
```

Ça affiche un tableau par fichier avec le % de lignes/fonctions couvertes par au moins un test. Comme rien
n'impose ce chiffre en CI pour l'instant, l'objectif "X% de couverture" que t'a donné Anthony est
vraisemblablement un objectif d'équipe à suivre manuellement — pas (encore) un gate automatique. Avant de
viser un chiffre, ça vaut le coup de mesurer l'état actuel package par package (en gardant en tête le point
2.6 : sans corriger le script `test` de `playfield`, la mesure sera fausse pour cette app).

---

## Partie 3 — Pour la suite : ce qu'il reste à apprendre

Dans un ordre raisonnable si tu pars de zéro :

1. **Bun** — comprendre `bun install`, `bun run <script>`, `bun --filter`, la différence avec npm
2. **TypeScript de base** — types, interfaces, génériques simples (tout le repo est en TS strict)
3. **La règle SRP/clean architecture** du repo (domain/infrastructure/use-cases) — c'est la grille de
   lecture pour naviguer dans `game-engine`
4. **React + Next.js** — pour toucher aux 3 apps front (playfield/dmd/backglass)
5. **Three.js + Rapier** — uniquement si tu touches à la 3D/physique du playfield
6. **Socket.io** — comment les events circulent (cf. Partie 1.4)
7. **Docker Compose** (dev vs prod) — et pourquoi les ports sont dynamiques en prod Fliphetic
8. **Le système de maps-plugins** — comment ajouter/modifier une map sans casser l'étanchéité avec le core
9. **Le protocole ESP32 ↔ input-bridge** — seulement si tu touches au firmware/hardware

Suggestion : commence par (1)+(2)+(3), fais tourner `bun test` dans `game-engine` pour t'entraîner à lire/
écrire un test simple, puis remonte vers React/Next.js une fois à l'aise avec la logique pure.
