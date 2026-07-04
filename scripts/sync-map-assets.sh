#!/usr/bin/env sh
# Syncs map assets (packages/maps/<id>/assets/) into the public/ of the apps
# that serve them (apps/<app>/public/maps/<id>/).
# public/maps/ is gitignored: regenerated at dev/build (app dev/build scripts +
# Dockerfiles via `bun run build`). POSIX sh (runs under Docker alpine, no
# bash). Idempotent.
#
# Map selection:
#   - argument $1 or NEXT_PUBLIC_MAP_ID → that map ONLY (single-map).
#   - otherwise → ALL maps that have an assets/. Required: the app has a
#     multi-map selector; syncing only the default map left the prod Docker
#     image without the other maps' GLB → 404 on load (zelda: infinite loading
#     screen, prod only — in dev the bug was masked by a leftover public/maps
#     mounted as a volume from the host).
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

sync_one() {
  MAP_ID="$1"
  SRC="$ROOT/packages/maps/$MAP_ID/assets"
  if [ ! -d "$SRC" ]; then
    echo "[sync-map-assets] aucun assets/ pour la map '$MAP_ID' ($SRC) — rien à faire."
    return 0
  fi
  # Apps serving the map assets. Only playfield loads GLB/textures/sounds;
  # dmd/backglass draw on canvas (no map asset).
  for app in playfield; do
    DEST="$ROOT/apps/$app/public/maps/$MAP_ID"
    rm -rf "$DEST"
    mkdir -p "$DEST"
    cp -R "$SRC"/. "$DEST"/
    echo "[sync-map-assets] $MAP_ID -> apps/$app/public/maps/$MAP_ID"
  done
}

EXPLICIT="${1:-${NEXT_PUBLIC_MAP_ID:-}}"
if [ -n "$EXPLICIT" ]; then
  sync_one "$EXPLICIT"
else
  FOUND=0
  for dir in "$ROOT"/packages/maps/*/assets; do
    [ -d "$dir" ] || continue
    FOUND=1
    sync_one "$(basename "$(dirname "$dir")")"
  done
  if [ "$FOUND" -eq 0 ]; then
    echo "[sync-map-assets] aucune map avec assets/ trouvée sous packages/maps/."
  fi
fi
