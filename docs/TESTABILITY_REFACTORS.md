# Backlog refacto — testabilité & clean architecture

> ## 🔄 STATUS POST-MERGE (audit refresh — branche à jour avec `origin/dev`, +50 commits)
>
> Bilan : **0 FIXED · 7 PARTIAL · 17 OUTSTANDING**. dev a attaqué plusieurs items
> mais en **partiel**, en introduisant de nouveaux trous de test.
>
> **⚠️ Régression de merge réparée** : le merge avait droppé le PR #104
> (`GameStateManager` / `currentMapId`) → dead code orphelin + global remis. Corrigé
> (commit `4b2db35`) : `handleConnection(io, socket, state = gameState)` route l'état
> via un `GameStateManager` injectable + tests. **(item S2 : moitié encapsulation faite.)**
>
> **PARTIAL (dev a commencé, reste à finir)** :
> - **S2** seam testable posé (export app/io/handleConnection, guard `import.meta.main`) +
>   `GameStateManager` re-câblé. **Reste** : `createApp/createSocketGateway/createServer`
>   factory + `main.ts` (supprime le side-effect import + la 3e passe de test).
> - **G1** dev a fait CollisionEventProcessor **OCP handler-registry** (#103). **Reste** :
>   injecter `now()` (throttles intestables) + tester les 9 handlers (voir NEW ci-dessous).
> - **G4** dev a extrait les **phase ticks** du camera director (#108). **Reste** : machine
>   de phase 100% pure isolée du `THREE.Camera`.
> - **S4** `IoLike` narrowed (bien) mais `SocketLike` dérivé structurellement → tests encore
>   en `as unknown`. **C1 / D1 / D2** inchangés (toujours partiels).
>
> **NEW smells (post-merge, 15)** — surtout dans le code neuf dev :
> | Prio | Smell | Fichier |
> |---|---|---|
> | ✅ ~~P1~~ | ~~`now()` non injecté dans collision handlers~~ **RÉSOLU** (étape 2, `cbe64ee`) | `BumpCollisionHandler.ts`, `CollisionEventProcessor.ts` |
> | **P2** | **Strategy registry collision introduit mais 0 test** (9 `*CollisionHandler.ts` désormais découplés → cible test facile, gros gain) | `CollisionHandler.ts` + 9 |
> | **P2** | branche **boss-collision hors du registry** (special-case OCP) | `CollisionEventProcessor.ts:175-202` |
> | **P2** | `gameStateUtils` extrait pur mais **non testé** (cible test facile) | `apps/playfield/src/hooks/gameStateUtils.ts:19` |
> | **P2** | `game:over` handler mêle broadcast + persistance + refresh leaderboard | `interface/index.ts:104` |
> | **P2** | `useBackglassData` re-fetch + validation dupliqués | `useBackglassData.ts:32` |
> | **P2** | `PlayfieldColliderFactory` classe 100% statique, World hardcodé | `PlayfieldColliderFactory.ts:19-49` |
> | **P3** | handlers socket = 13 relais inline (pas de table OCP) | `interface/index.ts:71` |
> | **P3** | `BumperVisuals` forké st/zelda (déjà divergent) | `*/systems/BumperVisuals.ts` |
> | **P3** | hint nest = global mutable de closure | `*/module/index.ts` |
> | **P3** | input-bridge emit hardwired au socket global (DIP) | `input-bridge/src/index.ts:44` |
>
> **Bon pattern dev à imiter** : `lastLifeRescue.ts` / `lifeBonus.ts` (factory pure +
> `MapContext` comme port, **testés**) — modèle pour le reste. (DRY-risque si copié par map.)
>
> **Étape 1 FAITE** (commits `7eb3d6d`, `eb7eba1`) : +69 tests sur les 9 `*CollisionHandler`
> (OCP registry) + `gameStateUtils`. game-engine 38→39.9%, playfield 2.9→3.3%, global 30.4%.
> Smell rencontré pendant l'écriture (✅ RÉSOLU étape 2, commit `cbe64ee`) :
> - **`BumpCollisionHandler.ts` + `CollisionEventProcessor.ts`** — horloge ambiante
>   `performance.now()` inline (cooldown bump + throttle boss). **Fix appliqué** : `now: () =>
>   number = () => performance.now()` injecté au constructeur (default = prod inchangée),
>   threadé du processor vers le handler. Test bascule du stub global fragile vers une horloge
>   injectée. → **résout aussi le smell P1 « `now()` non injecté »** (seules ces 2 horloges
>   existaient dans le code collision).
>
> **Plan d'attaque révisé (ROI, sans 3D fragile)** :
> 1. ~~Tester ce que dev a déjà découplé~~ ✅ FAIT (handlers + gameStateUtils, +69 tests).
> 1bis. ~~Injecter `now()` (débloque throttles)~~ ✅ FAIT (étape 2).
> 2. ~~**S2** factory `createApp`/`createSocketGateway`~~ ✅ FAIT (`715652e`) — index.ts =
>    composition root mince (entry/deploy inchangés), tests interface sans `mock.module`.
> 3. ~~**S1** ports use-cases~~ ✅ FAIT (`622b963`) — `GameRepository`/`ScoreGateway`/
>    `LeaderboardGateway` + adapter prisma + factories. **`mock.module` éliminé partout →
>    script server = un seul `bun test` (69 tests)**. Bonus **S5** ✅ (`anonName`/
>    `aggregateCounters` exportés + testés). **S4** partiel : `IoLike` narrowed, cast socket subsiste.
> 4. **Reste** : G2 (planner collider), M2 (reveal machine), P1-play EventRouter (god-component),
>    D1 (DmdRenderer view/model). Détail ci-dessous.
>    ✅ FAITS dans la passe P1 : **M1** (`9543369` dedup orchestrator), **G3** (`54370ba`
>    FlipperGeometrySplit pur), **P1-play/toGameEvent** (`e6bc1b1` extrait + 20 tests).
>
> **Découverts pendant la passe P1 (backlog évolutif)** :
> - **N1** `DevGameEventTrigger.type` (shared-types) ↔ le switch de `toGameEvent` sont des
>   unions string tenues en phase **à la main** → un nouveau type de trigger tombe en silence
>   dans `default → null`. Reco : source unique (map type→handler) ou test exhaustif sur l'union. P3.
> - **N2** `PinballPlayfield.tsx` reste ~2000 L ; prochains purs extractibles : le wrapper `emit`
>   + le dispatch `onGameEvent` (~1150-1290) + boss-event (~1242) = cœur de **P1-play EventRouter**. P1.
>
> > Note coverage : S1/S2 ajoutent du code d'**adapter/composition root** (`PrismaGameRepository`,
> > `index.ts`) intentionnellement non testé en unit (territoire intégration/e2e) → le % brut
> > server descend (≈61%) alors que la **logique métier** (use-cases/routes/gateway/handlers) est ~100%.
> > Le gain S1/S2 est **architectural** (testabilité, DI, single-pass), pas le % brut.
>
> ---

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

### G2. `PlayfieldColliderFactory` → planner `ColliderSpec[]` pur + applier ✅ FAIT
Chaque méthode mêle trig (translation/halfExtents/quaternion) et `world.createCollider`.
**Fix** : `planShooterLane(layout): ColliderSpec[]` etc. (purs) + `applySpec(world, spec)`
mince. **Effort M-L · sécurise le fichier le plus "tuné" (règle CLAUDE.md).**
> **Livré** : `ColliderSpecPlanner.ts` (planners purs, zéro RAPIER) + `ColliderSpec`
> discriminé (`cuboid`/`cylinder`/`ball`). La factory = `plan()` + `applyColliderSpec()`
> mince. `ColliderSpecPlanner.test.ts` (29 tests) couvre translations/halfExtents/
> quaternions/restitution/sensor/role par planner. Comportement identique.
> **Smells résiduels notés en newBacklog** : G2.a (littéraux floor/walls), G2.b
> (matières magiques par type de sensor).

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
- **G2.a. `ColliderSpecPlanner` littéraux géométriques** : `planPlayfieldFloor`/`planLaneFloor`/
  `planWalls` hardcodent encore les bounds (-0.552/0.418/0.270, 0.206/0.265, -0.067…) au lieu
  de dériver de `layout.geometry.bounds`. Comportement préservé (valeurs = ST), mais ces
  planners ne sont pas réellement map-agnostiques. Param par layout quand une 2e map les
  exercera. **S.**
- **G2.b. Matières « magiques » par type de sensor** : restitution/friction/halfExtents des
  sensors (0.034 boss, 0.06×0.015×0.03 slingshot, 0.015×0.01×0.015 pop-zone…) sont des
  constantes inline dans les planners. Les remonter en constantes nommées (ou dans le layout)
  pour documenter l'intention et permettre le tuning par map. **S.**

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
