import type { DmdMapContent } from '@pinball/dmd-core'
import { dmdContent as strangerthings } from '@pinball/map-strangerthings/dmd'

// Résolution du contenu DMD de la map active (build-time via
// NEXT_PUBLIC_MAP_ID). Sous-chemin léger : pas de game-engine/three tiré
// dans le bundle DMD. Une map sans contenu DMD → moteur générique seul.
const MAP_ID = process.env.NEXT_PUBLIC_MAP_ID ?? 'strangerthings'

const BY_ID: Record<string, DmdMapContent> = {
  strangerthings,
}

export const mapDmdContent: DmdMapContent = BY_ID[MAP_ID] ?? {}
