#!/usr/bin/env sh
# Synchronise les assets des maps (packages/maps/<id>/assets/) vers le
# public/ des apps qui les servent (apps/<app>/public/maps/<id>/).
# public/maps/ est gitignoré : régénéré au dev/build (scripts dev/build des
# apps + Dockerfiles via `bun run build`). POSIX sh (tourne sous l'alpine
# Docker, sans bash). Idempotent.
#
# Sélection des maps :
#   - argument $1 ou NEXT_PUBLIC_MAP_ID → cette map UNIQUEMENT (mono-map).
#   - sinon → TOUTES les maps ayant un assets/. Indispensable : l'app a un
#     sélecteur multi-map ; ne synchroniser que la map par défaut laissait
#     l'image Docker prod sans les GLB des autres maps → 404 au chargement
#     (zelda : écran de chargement infini, prod uniquement — en dev le bug
#     était masqué par un public/maps résiduel monté en volume depuis l'hôte).
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

sync_one() {
  MAP_ID="$1"
  SRC="$ROOT/packages/maps/$MAP_ID/assets"
  if [ ! -d "$SRC" ]; then
    echo "[sync-map-assets] aucun assets/ pour la map '$MAP_ID' ($SRC) — rien à faire."
    return 0
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
