# @pinball/playfield

Frontend Next.js — écran principal du flipper (3D Three.js + Rapier).

## Mode affichage

Le playfield cible par défaut un **écran portrait plein écran** (largeur du
tapis = largeur écran, vue légèrement plongeante). Variable build-time
`NEXT_PUBLIC_PLAYFIELD_VIEW_MODE` :

| Mode | Comportement |
| --- | --- |
| `portrait-fill` (défaut) | Tout le tapis visible : largeur plein écran si possible, sinon recul pour tenir en hauteur. |
| `legacy` | Ancienne vue cabine avec marges NDC autour du tapis. |

Pour forcer l'ancien cadrage en dev :

```yaml
playfield:
  environment:
    NEXT_PUBLIC_PLAYFIELD_VIEW_MODE: "legacy"
```

Puis `docker compose -f docker-compose.dev.yml up --force-recreate playfield`.

En mode `portrait-fill`, `[J]` affiche le debug balle et les sliders de réglage
caméra (direction, look-at, marges NDC). `[H]` reste le toggle colliders Rapier.

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
| `J` | (debug balle + caméra) | portrait-fill : overlay diagnostics + sliders caméra |

`START` n'est pas mappé au clavier — sera émis uniquement par le vrai
ESP32 (specs HETIC en attente).

## Variables d'env

| Var | Défaut | Rôle |
| --- | --- | --- |
| `NEXT_PUBLIC_PLAYFIELD_VIEW_MODE` | `portrait-fill` | Cadrage caméra et layout (`legacy` pour l'ancienne vue cabine). |
| `NEXT_PUBLIC_KEYBOARD_MODE` | `direct` | Voir tableau ci-dessus. |
| `NEXT_PUBLIC_SOCKET_URL` | (vide) | URL Socket.io directe (dev avec port serveur exposé). Vide en prod Fliphetic → polling same-origin via rewrite Next.js. |
| `SERVER_INTERNAL_URL` | `http://server:3001` | Cible des rewrites `/api/*` et `/socket.io/*` (DNS Docker). |

## Overlays cinématiques

Pendant les **gels** cinématiques, un overlay DOM (`CinematicOverlay`) joue
une animation par-dessus le canvas 3D (sous le HUD). Sans asset → fallback
CSS générique par famille (`demogorgon_*` pulsation rouge, `milestone_*`
rayons dorés, `hetic_*` balayage). Déposer un fichier le remplace, sans code.

### Convention

- Fichiers dans `public/overlays/`, **commités** dans le repo (embarqués
  dans l'image Docker → borne hors réseau). `public/overlays/` n'est PAS
  gitignoré.
- Nommage : `<clip>.webm` (préféré) ou `<clip>.webp` / `<clip>.gif`. Puis
  référencer dans `src/overlays-manifest.ts` (`OVERLAY_FILES[clip] = 'fichier'`).
- **Aucune URL externe** dans le code — uniquement des chemins `/overlays/*`.

### Formats & budget (strict — le repo grossit à chaque asset)

- WebM (VP9) ou WebP animé : **≤ 3 Mo** par clip. GIF accepté si **< 4 Mo**.
- Boucle courte 2–4 s suffit (l'overlay tourne en `loop` pendant le gel).
- Dimensions : 1280×720 suffisant (écran borne 1080p). Cible totale ≤ 20 Mo.

### Conversion locale (ffmpeg)

```bash
# GIF/MP4 → WebM compact (VP9) :
ffmpeg -i in.gif -c:v libvpx-vp9 -b:v 0 -crf 40 -an out.webm
# → WebP animé :
ffmpeg -i in.gif -c:v libwebp -lossless 0 -q:v 60 -loop 0 out.webp
```
