# @pinball/input-bridge

Pont USB-Serial ↔ Socket.io. Lit le port série exposé par l'ESP32 boutons,
parse un protocole texte ligne par ligne, et relaye les événements au
`@pinball/server` via Socket.io.

## Protocole série (USB-CDC)

Texte UTF-8, séparateur `\n`, baudrate par défaut **115200**.

| Trame entrée                | Event Socket.io émis           |
| --------------------------- | ------------------------------ |
| `BTN:<ID>:DOWN`             | `button` `{ id, action:'DOWN' }` |
| `BTN:<ID>:UP`               | `button` `{ id, action:'UP' }`   |
| `TILT:TRIGGERED`            | `tilt`   `{ state:'TRIGGERED' }` |
| `SENSOR:<ID>:<VALUE>`       | `sensor` `{ id, value: number }` |

Lignes vides ignorées. Format invalide → log d'erreur, pas de crash.

## Variables d'environnement

| Var                  | Défaut                | Rôle                                                |
| -------------------- | --------------------- | --------------------------------------------------- |
| `INPUT_BRIDGE_MODE`  | `mock`                | `mock` (binding virtuel) ou `serial` (port réel).   |
| `SERIAL_PATH`        | `/dev/MOCK_ESP32`     | Chemin du périphérique en mode serial.              |
| `SERIAL_BAUD`        | `115200`              | Baudrate **runtime** (≠ baudrate de flash esptool). |
| `SERVER_URL`         | `http://server:3001`  | URL Socket.io interne au réseau Docker.             |

## Modes

### `mock` (défaut en dev / CI)

Crée un port virtuel via `@serialport/binding-mock`. Un scénario de démo
émet une paire `BTN:<ID>:DOWN`/`UP` aléatoire (LEFT/RIGHT/PLUNGER/START)
toutes les 2 secondes — à supprimer dès que le firmware ESP32 existe.

### `serial` (borne en production)

Ouvre `SERIAL_PATH` via `@serialport/bindings-cpp`. Réessaie 60 fois
toutes les 500 ms (≈30 s) pour tolérer le reboot USB de l'ESP32 après
un flash Fliphetic.

## Activer le mode serial dans Docker Compose

1. Brancher l'ESP32 ; identifier le chemin stable :
   ```sh
   ls /dev/serial/by-id/
   ```
2. Dans `docker-compose.yml`, décommenter le bloc `devices:` du service
   `input-bridge` et remplacer le chemin source par le bon.
3. Forcer `INPUT_BRIDGE_MODE=serial` (env override compose ou `.env`).
4. `docker compose up -d input-bridge` puis :
   ```sh
   docker compose logs -f input-bridge
   ```
   Attendre `[serial] port opened`.

## Dev local

```sh
cd apps/input-bridge
bun install
bun run dev          # mode mock par défaut
```

Le service tentera de joindre `SERVER_URL` ; si le `server` n'est pas
lancé, Socket.io retentera en boucle (reconnection auto).
