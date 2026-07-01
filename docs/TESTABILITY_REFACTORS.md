# Backlog refacto — testabilité & clean architecture

> # 🧩 DÉCOMPOSITION God-component `PinballPlayfield.tsx` (2026-07-01)
> Plan de slices (workflow d'analyse `w5wj6iobk`, risk-ascending, animate en dernier).
> Slice 0 (inputs → `createApplyAction`) ✅ FAITE. Slices 1-5 ne touchent PAS le hot
> loop (autonomes). Slices 6-7 = high-risk, human-smoke-only.
>
> | # | Slice | Module | Risque | Test | État |
> |---|---|---|---|---|---|
> | 1 | Keyboard map pur (idForAction fail-fast + key→action) | `keyboardMap.ts` | low | pure | ✅ `c7deb69` |
> | 2 | Flipper bodies + pivot debug factory | `physics/buildFlipperBodies.ts` | med | smoke | ✅ `3cfa972` |
> | 3 | Plunger visual + kinematic body factory | `physics/buildPlungerBody.ts` | med | smoke | ✅ `2157a10` |
> | 4 | Keyboard router + debug-mesh facade | `createKeyboardRouter.ts` + `debug/DebugMeshManager.ts` | med | partial | ✅ `e48b249` |
> | 5 | MapContext factory (~85 L object literal) | `createMapContext.ts` | med | partial | ✅ `509d4e0` |
> | 6 | Init physique/scène (compo async, fail-fast) | `initPlayfield.ts` | high | smoke | ⏸ dep 2-5 (gate smoke) |
> | 7 | Animate hot loop (lift ENTIER, order load-bearing) | `HotLoop.ts` | high | smoke | ⏸ dep 6 (gate smoke) |
>
> **Slices 0-5 FAITES** (2026-07-01/02) : `PinballPlayfield.tsx` 1798→1621 L (−177), 7 modules
> extraits (644 L dont tests), +37 tests, repo vert. **Slices 6-7 gated sur un smoke de 0-5**
> (raison : leur classe de bug = *stale live-binding* est INVISIBLE à tsc et non smoke-able par
> l'agent → un baseline smoké est la seule vérif possible avant de lifter init + hot loop).
>
> **Backlog smells (workflow, dédupliqués)** — au-delà des slices :
> - **P1** SRP+OCP — décomposer animate en stages ordonnés APRÈS le lift (slice 7 fait le move entier d'abord). `PinballPlayfield.tsx:1270-1592`
> - **P1** Circular (managed) — documenter le contrat 2-way `CollisionEventProcessor↔emit` aux seams (garde-fou, PAS un refacto). `:1079` + `createEmitRouter.ts:104`
> - **P2** State Machine — `PlungerStateMachine(now)→{state,progress,meshZ}` (transitions inline dans animate + throttle UI 40ms). `:1507-1540`
> - **P2** DIP — `BallLossDetectionOrchestrator` : unifier stuck + bottomOut + drain Rapier (3 détecteurs, latch idempotent) + `ballLockGuard` dupliqué. `:1395-1500`
> - **P2** Strategy — magic `Z<0.22` (zone drain) → dériver de `mapLayout.sensors`. `:1481`
> - **P2** OCP/DIP — `AlternateWorldController` : état éclaté sur collisionProcessor/mapModule/useGameState (+ predicate release inline). `:1041` + `createEmitRouter.ts:158`
> - **P2** OCP — `BossLifecycleController` : reveal/arm/victory orchestré sur 3 modules. `:1027` + `createEmitRouter.ts:149`
> - **P2** DIP/OCP — `createEmitRouter` : snapshot des lazy getters (getCollisionProcessor 4+/event en cascade bumper) + naming mesh `drop_*→target_*` couplé au GLB + shake amounts littéraux. `createEmitRouter.ts:104,138-206`
> - **P2** ISP — `DmdOrchestrator` : race `game:registered` + tick 100ms hardcodé → `DmdPushPort` + `SocketGateway` mockable. `useDmdOrchestrator.ts:98-136`
> - **P2** DIP — `emitRef.current` bridge remount-fragile (OK car effet sans deps ; passer emit en callback dep à la slice 6). `:1072`
> - **P3** DIP — `AudioOrchestrator` port (appels audio épars sur 5+ sites). `:97,165,258,429,836`
> - **P3** Resource — `DisposalManager` LIFO (disposableGeos/Mats order-sensitive ; folder dans slice 6). `:555,1639`
> - **P3** State — supprimer le local `physicsReady` redondant (source = ref). `:638`
> - **P3** DIP — injecter `now():number` dans animate (tests hermétiques ; slice 7 HotLoopDeps). `:1270`
> - **P3** LSP/OCP — `idForAction ...!.id` non-null-assert = time bomb → Optional/throw (fixé slice 1). `:1184`
>
> **Couplages bloquants (flag)** : lazy forward-refs (`collisionProcessor`/`ballPhysicsInst`/`ballMesh`/`emit` assignés mid-init, lus par animate ET callbacks) → passer en getters/refs JAMAIS snapshots ; cycle `processor↔emit` à garder visible ; `inputState` live-ref partagé (pas de double-buffer dans le lift) ; **ordre des frame-steps load-bearing** (cinematics→map→freeze→flipper→world.step→ballSync→plunger→camera→debug→shake) à préserver byte-for-byte en slice 7.

> # 🎮 AXES D'AMÉLIORATION E2E (user, 2026-07-01) — ✅ TOUS FAITS (à smoke-tester)
> A1 auto-spawn+prompt · A2 DMD vies ×N · A3 respawn Vecna · A4 feedback freeze lettre ·
> A5 fusée palier (playfield+DMD+backglass) · A6 QR timeout 20s. Tout committé, repo vert.
> Décisions user prises :
> - **A1** (UX) Overlay : retirer le prompt "ESPACE ou START pour jouer" + **auto-spawn la bille**
>   dans le couloir (map déjà choisie en amont). `GameOverlay.tsx:329`.
> - **A2** (BUG+UX) DMD vies : `dmd/pages/index.tsx:76` hardcode `TOTAL_LIVES=3` (● only) →
>   desync avec les vies réelles (rescue/bonus > 3). Fix : afficher ● jusqu'à 3, **nombre "×N" si >3**,
>   piloté par `livesRemaining` réel (vérifier que le gain de vie propage bien au DMD).
> - **A3** (BUG) Mort de Vecna → retour monde initial : la bille **respawn au milieu** = injouable.
>   Respawn dans un endroit rattrapable (couloir/spawn normal), pas au centre.
> - **A4** (UX) Pause sur gain de lettre HETIC = feeling "bug" → **garder la pause + feedback
>   playfield** (flash/strobe/texte) pour que ça lise intentionnel + pointe vers le DMD.
> - **A5** (FEATURE) Paliers de score : **remplacer les lumières jaunes playfield par un effet
>   fusée** cohérent + déclencher le cinématique fusée **DMD + backglass** (le takeover fusée
>   existe déjà côté backglass : `strangerthings/backglass/takeover.tsx` `cine-rocket`). Cohérence
>   3 écrans + incite à regarder DMD/backglass.
> - **A6** (FEATURE) Écran QR (outro) : **chrono 20 s** — si plus d'interaction, sortir de l'écran
>   (retour attract/idle) pour ne pas bloquer la borne.
>
> ---
>
> # ✅ BACKLOG VIDE (convergence atteinte)
> Après boucle autonome complète : god-component décomposé (SRP), refacto structurels,
> smells P3, + 4 vagues de fix bugs. **Audit de convergence strict (P1/P2 + God objects) =
> CLEAN sur game-engine, maps, playfield, apps.** Aucun bug ouvert, aucune violation SRP
> flagrante. Repo **100% vert** (1929 tests, tsc, lint), ~86 commits depuis le merge.
>
> **Résidu volontairement laissé (acceptable, non-backlog)** : 2 petits builders inline dans
> `PinballPlayfield` (makeFlipperBody 24 L, plunger) — jugés unsafe à extraire (closures serrées),
> acceptables dans un orchestrateur.
>
> **⚠ À smoke-tester (équipe, changements 3D/gameplay)** : voir les notes "SMOKE" dans les commits
> (flipper feel, boss reveals/victory timing, portal, atmosphères, rescue, milestone ST, drain/
> gameover double-fire, monde alternatif HUD/trail/DMD après cycle, mapId multi-map).
>
> ---
>
> ## 🔄 STATUS POST-MERGE (audit refresh — branche à jour avec `origin/dev`, +50 commits)
>
> ## 🐞 AUDIT RÉGRESSION (range 263d14c..263600f, 214 commits)
> Après le bug **flush ref-detach** (fixé `440421a`), audit des sous-systèmes refactorés :
> **24 bugs (0 P1, 11 P2, 13 P3) + 28 smells** (détail : `tasks/wgxuq36d4.output`).
>
> **✅ FIXÉS (critiques + haute-confiance, tests repro)** :
> - `440421a` **flush pendingPhysics** → **#1 drain/gameover + #2 bumpers** (splice en place, pas de réassign).
> - `40233dc` **collision-state ×4** : boss throttle jamais reset · Bumper sans garde `gameState` ·
>   DropTarget orphelins · BossTargetSensor clock injectée.
> - `0e3dc4c` **flipper #3** : `FlipperZone` sans borne Y + launch X non bridé → yMin/yMax +
>   `FLIPPER_LAUNCH_VX_ATTENUATION`. ⚠ **smoke 3D** (feel flipper).
>
> **✅ 2e vague FIXÉE (tous, tests repro, ⚠ smoke 3D équipe)** :
> - `CinematicDirector.resetGame` appelle `onEnd` (freeze évité).
> - `lastLifeRescue` **activé** (ordering pré-drain) + `onMilestone` ST **re-câblé** (décisions user).
> - `UpsideDownPortal` revealT + double portal-open corrigés.
> - fuites ref caméra + GltfDisplay double-darken (Set guard).
> - backglass : side-effect import retiré + **1 seul socket**.
> - dead code purgé : `FlipperPhysics`, `FLIPPER_SWING_AXIS`, `DrainCollisionHandler`.
>
> → **Tous les bugs d'audit fixables sont fixés.** Reste = **28 smells** (nettoyage SOLID/dedup,
>   par lots) + les 3 refacto human-gated (EventRouter/G2.a'/B3 déjà tranché). Aucun bug ouvert.
>
> ---
>
> ## 🏁 BACKLOG DRAINÉ (refacto testabilité) — 3 items human-gated
> Toutes les extractions/dedup autonomes-sûres sont **FAITES + testées** (S1-S5, G1-G6+G-new,
> M1-M8 + tous follow-ups, D1/D2, C1, N1, SrvRelays, toGameEvent, + follow-ups-de-follow-ups
> M3.a'/G5.b'/M5.a'/M8''/BumperVis''/C1''). **Bugs B1 (Demogorgon glow leak) + B2 (ST bumper
> dispose scale) CORRIGÉS.** Repo vert (test+tsc+lint), global ~38%, game-engine ~57%.
>
> **Reste UNIQUEMENT ce qui exige une décision/vérif humaine (je ne peux pas le clore seul)** :
> 1. **P1-play EventRouter** — extraction du routeur `emit` (PinballPlayfield.tsx, ~600 L,
>    closures sur refs runtime). **Exige un smoke 3D** (code non testé) → session dédiée, tranches + smoke.
> 2. ~~**B3** — ST sans handler `MILESTONE`~~ ✅ **RÉSOLU** (2026-07-01) : MILESTONE émis
>    (`useGameState.nextMilestone` → `onMilestone` → `emit`) + câblé côté module ST
>    (`onMilestone` → `playMilestoneCinematic` + `garlands.rocketBurst`). Parité Zelda faite.
> 3. **G2.a'** — dériver les bounds collider de `layout.geometry.bounds` (vs littéraux ST).
>    **Behaviour-risk multi-map** → exige un smoke colliders par map avant.
>
> → **Le backlog "refacto testabilité" autonome est vide.** Les 3 ci-dessus sont bloqués sur
> toi (smoke 3D / produit / smoke multi-map). Historique ci-dessous.
>
> ---
>
> Bilan initial (avant drain) : **0 FIXED · 7 PARTIAL · 17 OUTSTANDING**. dev a attaqué plusieurs
> items mais en **partiel**, en introduisant de nouveaux trous de test.
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
> 4. **P1 — bilan** : ✅ **M1** (`9543369`), **G3** (`54370ba`), **G2** (`16e9a60`), **M2**
>    (reveal machines), **P1-play/toGameEvent** (`e6bc1b1`) — tous testés, tout vert
>    (game-engine 38→46%). ⛔ **DIFFÉRÉ — P1-play EventRouter + `makeFlipperBody`** :
>    le routeur `emit` (PinballPlayfield.tsx:660, ~600 L) et `makeFlipperBody` (:986) sont des
>    closures entrelacées sur des dizaines de refs/objets runtime (Rapier/Three/scene/cinematics/
>    score/dmd) dans un fichier 2006 L **sans test** → extraction **non vérifiable sans faire
>    tourner le jeu 3D**, risque de régression non prouvable. À faire en **session dédiée** :
>    caractériser par e2e/smoke 3D, OU petites tranches + revue humaine + smoke après chacune.
>    Reste aussi : D1 (DmdRenderer), P2/P3 ci-dessous.
>
> **Découverts pendant la passe P1 (backlog évolutif)** :
> - **N1** `DevGameEventTrigger.type` (shared-types) ↔ le switch de `toGameEvent` sont des
>   unions string tenues en phase **à la main** → un nouveau type de trigger tombe en silence
>   dans `default → null`. Reco : source unique (map type→handler) ou test exhaustif sur l'union. P3.
> - **N2** `PinballPlayfield.tsx` reste ~2000 L ; prochains purs extractibles : le wrapper `emit`
>   + le dispatch `onGameEvent` (~1150-1290) + boss-event (~1242) = cœur de **P1-play EventRouter**. P1.
>
> **✅ P2 FAIT (passe autonome, +118 tests, tout vert)** : G6 (`a197be1` BumperEjection),
> G-new (`85f0ba9` BossCollisionHandler/OCP), G4 (`c0ed2c4` CinematicPhaseMachine), G5 partiel
> (`eccd169` PlayfieldTrimeshRules), M3 (`7052791` AtmosphereBlend), M4 (`05a1098`
> TransitionTimeline), M5 (`4f5798d` WalkPathProgress), S3 (`5adc8d4` createGlobalApiClient),
> D1 (`8c0768b` dmdGrid MVC), D2 (`fde26f0` validators+safeFetch). ⚠ **À SMOKE-TESTER en E2E**
> (Three/Rapier verbatim) : bumper eject, boss locked-hit/target, camera cinématique, colliders
> trimesh, atmosphères ST/Zelda, transitions de monde, walk-in boss, rendu DMD.
>
> **Découverts pendant la passe P2 (backlog évolutif)** :
> - **G5.a** (P2) `PlayfieldTrimeshBuilder` : `isSkipped()` reste THREE-bound (prédicats prennent
>   `THREE.Mesh`). Extraire d'abord les prédicats de noms (`isPinballmapGameplayMesh`/
>   `isFlipperGltfMesh`/`isVisualOnlyGltfName`) en versions pures `string[]`, puis `isSkipped(ancestryNames)`.
> - **G5.b** (P3) `laplacianSmooth`/`doubleSidedGeometry` liés à `BufferGeometry`+`mergeVertices` → ne pas
>   extraire sans helper de weld tuple + snapshot-test des vertices avant/après.
> - **G5.c** (P3) `buildPinballmap` : filtre taille rail inline → `railSubmeshHasPhysics(dims)` pur + test bornes.
> - **M3.a** (P3) `applyMix` tint matériaux/lights/fog encore structurellement dupliqué st/zelda →
>   helper `applyAtmosphereTint(materials, ease, descriptor)` partagé. **M3.b** (P3) math particules
>   spores → module pur `SporeField` testable.
> - **M4.a** (P3) `captureShakeBases`/`restoreShakeBases` dupliqués verbatim → helper `ShakeBasis` partagé.
> - **M5.a** (P2) `Demogorgon`/`Ganondorf TargetVisual` quasi identiques → base/lifecycle composé
>   paramétré par config. **M5.b** (P3) placement surface inline = `surfaceYAtZ(z)+FOOT_LIFT` → helper
>   `surfacePoint(target, footLift)` partagé (4 boss).
> - **D1.a** (P3) `DmdRenderer.makeSprite` couplé au `document` global → param `SpriteFactory`/`CanvasPort`
>   optionnel (default réel) pour testabilité offscreen.
>
> **✅ P3 FAIT (passe autonome, +75 tests, tout vert)** : G5.a (isSkipped pur via ancestryNames),
> M8 (resolveNestState + dueLateHints purs), M6/M7 (PlayfieldCinematicStrobe unifié + port
> `DecorLights`), BumperVis (BumperVisualMath pur partagé), S4 (seams socket explicites → plus de
> `as unknown`) + SrvRelays (table `RELAY_EVENTS`), C1 (input-bridge `BridgeEmitter` port +
> `dispatch` + guard `import.meta.main`), N1 (exhaustivité `toGameEvent`). ⚠ **SMOKE E2E** : colliders
> trimesh, nest marker locked/armed/revealed + hint 45s, strobe/flash 2 maps, bumper pulse/flash.
>
> **Découverts pendant la passe P3 (backlog évolutif, tous P3)** :
> - **G5.c'** `buildPinballmap` (~333-410) IO long → planner pur `classifyPinballmapMesh(ancestryNames,aabbDims)→spec` (pattern ColliderSpecPlanner).
> - **M8'** `zelda/module onGameEvent` ~160 L mêle décisions pures (hetic rollover@5, milestone clip 5k/15k/30k, boss-defeat gating) + IO ; dupliqué avec ST → extraire `resolveHeticProgress`/`selectMilestoneClip` partagés.
> - **M6/M7'** wrapper composition ST = 7 méthodes déléguées (base non sous-classable, TS2416) → ajouter `mountWithDecor` à la base ou composite DecorLights map-level.
> - **BumperVis'** matcher/setup encore divergents st/zelda (naming/kind) ; manque test wiring classe BumperVisuals.
> - **C1'** `openSerial()` mêle IO (stty/createReadStream) + line-buffering (split newline + garde 8192) → extraire un `LineBuffer` pur testable ; config env au scope module → injecter.
> - (N1 a signalé une erreur tsc transitoire sur `PlayfieldTrimeshBuilder` vue pendant l'édition // de G5.a — **faux positif**, repo tsc vert au final.)
>
> **✅ Follow-ups P3 FAITS (+106 tests, tout vert)** : G5.c'(classifyPinballmapMesh) + G2(consts),
> M8'(resolveHeticProgress/selectMilestoneClip), M5.b(surfacePoint), M4.a(ShakeBasis), M3.a
> (AtmosphereTint), M3.b(SporeField), M5.a(BossActorAnimator), M6/M7'(strobe wrapper), BumperVis'
> (BumperPartCollector + tests wiring), C1'(LineBuffer pur), D1.a(SpriteFactory/CanvasPort).
>
> **🐞 BUGS POTENTIELS trouvés (à confirmer/corriger)** :
> - **B1** `DemogorgonTargetVisual.dispose()` ne `dispose()` PAS son glow `PointLight` (nulle juste
>   la ref) → **fuite GPU** ; Ganondorf le fait. P3 (fuite, pas crash).
> - **B2** `strangerthings/systems/BumperVisuals.dispose()` ne **restaure pas** `mesh.scale` à
>   baseScale (Zelda oui) → bumper peut rester scalé après dispose. Divergence = bug probable. P3.
> - **B3** ST `module` n'a **pas de handler MILESTONE** alors que le manifest déclare les clips
>   `milestone_5k/15k/30k/big` → cinématiques de palier ne se déclenchent jamais sur ST (parité
>   Zelda manquante ?). `selectMilestoneClip` prêt à câbler. **Confirmer si voulu.** P3.
>
> **Découverts P3-followups (backlog évolutif)** :
> - **G2.a'** (P2) `ColliderSpecPlanner.planPlayfieldFloor/planWalls` hardcodent les bounds ST →
>   dériver de `layout.geometry.bounds` (thread layout, **behaviour-risk non-ST** → change dédiée + smoke par map).
> - **G5.b'** (P3) `laplacianSmooth`/`doubleSidedGeometry` weld-bound → extraire `laplacianSmoothPositions`/
>   `reverseWoundIndices` purs (weld d'abord dans le caller).
> - **M3.a'** (P2) `SacredRealmAtmosphere` setup-snapshot/dispose-teardown dupliqué → helper capture/restore.
> - **M3.b'/M3.c'** (P3) spores hand-roll Points+canvas ; fog apply/restore dupliqué.
> - **M5.a'** (P3) Demogorgon/Ganondorf encore ~95% identiques après animator → dedup mount/walk plus loin.
> - **M8'/M8''** (P3) bloc HETIC-rollover IO encore dupliqué ST/Zelda → helper `advanceHetic(ctx,count)`.
> - **M67''** (P3) wrapper strobe ST encore boilerplate → `mountWithDecor` base.
> - **BumperVis''** (P3) `update()` punch-timer + apply loop encore dupliqué ; ST manque diagnostic empty-parts.
> - **C1''** (P3) `openSerial` mêle device IO + retry → séparer.
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

### M2. `*Reveal` → `BossRevealPhaseMachine` pure (state pattern) — ✅ FAIT
`{Demogorgon,Ganondorf,Vecna,DarkLink}Reveal.ts` : `update(dt)` mêle séquencement de
phases/timers (pur, regression-prone, **0%**) et mutation Three. **Fix** : machine pure
qui retourne un descripteur `{phase, shade, opacity, strobeOn, …}`, la classe devient un
renderer mince. 2 machines couvrent les 4 boss. **Effort L · plus gros gain systèmes.**

> **Résolu** : 2 machines pures dans `game-engine/infrastructure/`
> — `WalkFightPhaseMachine` (shape A : Vecna + DarkLink, walk→settle→fight→victory,
> sortie walk/settle gated par booléens visuels Three-side) et
> `BlackoutFightPhaseMachine` (shape B : Demogorgon + Ganondorf,
> blackout→reveal→flicker→victory→restore, time-driven + sous-machine
> eleven-assist optionnelle, config flicker-shade injectée). Chaque `*Reveal`
> appelle la machine puis traduit le descripteur en appels Three identiques.
> Extraction VERBATIM (seuils/easing/timers copiés tels quels). Tests de
> caractérisation : 36 (transitions de phase + scalaires aux instants clés).
> Dé-dup : ST et Zelda partagent les 2 machines via `@pinball/game-engine`.

### P1-play. `PinballPlayfield.tsx` God-component (2006 L, useEffect de ~1450 L, 2.9%) — SRP
Violation SRP massive : un `useEffect` fait scene/lights, GLB load, flippers, plunger,
inputs, routeur d'events, render loop, physique ball, debug. **Fix par tranches**, chacune
avec ses tests à créer.

**Règles de code à respecter pour CHAQUE tranche (zéro smell)** :
- `bun:test`, test **colocé** `Foo.test.ts`. **Zéro `any`** (types réels / `unknown` /
  interfaces structurelles). Petites fonctions, early-return, pas de commentaire inutile.
- **Behaviour identique** (move verbatim ; ne pas « améliorer » les seuils/maths).
- Pur extrait = **aucun side-effect import**, aucune dépendance React/Three/Rapier directe
  (sinon injecter). game-engine n'importe **jamais** une map.
- Gate avant commit : `bun test` + `bunx tsc --noEmit` + `bun run lint` **verts**.
- Vérifier les **doublons** avec l'existant (`SnapBallToSurface`, `DetectStuckBall`,
  `ColliderSpecPlanner`…) → réutiliser, ne pas re-créer.

**Tranches + tests à créer** :
1. ✅ **`toGameEvent`** (`e6bc1b1`) — extrait + 20 tests (toutes variantes + défauts).
2. **`buildFlipperHull(mesh)`** → game-engine (depuis `makeFlipperBody:986`). Pur :
   geom mesh → `{ hullPoints: Float32Array, localOffset }`. **Ne PAS** extraire le Rapier
   (`convexHull` collider) ni le Three (debug mesh) — seulement le calcul des points.
   *Tests `FlipperHull.test.ts`* : points hull d'un mesh simple connu ; offset local
   (centrage) ; mesh vide/null ; ordre/déterminisme. Effort S.
3. **Corrections ball par frame** (lane-lock `:1729`, clamp vitesse `:1763`, stuck `:1783`)
   → fns pures retournant `{ translation?, linvel? }` façon `computeSurfaceSnap`.
   *Tests* : lane-lock dans/hors couloir ; clamp quand |v|>max (préserve direction) ;
   stuck quand immobile > seuil. **Vérifier doublon** avec `SnapBallToSurface`/`DetectStuckBall`.
   Effort S-M.
4. **`createPlayfieldScene(rendering)`** (`:507-600`) → helper. *Tests* : lights/fog/exposure
   créés selon `manifest.rendering` (assert sur de vrais objets THREE en bun, façon
   `BossTargetPulse.test`). Effort S-M.
5. ⛔ **`EventRouter`** (le routeur `emit` `:660`, ~600 L) — le gros morceau SRP.
   Extraire un routeur keyé sur `GameEvent.type` avec collaborateurs **injectés**
   (`cinematics`, `cameraDirector`, `screenShake`, `dmd`, `mapModule`, score-setters).
   *Tests `EventRouter.test.ts`* : pour chaque `GameEvent.type`, le bon collaborateur est
   appelé avec le bon payload (spies) ; défaut/no-op pour type inconnu ; pas de double-emit.
   **⚠ DIFFÉRÉ** : closures sur dizaines de refs runtime, **non vérifiable sans smoke 3D** →
   caractériser d'abord (e2e/smoke), OU sortir tranche par tranche avec **revue humaine +
   smoke 3D après chacune**. Ne PAS extraire en aveugle. Effort L.

Ordre conseillé : 2 → 4 → 3 (sûrs, testables) ; 5 en dernier en session dédiée.

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
