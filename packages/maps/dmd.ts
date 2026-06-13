import type { DmdMapContent } from '@pinball/dmd-core'
import { dmdContent as strangerthings } from '@pinball/map-strangerthings/dmd'
import { dmdContent as zelda } from '@pinball/map-zelda/dmd'

// Surface DMD du registry. Entrypoint léger séparé de l'index core : pas de
// game-engine/three tiré dans le bundle DMD.
const BY_ID: Record<string, DmdMapContent> = {
  strangerthings,
  zelda,
}

// Résout le contenu DMD d'une map par id (null = moteur générique seul).
export function getDmdContent(id: string): DmdMapContent | null {
  return BY_ID[id] ?? null
}
