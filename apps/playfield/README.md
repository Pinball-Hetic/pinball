# @pinball/playfield

Frontend Next.js — écran principal du flipper (3D Three.js + Rapier).

## Modes clavier (dev)

Sélectionnés par la variable d'env `NEXT_PUBLIC_KEYBOARD_MODE` (build-time
Next.js, donc nécessite un redémarrage du conteneur pour prendre effet).

| Mode | Comportement | Cas d'usage |
| --- | --- | --- |
| `direct` (défaut) | Le clavier appelle directement le callback métier (mêmes effets que les events réseau). Latence ~0. | Dev quotidien, jeu au clavier. |
| `simulate-esp32` | Le clavier émet un event Socket.io `dev:simulate-button` au server, qui le retransforme en `input:button` broadcast à tous. Le playfield reçoit son propre event et applique l'effet via le même callback que les vrais events ESP32. | Valider toute la chaîne réseau sans hardware ESP32. |
| `disabled` | Le clavier de jeu est ignoré (sauf `H` debug). | Tester uniquement le hardware ESP32 réel quand il sera branché. |

La touche `H` (toggle debug colliders) reste **toujours active** dans
tous les modes — c'est une touche dev, pas une touche de jeu.

### Activer un mode

`docker-compose.dev.yml`, service `playfield` :

```yaml
playfield:
  environment:
    NEXT_PUBLIC_KEYBOARD_MODE: "simulate-esp32"
```

Puis :

```sh
docker compose -f docker-compose.dev.yml up --force-recreate playfield
```

(le `--force-recreate` est nécessaire pour ré-injecter les
`NEXT_PUBLIC_*` dans le bundle Next.js).

Vérifier dans la console navigateur :

```
[PinballPlayfield] KEYBOARD_MODE = simulate-esp32
```

### Touches mappées

| Touche | Bouton émis | Notes |
| --- | --- | --- |
| `ArrowLeft` ou `Q` | `LEFT` | down/up |
| `ArrowRight` ou `D` | `RIGHT` | down/up |
| `Space` | `PLUNGER` | down = charge, up = release |
| `H` | (debug colliders) | jamais réseau, toujours local |

`START` n'est pas mappé au clavier — sera émis uniquement par le vrai
ESP32 (specs HETIC en attente).

## Variables d'env

| Var | Défaut | Rôle |
| --- | --- | --- |
| `NEXT_PUBLIC_KEYBOARD_MODE` | `direct` | Voir tableau ci-dessus. |
| `NEXT_PUBLIC_SOCKET_URL` | (vide) | URL Socket.io directe (dev avec port serveur exposé). Vide en prod Fliphetic → polling same-origin via rewrite Next.js. |
| `SERVER_INTERNAL_URL` | `http://server:3001` | Cible des rewrites `/api/*` et `/socket.io/*` (DNS Docker). |
