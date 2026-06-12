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
├── game-engine/    # Physique Rapier + contrats génériques, pas de React
├── shared-types/   # Types Socket.io/score partagés
├── maps/           # Registry (@pinball/maps) + packages de map plugins
│   └── strangerthings/   # @pinball/map-strangerthings (1ère map)
└── config/         # TSconfig + ESLint partagés
```

> **Refacto multi-maps en cours** (branche `refacto/p1-types-ouverts`) : le
> moteur devient générique, les maps sont des packages plugins. Une map
> fournit `manifest` (scoring/rules/glb/elements/meshAliases) + `layout`
> (positions sans mesh) + à terme un `module` (comportement). `getMapPackage(id)`
> (registry) est le SEUL importeur de `@pinball/map-*`. Sens des dépendances :
> `maps → game-engine + shared-types`. Conventions de nommage GLB par préfixe
> de rôle : voir `docs/MAP_AUTHORING.md`.

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
- `BallDiagnostics.ts` — read-only ball tracker: zone classification, lost detection (below floor / out of bounds), reset cause log, launch-flight trace. `verbose` gates console output (HUD `[J]`)

**Use-cases** (game actions, pure logic):
- `LaunchBall.ts` — plunger release + emit BALL_LAUNCHED
- `BumperHit.ts` — radial ejection impulse + emit BUMPER_HIT
- `DrainBall.ts` — emit DRAIN + reset ball to spawn
- `DetectFlipperHit.ts` — rising-edge detection, zone check, directional impulse calculation
- `DetectStuckBall.ts` — stuck timer + nudge impulse when ball stationary

Le couloir plongeur est désormais **physique réelle** (murs + guide courbe
analytiques dans `PlayfieldColliderFactory.createShooterLane`), plus un verrou
latéral côté `PinballPlayfield.tsx` ; l'ancien `AnimateLauncherLane.ts` (animation
scriptée) a été supprimé.

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
- **Tuning shooter lane (couloir plongeur)** → `Ball.ts` (`SHOOTER_LANE_*` / `SHOOTER_GUIDE_*` constants) + `PlayfieldColliderFactory.ts` (`createShooterLane`)
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

Le GLB est **fourni par la map** (`manifest.glb`). ST : `newStrangerthings.glb`
(conventionné role-driven). Les rôles physiques sont déduits du **préfixe** de
mesh (`floor_`/`wall_`/`flipper_`/`bumper_`/`slingshot_`/`target_`/`sensor_`/
`lane_`/`vis_`) via `MeshRoleResolver` (préfixe sur le groupe parent, le plus
spécifique gagne). Tuning matière par mesh dans `manifest.elements`.
**Conventions complètes + checklist export Blender : `docs/MAP_AUTHORING.md`.**
Outils : `python3 scripts/dump-glb-meshes.py <glb>` (rôles résolus),
`task maps:validate -- <id>` (contrat manifest + GLB).

- Playfield surface Y (ST) : `1.068 - ((z + 0.552) / 0.970) * 0.110`
  (`layout.geometry.coefficients`)
- Playfield X range: [-0.265, 0.265], Z range: [-0.552, 0.418]
  (`layout.geometry.bounds`)

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
ESP32 firmware (ou clavier en mode simulate-esp32)
  → port série USB-CDC (texte ex. "BTN:LEFT:DOWN\n")
    → apps/input-bridge
        parse ligne + emit Socket.io 'input:button'/'input:tilt'/'input:sensor'
      → apps/server
          handler typé + io.emit (broadcast À TOUS, y compris l'émetteur)
        → apps/playfield, dmd, backglass
            usePhysicalInputs.ts (hook : socket.io-client + callbacksRef)
          → PinballPlayfield.tsx
              callbacksRef.current.onButton(...) → mute leftTarget/rightTarget,
              plunger.startCharge / launchBallUC.execute, resetGame, ...
```

En mode dev `simulate-esp32`, le clavier court-circuite l'ESP32 mais
réutilise toute la chaîne en amont :

```
clavier playfield → dev:simulate-button → server (route ciblé)
  → input-bridge (room 'input-bridge') → injection sur port mock
    → parser interne relit → input:button → server broadcast → frontends
```

Types et noms d'events centralisés dans
`packages/shared-types/src/socket-events.ts` (`ButtonId`, `ButtonAction`,
`ButtonInput`, `TiltInput`, `SensorInput`, `'input:*'`,
`'dev:simulate-button'`).

### Identification des clients Socket.io

Le server distingue les rôles via `socket.handshake.auth.role` :

- `input-bridge` → joint la room `input-bridge` à la connexion. Sert au
  routage ciblé des events `dev:simulate-button`.
- (aucune auth) → frontends (playfield, dmd, backglass). Traités comme
  clients standards.

Pas de validation cryptographique (réseau Tailscale privé, contexte
projet étudiant).

### Duplication clavier ↔ physique (assumée)

Le callback `physicalInputsRef.current.onButton` est la **source de
vérité unique** des effets sur le game loop (flippers, plunger, reset).
Il est appelé soit par les events réseau `input:button`, soit
localement par `dispatchButton(...)` en mode clavier `direct`. Pas de
duplication d'effet dans `onKeyDown`/`onKeyUp` — ils ne font que router
vers `dispatchButton`. Refacto plus poussée (extraire des helpers
nommés `pressLeft/releaseLeft/...`) reste en TODO.

### Modes clavier (dev)

Le composant `PinballPlayfield` supporte trois modes pour le clavier,
sélectionnés par `NEXT_PUBLIC_KEYBOARD_MODE` (build-time Next.js) :

- **`direct`** (défaut) : `dispatchButton` appelle directement le
  callback métier. Latence nulle. Pour le dev quotidien.
- **`simulate-esp32`** : `dispatchButton` émet `dev:simulate-button` au
  server. Le server **route uniquement vers la room `input-bridge`**
  (identification par `socket.handshake.auth.role === 'input-bridge'`).
  L'input-bridge injecte la ligne protocolaire (`BTN:LEFT:DOWN\n`) sur
  son port mock virtuel ; son propre parser relit et émet `input:button`
  au server, qui broadcast à tous les frontends via `io.emit`. Le
  playfield émetteur reçoit son propre event en retour. **Chemin
  identique à un vrai ESP32**, latence ~30–50 ms aller-retour. Si
  l'input-bridge tourne en mode `serial` (vrai ESP32 branché), les
  events `dev:simulate-button` sont ignorés avec un warning — cohérent
  avec la présence du hardware réel.
- **`disabled`** : touches de jeu ignorées (sauf `H` debug). Pour
  tester uniquement le hardware ESP32 réel.

La touche `H` (toggle debug colliders) reste **toujours active**.

Activer un mode dans `docker-compose.dev.yml` :

```yaml
playfield:
  environment:
    NEXT_PUBLIC_KEYBOARD_MODE: "simulate-esp32"
```

Puis `docker compose -f docker-compose.dev.yml up --force-recreate
playfield` (force pour réinjecter les `NEXT_PUBLIC_*` dans le bundle).

Détails dans `apps/playfield/README.md`.

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
