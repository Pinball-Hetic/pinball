# Pinball Hetic

Borne de flipper virtuelle pédagogique — trois écrans Web synchronisés
(playfield 3D, DMD, backglass) pilotés par un boîtier de boutons ESP32.

Stack : Next.js · Three.js · Rapier3D · Socket.io · Bun · Docker.

Packagé pour [Fliphetic](https://pandormedia.github.io/fliphetic/).

## Quick start

```bash
bun install
task docker:dev:up
```

| Écran | URL |
| --- | --- |
| playfield | http://localhost:3333 |
| dmd | http://localhost:3335 |
| backglass | http://localhost:3336 |
| server | http://localhost:3334 |

Arrêt : `task docker:dev:down`.

> **RAM limitée (≤8 Go) :** le compose dev démarre les écrans en
> séquence (playfield compile seul, puis dmd, puis backglass) pour
> éviter les pics Turbopack cumulés. Premier démarrage : ~2 min.
> Recommandé : Docker Desktop → Resources → Swap ≥ 2 Go.

## Structure

Monorepo Bun workspaces.

```
apps/
  playfield/      Écran jeu 3D (Next.js + Three.js + Rapier)
  dmd/            Écran score temps réel (Next.js)
  backglass/      Écran leaderboard (Next.js)
  server/         Backend Express + Socket.io + Prisma
  input-bridge/   Pont USB-Serial ESP32 ↔ Socket.io (Bun)

packages/
  game-engine/    Moteur physique + géométrie (no React)
  shared-types/   Types Socket.io partagés
  config/         ESLint, Prettier, tsconfig
```

## Variables d'environnement

### `playfield`

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `NEXT_PUBLIC_KEYBOARD_MODE` | `direct` | Mode clavier (voir tableau ci-dessous). |
| `NEXT_PUBLIC_SOCKET_URL` | (vide) | URL Socket.io directe (dev). Vide → polling same-origin via rewrite Next.js (prod Fliphetic). |
| `SERVER_INTERNAL_URL` | `http://server:3001` | Cible des rewrites `/api/*` et `/socket.io/*`. |

**Modes clavier** (`NEXT_PUBLIC_KEYBOARD_MODE`) :

| Mode | Comportement | Cas d'usage |
| --- | --- | --- |
| `direct` | Le clavier applique directement le callback métier. Latence ~0. | Dev quotidien, jeu au clavier. |
| `simulate-esp32` | Le clavier émet `dev:simulate-button` au server → routé vers input-bridge mock → parser → `input:button` broadcast à tous. | Valider la chaîne réseau sans hardware ESP32. |
| `disabled` | Clavier de jeu ignoré (sauf `H` debug). | Tester uniquement le vrai ESP32 quand il sera branché. |

Variable build-time Next.js : redémarrer le conteneur après changement
(`docker compose up --force-recreate playfield`).

**Touches** : `←`/`Q` flipper gauche, `→`/`D` flipper droit, `Espace`
charge/release plunger, `H` toggle debug colliders.

### `dmd` et `backglass`

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `NEXT_PUBLIC_SOCKET_URL` | (vide) | Idem playfield. |

### `server`

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `PORT` | `3001` | Port d'écoute HTTP + WebSocket. |
| `DATABASE_URL` | — | Connexion Postgres. |
| `NODE_ENV` | — | `development` désactive le cache global Prisma. |

### `input-bridge`

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `INPUT_BRIDGE_MODE` | `mock` | `mock` (binding virtuel) ou `serial` (ESP32 réel). |
| `SERIAL_PATH` | `/dev/MOCK_ESP32` | Chemin du périphérique en mode `serial`. |
| `SERIAL_BAUD` | `115200` | Baudrate runtime. |
| `SERVER_URL` | `http://server:3001` | URL Socket.io interne au réseau Docker. |

## Scripts

```bash
bun run dev     # tous les workspaces
bun run build
bun run lint
```

Raccourcis Docker dans `Taskfile.yml` (`task docker:dev:up`,
`docker:prod:up`, `clean`, …).

## Documentation

| Sujet | Fichier |
| --- | --- |
| Architecture, règles SRP, conventions | [`CLAUDE.md`](./CLAUDE.md) |
| Modes clavier, env vars playfield | [`apps/playfield/README.md`](./apps/playfield/README.md) |
| Protocole série, modes mock/serial | [`apps/input-bridge/README.md`](./apps/input-bridge/README.md) |
| Manifeste Fliphetic | [`fliphetic.toml`](./fliphetic.toml) |

## Hardware

Le firmware ESP32 n'est pas dans ce dépôt. En attendant, l'input-bridge
tourne en mode `mock` et le clavier émule les boutons (mode
`simulate-esp32` valide la chaîne réseau complète).

## CI

GitHub Actions : `install → lint → build` sur push/PR vers `dev`.

## Auteurs

Anthony, Hugo, Florian, Imxran — Web3 HETIC.
