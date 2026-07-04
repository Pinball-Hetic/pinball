import type { DmdMapContent } from '@pinball/dmd-core'
import { dmdContent as strangerthings } from '@pinball/map-strangerthings/dmd'
import { dmdContent as zelda } from '@pinball/map-zelda/dmd'

// Registry DMD surface. Lightweight entrypoint separate from the core index:
// no game-engine/three pulled into the DMD bundle.
const BY_ID: Record<string, DmdMapContent> = {
  strangerthings,
  zelda,
}

// Resolves a map's DMD content by id (null = generic engine only).
export function getDmdContent(id: string): DmdMapContent | null {
  return BY_ID[id] ?? null
}
