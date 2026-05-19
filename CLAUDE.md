# Pinball Project

## Architecture

Monorepo with apps/ (deployable) and packages/ (libraries):

```
apps/
├── playfield/      # Écran jeu 3D (Next.js + Three.js + Rapier)
├── scoreboard/     # Écran score temps réel (Next.js + Socket.io)
├── leaderboard/    # Écran classement (Next.js + Socket.io)
└── server/         # Backend API + WebSocket (Express + Prisma)

packages/
├── game-engine/    # Physique Rapier, pas de React
├── shared-types/   # Types Socket.io/score partagés
└── config/         # TSconfig + ESLint partagés
```

### `packages/game-engine` — Physics, game logic, no React
Clean architecture: domain / infrastructure / use-cases.

**Domain** (constants, types, state holders):
- `Ball.ts` — ball physics constants, bumper/wall/sensor positions from GLB
- `GameEvents.ts` — event union type (BUMPER_HIT, DRAIN, SLINGSHOT_HIT, etc.)
- `Plunger.ts` — plunger charge/release state
- `FlipperConstants.ts` — flipper tuning (swing, power, zones), plunger timing, lives
- `PlayfieldGeometry.ts` — `surfaceYAtZ()` shared utility, drain Z threshold

**Infrastructure** (Rapier physics, Three.js geometry):
- `PhysicsWorld.ts` — Rapier world wrapper, gravity, timestep
- `BallPhysics.ts` — ball rigid body + collider, spawn/reset, eject force, mesh sync
- `PlayfieldTrimeshBuilder.ts` — GLB mesh filtering (SKIP set), trimesh collider creation
- `PlayfieldColliderFactory.ts` — ALL collider creation: walls, lane floor, barriers, bumpers, sensors, drain, drop targets + optional debug meshes
- `FlipperSplitter.ts` — split single GLB flipper mesh into left/right halves + pivot hinge setup
- `CollisionEventProcessor.ts` — Rapier collision event dispatch: bumpers, drain, slingshots, pop zones, rocket ramp, drop targets (state machine)

**Use-cases** (game actions, pure logic):
- `LaunchBall.ts` — plunger release + emit BALL_LAUNCHED
- `BumperHit.ts` — radial ejection impulse + emit BUMPER_HIT
- `DrainBall.ts` — emit DRAIN + reset ball to spawn
- `DetectFlipperHit.ts` — rising-edge detection, zone check, directional impulse calculation
- `AnimateLauncherLane.ts` — 3-phase scripted lane animation (straight, curve, release)
- `DetectStuckBall.ts` — stuck timer + nudge impulse when ball stationary

### `apps/playfield` — Next.js frontend, jeu 3D

**Components** (`src/components/pinball/`):
- `PinballPlayfield.tsx` — orchestrator: Three.js scene, animate loop, delegates to game-engine modules
- `GameOverlay.tsx` — score display, lives, hints, game over screen
- `DebugPanel.tsx` — spawn position sliders, ball radius slider, collider debug legend

**Hooks** (`src/hooks/`):
- `useGameState.ts` — score, lives, gameState management, emit callback factory

### `apps/scoreboard` — Écran score temps réel
Reçoit événements Socket.io du server, affiche score/combo live.

### `apps/leaderboard` — Écran classement
Fetch leaderboard via API REST + refresh Socket.io.

### `packages/shared-types` — Types partagés
Types Socket.io (ServerToClientEvents, ClientToServerEvents), ScoreUpdate, LeaderboardEntry.

## SRP Rules

Each file has ONE responsibility. When modifying:

- **Changing collider positions/sizes** → `PlayfieldColliderFactory.ts`
- **Changing which GLB meshes have physics** → `PlayfieldTrimeshBuilder.ts` (SKIP set)
- **Tuning flipper zones/power** → `FlipperConstants.ts` + `DetectFlipperHit.ts`
- **Tuning bumper/ball physics** → `Ball.ts` (constants) + `BumperHit.ts` (impulse logic)
- **Adding new sensors/targets** → `Ball.ts` (positions) + `PlayfieldColliderFactory.ts` (colliders) + `CollisionEventProcessor.ts` (event handling) + `GameEvents.ts` (event type)
- **Changing lane animation** → `AnimateLauncherLane.ts`
- **Changing UI layout** → `GameOverlay.tsx` or `DebugPanel.tsx`
- **Changing game state (lives, score)** → `useGameState.ts`

Never put physics code in React components. Never put React code in game-engine.

## Physics

- Engine: Rapier3D (`@dimforge/rapier3d-compat`)
- Gravity: straight down `{0, -9.81, 0}` — playfield tilt is baked into GLB trimesh
- Ball: CCD enabled, radius 0.01474, mass 0.08
- Flipper hit: manual impulse detection (not Rapier collision) — kinematic bodies don't push reliably
- Lane launch: fully scripted animation, no physics in lane
- Trimesh: only `playfield` + `playfield_sides` + `shoulder` + `slingshot` meshes

## GLB Model

File: `apps/playfield/public/playfield/Pinballmap.glb`
- Node names use underscores in Three.js (e.g. `pop_bumper`, not `pop bumper`)
- Playfield surface Y formula: `1.068 - ((z + 0.552) / 0.970) * 0.110`
- Playfield X range: [-0.265, 0.265], Z range: [-0.552, 0.418]

## Ports

| App | Port hôte | Port conteneur |
|-----|-----------|----------------|
| playfield | 3333 | 3000 |
| server | 3334 | 3001 |
| scoreboard | 3335 | 3000 |
| leaderboard | 3336 | 3000 |
| db | 5432 | 5432 |
