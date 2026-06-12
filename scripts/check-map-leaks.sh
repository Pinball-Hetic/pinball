#!/usr/bin/env bash
# Grep-guard anti-fuite map : détecte les termes spécifiques d'une map
# (manifest.forbiddenInCore) qui apparaîtraient dans le core (game-engine)
# ou les apps, hors packages/maps/.
#
# Phase 2-3 : mode WARNING (exit 0) — des résidus sont attendus tant que le
# comportement n'est pas extrait. Phases 4-5 : ce script passera bloquant
# (exit 1) pour game-engine + playfield, puis pour tout le repo.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

SEARCH_DIRS=(
  packages/game-engine/src
  apps/playfield/src
  apps/dmd/src
  apps/backglass/src
  apps/server/src
)

total=0

for manifest in packages/maps/*/manifest.ts; do
  [ -f "$manifest" ] || continue
  mapid=$(basename "$(dirname "$manifest")")

  # Termes de forbiddenInCore : chaînes quotées du bloc `forbiddenInCore: [ … ]`.
  terms=$(awk '/forbiddenInCore *: *\[/{f=1} f{print} f&&/\]/{f=0}' "$manifest" \
    | grep -oE "'[^']+'" | tr -d "'")
  [ -z "$terms" ] && continue

  echo "── Map: $mapid ──"
  for term in $terms; do
    hits=$(grep -rIil --include='*.ts' --include='*.tsx' "$term" "${SEARCH_DIRS[@]}" 2>/dev/null \
      | grep -v '/packages/maps/' || true)
    if [ -n "$hits" ]; then
      count=$(printf '%s\n' "$hits" | wc -l | tr -d ' ')
      total=$((total + count))
      echo "  ⚠ '$term' — $count fichier(s)"
      printf '%s\n' "$hits" | sed 's/^/      /'
    fi
  done
  echo ""
done

echo "Total résidus (fichiers): $total"
echo "Mode warning (phase 2-3) — exit 0. Les résidus = comportement pas encore extrait."
exit 0
