import * as strangerthings from '@pinball/map-strangerthings/backglass'
import * as zelda from '@pinball/map-zelda/backglass'

// TODO: extract an explicit shared BackglassContent interface (both maps
// currently conform to the ST reference shape).
export type BackglassContent = typeof strangerthings

const BY_ID: Record<string, BackglassContent> = {
  strangerthings,
  zelda: zelda as unknown as BackglassContent,
}

export function getBackglassContent(id: string): BackglassContent | null {
  return BY_ID[id] ?? null
}
