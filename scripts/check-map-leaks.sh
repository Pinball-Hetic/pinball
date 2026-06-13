#!/usr/bin/env bash
# Grep-guard anti-fuite map : détecte les termes spécifiques d'une map
# (manifest.forbiddenInCore) qui apparaîtraient dans le core (game-engine) ou
# les apps, hors packages/maps/.
#
# BLOQUANT (exit 1) sur tout résidu NON whitelisté. La whitelist est étroite
# (paire term|fichier, motif documenté) : faux positifs de branding ou
# commentaires tolérés. Le littéral d'id de map par défaut vit dans
# packages/shared-types (DEFAULT_MAP_ID), hors SEARCH_DIRS → non concerné.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

SEARCH_DIRS=(
  packages/game-engine/src
  apps/playfield/src
  apps/dmd/src
  apps/backglass/src
  apps/server/src
)

# Résidus légitimes tolérés : "<term>|<chemin>". Whitelist ÉTROITE — un
# fichier par motif documenté.
WHITELIST=(
  "hetic|apps/playfield/src/hooks/usePhysicalInputs.ts"               # 'Fliphetic' (orchestrateur de borne)
  "hetic|apps/dmd/src/pages/index.tsx"                                # 'PINBALL HETIC' (branding projet/borne)
  "upside|apps/playfield/src/components/pinball/PinballPlayfield.tsx" # commentaires (objets monde alternatif possédés par le module de map)
)

is_whitelisted() { # term file
  local key="$1|$2"
  local w
  for w in "${WHITELIST[@]}"; do
    [ "$w" = "$key" ] && return 0
  done
  return 1
}

violations=0
skipped=0

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
    [ -z "$hits" ] && continue
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      if is_whitelisted "$term" "$f"; then
        skipped=$((skipped + 1))
        continue
      fi
      echo "  ✖ '$term' — $f"
      violations=$((violations + 1))
    done <<< "$hits"
  done
  echo ""
done

if [ "$violations" -gt 0 ]; then
  echo "ÉCHEC : $violations fuite(s) de map non whitelistée(s) dans le core/apps."
  echo "→ Extraire le contenu vers packages/maps/<id>/, ou whitelister (motif documenté) si faux positif."
  exit 1
fi

echo "OK : aucune fuite de map (${skipped} résidu(s) whitelisté(s) ignoré(s))."
exit 0
