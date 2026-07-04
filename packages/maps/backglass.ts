import * as strangerthings from '@pinball/map-strangerthings/backglass'
import * as zelda from '@pinball/map-zelda/backglass'

// Registry backglass surface. Separate entrypoint from the core index: only
// the backglass pulls this module (React + map art), never the playfield.
// BackglassContent = ST reference shape (both maps expose the same
// interface). TODO: extract an explicit shared interface.
export type BackglassContent = typeof strangerthings

const BY_ID: Record<string, BackglassContent> = {
  strangerthings,
  zelda: zelda as unknown as BackglassContent,
}

// Resolves a map's backglass content by id (null = no dedicated backglass,
// the app then shows the generic engine / NO SIGNAL).
export function getBackglassContent(id: string): BackglassContent | null {
  return BY_ID[id] ?? null
}
