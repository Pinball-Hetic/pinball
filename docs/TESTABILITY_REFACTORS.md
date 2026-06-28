# Backlog refacto — testabilité & clean architecture

> Issu de l'audit mené pendant la montée de couverture (branche `test/coverage-pyramid`).
> Chaque item = un endroit où un test a été **dur/impossible** à cause d'une violation
> SOLID ou d'un pattern manquant. Priorité : **couplage faible, encapsulation,
> composition > héritage**. Le repo n'a **aucun héritage de classe** problématique —
> tout le travail est de l'**extraction de cœur pur** + **injection de dépendances**,
> donc faible churn.

## Thèmes transverses (la même cause partout)

1. **DIP violée** — les modules importent des dépendances **concrètes** en dur
   (`prisma`, Rapier, Three.js, socket.io) au lieu de dépendre d'une interface/port.
   → mocking pénible (`mock.module` global → contamination → 3 passes de test côté server).
2. **SRP violée** — logique **pure** (math, machine à états, séquencement/timing,
   routage) **soudée** à l'IO (mutation Three, `world.createCollider`, canvas/DOM,
   `socket.emit`, `httpServer.listen`).
3. **Side-effects à l'import** — `main()`/`listen()`/`new Server()`/socket ouvert au
   chargement du module → impossible d'importer en test sans tout démarrer.
4. **Globals mutables** — `currentMapId`, caches module, état partagé → tests
   order-dependent.
5. **DRY** — systèmes boss st/zelda dupliqués (parfois byte-identiques) → divergences
   latentes (bug réel trouvé, cf. P1-maps).

**Pattern de fix réutilisable (déjà présent dans le repo, à répliquer)** :
fonction pure qui retourne un **objet d'intention** que l'appelant applique —
`computeSurfaceSnap`, `PhysicsWorld.planSteps`, `BossTargetPulse` (testé avec de vrais
objets THREE en bun, sans GL). Injecter l'horloge (`now: () => number`) et les
collaborateurs (constructeur/params).

---

## P1 — ROI maximal

### S1. Server use-cases → ports + injection (supprime le mocking de modules)
`apps/server/src/use-cases/{RegisterScore,Leaderboard}.ts` importent `prisma` +
`GlobalApiClient` en dur (DIP). Seule façon de tester = `mock.module` (global au
process) → c'est **la raison** du script en 3 passes
(`bun test src/infrastructure && … src/use-cases && … src/interface`).
**Fix** : `GameRepository` / `ScoreGateway` / `LeaderboardGateway` (interfaces),
use-cases en factories `createRegisterScore({games, scores})`, adapters Prisma/fetch
en `infrastructure/`. Tests = fakes en mémoire, imports statiques.
**Effort M · supprime 2 des 3 passes · `prisma.ts` n'est plus importé par aucun test.**

### S2. Server `interface/index.ts` → factory + séparation (SRP)
God-module : crée `app`/`httpServer`/`io` à l'import, routes + gateway socket + état
mutable (`currentMapId`) + `listen`. **Fix** : `createApp(deps)` (routes),
`createSocketGateway(deps)` (encapsule l'état map), `createServer(deps)`, et un `main.ts`
qui compose + `listen` (déjà gardé par `import.meta.main`). **Effort M · supprime la 3e
passe → retour à un simple `bun test`.**

### G1. `CollisionEventProcessor` → `routeCollision()` pure
`game-engine/src/infrastructure/CollisionEventProcessor.ts:146-244` : ~120 lignes de
routage/state-machine pures (rôle→event, drop-target, portal latch, throttle boss,
cooldown bump) piégées derrière `RAPIER.EventQueue` + `performance.now()`.
**Fix** : `routeCollision(role, started, gameState, now, state): Outcome[]` + injecter
`now`. **Effort M · plus gros gain de couverture du package.**

### G2. `PlayfieldColliderFactory` → planner `ColliderSpec[]` pur + applier
Chaque méthode mêle trig (translation/halfExtents/quaternion) et `world.createCollider`.
**Fix** : `planShooterLane(layout): ColliderSpec[]` etc. (purs) + `applySpec(world, spec)`
mince. **Effort M-L · sécurise le fichier le plus "tuné" (règle CLAUDE.md).**

### G3. `FlipperSplitter` → `partitionTrianglesByPlaneX()` pure
Partition de triangles / remap d'indices (math pur, prone aux off-by-one) noyée dans
`THREE.Mesh`/`BufferGeometry`. **Fix** : extraire fns pures sur `Float32Array`/indices.
**Effort M.**

### M1. Systèmes boss st/zelda dupliqués → abstraction partagée testée
`BossRevealController.ts` **byte-identique** entre maps ; `BossRevealOrchestrator.ts`
identique sauf un import. **Fix** : monter dans `game-engine` (à côté de `BossTargetPulse`),
supprimer la dépendance `BOSS_IDS`. **Effort S · supprime ~83 lignes dupliquées, 1 test
couvre les 2 maps.**

### M2. `*Reveal` → `BossRevealPhaseMachine` pure (state pattern)
`{Demogorgon,Ganondorf,Vecna,DarkLink}Reveal.ts` : `update(dt)` mêle séquencement de
phases/timers (pur, regression-prone, **0%**) et mutation Three. **Fix** : machine pure
qui retourne un descripteur `{phase, shade, opacity, strobeOn, …}`, la classe devient un
renderer mince. 2 machines couvrent les 4 boss. **Effort L · plus gros gain systèmes.**

### P1-play. `PinballPlayfield.tsx` God-component (2055 L, useEffect de ~1450 L, 2.9%)
**Fix par tranches** : extraire `buildFlipperHull(mesh)` (pur, game-engine), le **routeur
`emit`** (1201-1294) en `EventRouter` injecté, les corrections ball par frame
(lane-lock/clamp/stuck) en fns pures façon `computeSurfaceSnap`, `createPlayfieldScene()`.
**Quick win immédiat** : `toGameEvent` (95-138) est déjà pur module-scope → **juste écrire
un test**. **Effort L (tranches S).**

---

## P2

- **S3. `GlobalApiClient`** : lit `process.env` dans les fns + cache ETag global + `fetch`
  global → `createGlobalApiClient({fetch, config, cache})`. Supprime le save/restore d'env
  et le hack `Date.now()` de clé de cache. **M.**
- **G4. `PlayfieldCameraDirector`** : FSM cinématique (idle→zoomIn→hold→zoomOut) soudée à
  `THREE.Camera`. Extraire `CinematicPhaseMachine` pure. **M.**
- **G5. `PlayfieldTrimeshBuilder`** : `laplacianSmooth`/`doubleSidedGeometry`/`mergeGeos`
  (algos purs sur arrays) + `resolveMaterialParams` + `isSkipped(ancestryNames)` (décision
  pure). Commencer par les 2 derniers (cheap). **L.**
- **G6. `BallPhysics`** : `radialEjectionImpulse`/`sidedEjectionImpulse` purs (couvre le
  guard /0). **S.**
- **M3. Atmosphères** (`UpsideDown`/`SacredRealm`) : intégrateur de cross-fade pur
  identique entre maps + dépendance DOM (`document.createElement` spores) qui bloque
  l'import. Extraire `AtmosphereBlend` + guard/inject `createSporeTexture`. **M.**
- **M4. Transitions** (`UpsideDown`/`Zelda`) : `TransitionTimeline` + `tremorOffset(t)`
  purs partagés. **M.**
- **M5. `*TargetVisual`** : `WalkPathProgress` + `cameraFacingYaw` purs (dupliqués ×4),
  piégés derrière le chargement GLTF. **M.**
- **D1. `DmdRenderer`** : grille pure (modèle) mêlée au canvas/DOM (vue) → injecter un
  `CanvasPort` ou extraire le sprite-building. MVC : grille=modèle, layouts=controller,
  renderer=vue (cf. `AsciiClipPlayer` déjà pur). **M.**

---

## P3

- **C1. `input-bridge/index.ts`** : socket créé + emit + serial + lifecycle + `main()` à
  l'import. Extraire `BridgeEmitter` (port) → `handleLine(line, emitter)` testable ;
  **Strategy** `SerialSource`/`MockSource` au lieu du `if (MODE)` ; garder par
  `if (import.meta.main) main()`. **M.**
- **M6. `PlayfieldCinematicStrobe`** forké entre maps → 1 classe avec port `DecorLights`
  optionnel (DIP). **S-M.**
- **M7. DIP reveals → `DecorLights`** (interface 2 méthodes) au lieu de
  `GarlandLights`/`BumperVisuals` concrets. **S.**
- **M8. `BossNestMarker`/module** : `resolveNestState()` + `dueLateHints()` purs (logique
  de seuil/hint dupliquée entre modules). **S.**
- **S4. ISP socket** : typer `handleConnection` sur une interface `SocketLike`/`Emitter`
  explicite (supprime le `as unknown` des tests). **S.**
- **S5. Leaderboard** : exporter `anonName`/aggregation comme helpers purs. **S.**
- **D2/B1** : `useBackglassData` effet trop large (fetch+validation+socket+poll) → extraire
  validateurs purs + `safeFetch` injectable. **S-M.**

---

## Patterns OK déjà en place (ne PAS toucher)
- `createPinballSocket()` (factory transport), `prisma.ts` (singleton Next/Prisma légitime),
  refs-not-state du playfield (anti-remount Three documenté), `MapModule`/`MapContext`
  (strategy/plugin), `AsciiClipPlayer` (pur), `PhysicsWorld.planSteps`/`computeSurfaceSnap`/
  `BossTargetPulse` (modèles à répliquer). **Aucun héritage de classe à migrer.**

## Bug latent trouvé
`DemogorgonReveal.resetTargetMaterials` (`:498-518`) hardcode des hex de reset alors que
`GanondorfReveal` (`:309-331`) les lit depuis `targetMeshTheme` → divergence. Unifier via M3.

## Ordre conseillé
S1+S2 (server : 3 passes → 1) → G1/G2/G3 (game-engine pur) → M1 (dedup trivial) → M2 (gros
gain maps) → P1-play par tranches (`toGameEvent` test d'abord) → P2 → P3.
