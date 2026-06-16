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

`<ID>` = bouton physique UPPER_SNAKE. `VALID_BUTTON_IDS` dérive
`CABINET_BUTTONS` (`@pinball/shared-types`) — tout id inconnu est droppé.

Lignes vides ignorées. Format invalide → log d'erreur, pas de crash.

## Variables d'environnement

| Var                  | Défaut                | Rôle                                                |
| -------------------- | --------------------- | --------------------------------------------------- |
| `INPUT_BRIDGE_MODE`  | `mock`                | `mock` (binding virtuel) ou `serial` (port réel).   |
| `SERIAL_PATH`        | `/dev/MOCK_ESP32`     | Chemin du périphérique en mode serial (borne : `/dev/ttyUSB0`). |
| `SERIAL_BAUD`        | `115200`              | Baudrate **runtime** (≠ baudrate de flash esptool). |
| `SERVER_URL`         | `http://server:3001`  | URL Socket.io interne au réseau Docker.             |

## Modes

### `mock` (défaut en dev / CI)

Crée un port virtuel via `@serialport/binding-mock`. N'émet rien
spontanément. Utilisé conjointement avec le mode clavier
`simulate-esp32` du playfield : le server route `dev:simulate-button`
ici, le handler écrit la ligne protocolaire correspondante sur le port
mock, et le parser interne la relit comme s'il s'agissait d'un vrai
ESP32. Le chemin complet est ainsi exercé sans hardware.

En mode `serial` (vrai ESP32 branché), les events `dev:simulate-button`
sont ignorés avec un warning — la simulation n'a pas de sens dès qu'on
a le hardware réel.

### `serial` (borne en production)

Ouvre `SERIAL_PATH` via `@serialport/bindings-cpp`. Réessaie 60 fois
toutes les 500 ms (≈30 s) pour tolérer le reboot USB de l'ESP32 après
un flash Fliphetic.

## Mode serial sur la borne

`docker-compose.yml` (prod) est déjà câblé pour l'ESP32 réel :
`INPUT_BRIDGE_MODE=serial`, `SERIAL_PATH=/dev/ttyUSB0`, et
`devices: ["/dev/ttyUSB0:/dev/ttyUSB0"]`. Fliphetic flashe l'ESP32 →
`/dev/ttyUSB0` présent **avant** `compose up` (cf. cycle CLAUDE.md).

> ⚠️ Mapping device DUR : sur un poste **sans** ESP32, `compose up` de
> `docker-compose.yml` échoue à créer ce conteneur (attendu : prod = borne).
> Le dev (`docker-compose.dev.yml`) reste en `mock`, sans `devices`.

Vérifier l'ouverture du port :
```sh
docker compose logs -f input-bridge   # attendre "[serial] port opened"
```

## Dev local

```sh
cd apps/input-bridge
bun install
bun run dev          # mode mock par défaut
```

Le service tentera de joindre `SERVER_URL` ; si le `server` n'est pas
lancé, Socket.io retentera en boucle (reconnection auto).
