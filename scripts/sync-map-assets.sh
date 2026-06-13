#!/usr/bin/env sh
# Synchronise les assets d'une map (packages/maps/<id>/assets/) vers le
# public/ des apps qui les servent (apps/<app>/public/maps/<id>/).
# public/maps/ est gitignoré : régénéré au dev/build (scripts dev/build des
# apps + Dockerfiles via `bun run build`). POSIX sh (tourne sous l'alpine
# Docker, sans bash). Idempotent.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAP_ID="${1:-${NEXT_PUBLIC_MAP_ID:-strangerthings}}"

SRC="$ROOT/packages/maps/$MAP_ID/assets"
if [ ! -d "$SRC" ]; then
  echo "[sync-map-assets] aucun assets/ pour la map '$MAP_ID' ($SRC) — rien à faire."
  exit 0
fi

# Apps servant les assets de la map. Seul le playfield charge GLB/textures/
# sons ; dmd/backglass dessinent en canvas (pas d'asset map).
for app in playfield; do
  DEST="$ROOT/apps/$app/public/maps/$MAP_ID"
  rm -rf "$DEST"
  mkdir -p "$DEST"
  cp -R "$SRC"/. "$DEST"/
  echo "[sync-map-assets] $MAP_ID -> apps/$app/public/maps/$MAP_ID"
done
