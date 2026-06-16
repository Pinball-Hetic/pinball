# Firmware ESP32 — boutons borne Pinball

Lit les 9 boutons physiques de la borne et émet le protocole série `BTN:ID:DOWN|UP`
consommé par `apps/input-bridge`. **Pas de WiFi, pas de JSON, pas de LED** — USB-CDC
texte ligne par ligne, baud 115200.

## Boutons

| id physique         | GPIO | action jeu (côté TS) |
|---------------------|------|----------------------|
| `BLACK_LEFT`        | 16   | — (non mappé)        |
| `WHITE_LEFT`        | 4    | `FLIP_LEFT`          |
| `FRONT_LEFT_GREEN`  | 17   | — (non mappé)        |
| `FRONT_LEFT_YELLOW` | 18   | — (non mappé)        |
| `FRONT_LEFT_RED`    | 19   | — (non mappé)        |
| `BLACK_RIGHT`       | 13   | — (non mappé)        |
| `WHITE_RIGHT`       | 25   | `FLIP_RIGHT`         |
| `FRONT_WHITE`       | 33   | `START`              |
| `PLUNGER`           | 32   | `PLUNGE`             |

> Le mapping `id → action` vit **côté TypeScript** (`CABINET_BUTTONS`,
> `@pinball/shared-types`). Le firmware n'émet **que l'identifiant physique** ;
> tout remap d'action se fait sans reflasher.

## Câblage (actif-bas)

Chaque bouton relie sa GPIO à **GND**. `INPUT_PULLUP` interne tient la pin à HIGH
au repos → **pressé = LOW**. Pas de résistance externe requise.

## Anti-rebond

Logiciel, 8 ms : un changement n'est validé qu'après 8 ms de lecture stable.
Émission uniquement sur front validé. Aucun état émis au boot.

## Build / flash / moniteur

```sh
pio run --project-dir firmware           # compile (env esp32dev)
pio run --project-dir firmware -t upload # flash via USB
pio device monitor -b 115200             # moniteur série
```

Flash alternatif (binaire fusionné) : `esptool merge_bin` puis flash à `0x0`,
baud 115200.
