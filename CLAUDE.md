# Pinball Project

## Architecture

Monorepo with two packages:

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

### `packages/app` — Next.js frontend, React components

**Components** (`src/components/pinball/`):
- `PinballPlayfield.tsx` — orchestrator: Three.js scene, animate loop, delegates to game-engine modules
- `GameOverlay.tsx` — score display, lives, hints, game over screen
- `DebugPanel.tsx` — spawn position sliders, ball radius slider, collider debug legend

**Hooks** (`src/hooks/`):
- `useGameState.ts` — score, lives, gameState management, emit callback factory

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

File: `packages/app/public/playfield/pinball-machine.glb`
- Node names use underscores in Three.js (e.g. `pop_bumper`, not `pop bumper`)
- Playfield surface Y formula: `1.068 - ((z + 0.552) / 0.970) * 0.110`
- Playfield X range: [-0.265, 0.265], Z range: [-0.552, 0.418]

## Dev Workflow

- 3 developers work in parallel — respect file boundaries to avoid conflicts
- Run `npx tsc --noEmit -p packages/game-engine/tsconfig.json && npx tsc --noEmit -p packages/app/tsconfig.json` before committing
- No Co-Authored-By in commits
