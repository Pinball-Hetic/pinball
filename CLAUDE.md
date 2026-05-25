# Pinball Project

## Architecture

Monorepo with apps/ (deployable) and packages/ (libraries):

```
apps/
├── playfield/      # Écran jeu 3D (Next.js + Three.js + Rapier)
├── dmd/            # Écran DMD — score temps réel (Next.js + Socket.io)
├── backglass/      # Écran backglass — classement (Next.js + Socket.io)
├── input-bridge/   # Pont USB-Serial (ESP32) ↔ Socket.io (Bun, pas de HTTP)
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

### `apps/dmd` — Écran DMD (score temps réel)
Reçoit événements Socket.io du server, affiche score/combo live.

### `apps/backglass` — Écran backglass (classement)
Fetch leaderboard via API REST + refresh Socket.io.

### `apps/input-bridge` — Pont USB-Serial ↔ Socket.io
Lit le port série de l'ESP32 boutons (USB-CDC), parse un protocole texte
ligne par ligne, relaye les events au `server` en Socket.io. Pas de HTTP,
pas de port exposé. Deux modes : `mock` (binding virtuel + scénario de
démo, défaut en dev) et `serial` (port réel sur la borne). Voir
`apps/input-bridge/README.md` pour le protocole et les vars d'env.

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

> ⚠️ Cette table décrit le dev **hors Fliphetic** (compose direct sur poste
> de développeur). En **prod Fliphetic** les ports hôtes des écrans sont
> dynamiques (`"0:3000"`, attribués par Docker, résolus par Fliphetic via
> `docker compose port`). `server` et `db` n'ont **aucun** port hôte —
> communication interne au réseau Docker uniquement.

| App | Port hôte (dev local) | Port conteneur |
|-----|-----------------------|----------------|
| playfield | dynamique | 3000 |
| dmd | dynamique | 3000 |
| backglass | dynamique | 3000 |
| server | (interne) | 3001 |
| input-bridge | (aucun) | — |
| db | (interne) | 5432 |

## Intégration Fliphetic

Cette app est packagée pour [Fliphetic](https://pandormedia.github.io/fliphetic/)
(orchestrateur de borne pédagogique PANDOR Media). Voir `fliphetic.toml`
à la racine pour le manifeste.

### Cycle de chargement (côté borne)

1. `git fetch` + checkout de la branche `[deploy].ref` (= `dev`).
2. `docker compose down` de l'app précédente.
3. Flash ESP32 (désactivé tant que le firmware n'existe pas).
4. `docker compose up` + attente des healthchecks (`ready_timeout = 120`).
5. Résolution des écrans via `docker compose port` → chaque kiosque
   Chromium pointe sur `http://<host>:<port_dynamique>/`.

### Règles d'or

- **Pas de port hôte fixe** sur les services écrans : toujours `"0:3000"`.
- **`db` et `server` ne s'exposent pas** sur l'hôte.
- **Healthcheck obligatoire** sur tout service dont on dépend
  (`condition: service_healthy`). Fliphetic se fie à `healthy` pour
  basculer les kiosques.
- **Ne jamais hardcoder `localhost:<port>`** dans les frontends :
  Chromium tourne sur l'hôte avec un port dynamique. Utiliser des URLs
  **same-origin** (cf. ci-dessous).
- **Les events réseau ne doivent JAMAIS déclencher de re-render React
  dans `playfield`** : Three.js démonterait la scène. Utiliser des refs
  (`useRef` + callbacks) — pattern identique à `useGameState`. Cf.
  `usePhysicalInputs.ts` qui expose un `callbacksRef` rempli depuis le
  `useEffect` principal de `PinballPlayfield.tsx`.

### Socket.io same-origin (résolution Étape 5)

`server` n'a pas de port hôte sous Fliphetic. Pour que les frontends
puissent ouvrir une Socket.io vers lui :

- Chaque `next.config.js` (playfield, dmd, backglass) **proxy** les
  chemins `/socket.io/:path*` et `/api/:path*` vers
  `${SERVER_INTERNAL_URL}` (défaut : `http://server:3001` = DNS Docker).
- Les hooks Socket.io détectent `NEXT_PUBLIC_SOCKET_URL` :
  - **défini** (dev, port serveur exposé `3334:3001`) → `io(url, {
    transports: ['websocket'] })`, WS direct.
  - **undefined** (prod Fliphetic, same-origin via rewrite) → `io(undefined,
    { transports: ['polling'] })`, **polling pur**.
- Pourquoi polling en Fliphetic : les rewrites Next.js ne proxient pas
  les upgrades WebSocket (`HTTP/1.1 Upgrade` → 101 Switching Protocols
  perd l'upgrade après le rewrite). Latence polling ~50–100 ms,
  acceptable pour boutons/score. À reconsidérer si gameplay compétitif
  exigeant (sidecar reverse proxy ou exposition `server` via Fliphetic).
- Dev local hors Docker : surcharger
  `SERVER_INTERNAL_URL=http://localhost:3001` (pour les rewrites) et/ou
  `NEXT_PUBLIC_SOCKET_URL=http://localhost:3334` (pour les clients
  Socket.io en WS direct).

### Protocole ESP32 ↔ input-bridge

**USB-Serial CDC**, texte UTF-8 ligne par ligne, baud 115200.

```
BTN:<ID>:<DOWN|UP>        # boutons (LEFT/RIGHT/PLUNGER/START/...)
TILT:TRIGGERED            # capteur tilt
SENSOR:<ID>:<VALUE>       # capteur générique
```

MQTT, WebSocket Wi-Fi et HID clavier ont été évalués et **rejetés**
(latence, complexité broker, perte de contrôle des codes touche). Ne pas
rouvrir ce débat sans raison nouvelle. Le serial-CDC est immédiat,
debugable (`cu`/`screen`), tolère le reboot USB ESP32 après flash
Fliphetic (l'`input-bridge` retente l'ouverture 60×500 ms).

### Flow complet inputs physiques

```
ESP32 firmware
  → port série USB-CDC (texte ex. "BTN:LEFT:DOWN\n")
    → apps/input-bridge
        parse ligne + emit Socket.io 'input:button'/'input:tilt'/'input:sensor'
      → apps/server
          handler typé + socket.broadcast.emit (renvoie à tous SAUF l'émetteur)
        → apps/playfield, dmd, backglass
            usePhysicalInputs.ts (hook : socket.io-client + callbacksRef)
          → PinballPlayfield.tsx
              callbacksRef.current.onButton(...) → mute leftTarget/rightTarget,
              plunger.startCharge / launchBallUC.execute, resetGame, ...
```

Types et noms d'events centralisés dans
`packages/shared-types/src/socket-events.ts` (`ButtonId`, `ButtonAction`,
`ButtonInput`, `TiltInput`, `SensorInput`, `'input:*'`).

### Duplication clavier ↔ physique (assumée)

`PinballPlayfield.tsx` contient deux chemins quasi identiques :
`onKeyDown/onKeyUp` (clavier) et `physicalInputsRef.current.onButton`
(socket). C'est **volontaire** pour cette étape (changements localisés,
lisibles, faciles à reverter). Refacto DRY en TODO ci-dessous. Ne pas
extraire de helpers sans accord.

### TODO Fliphetic (hors session courante)

- **Firmware ESP32** : tant que les specs hardware HETIC ne sont pas
  reçues (variante ESP32, câblage boutons/LEDs/vibreur, nombre de
  boutons, bandeau LED adressable), ne pas écrire de firmware.
- **`.github/workflows/firmware.yml`** : build PlatformIO + `esptool
  merge_bin` + commit du `.bin`. À faire en même temps que le firmware.
- **Activer `[esp32.buttons]`** dans `fliphetic.toml` (décommenter)
  quand le firmware existe + nom du device confirmé côté admin borne.
- **Activer `devices:`** du service `input-bridge` quand un chemin
  `/dev/serial/by-id/...` stable sera disponible. Passer
  `INPUT_BRIDGE_MODE=serial`.
- **Pré-build images Docker GHCR** : les builds Next.js prennent
  plusieurs minutes au chargement Fliphetic. Optimisation perf à faire
  en session dédiée (cf. Recette 4 de la doc Fliphetic).
- **`[deploy].strategy = "tag"`** quand l'app est stable.
- **`fliphetic validate .`** en local (nécessite le CLI Fliphetic).
- **Supprimer le scénario démo mock** d'`apps/input-bridge/src/index.ts`
  dès qu'un firmware réel émet des events.
- **Refacto inputs DRY** : extraire helpers `pressLeft/releaseLeft/
  chargePlunger/releasePlunger` partagés entre clavier et physique
  (`PinballPlayfield.tsx` + `usePhysicalInputs`).
- **Logique tilt** : pénalité, désactivation flippers temporaire,
  cooldown. Pour l'instant l'event est seulement loggé côté playfield.
- **Logique sensor analogique plunger** : force = valeur capteur au lieu
  de timing manuel. Touche `LaunchBall` + UI plunger.
- **Renommer `ButtonId`** (`LEFT/RIGHT/PLUNGER/START`) selon les vrais
  boutons HETIC quand les specs sont reçues.
