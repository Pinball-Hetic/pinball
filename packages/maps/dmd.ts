import type { DmdMapContent } from '@pinball/dmd-core'
import { dmdContent as strangerthings } from '@pinball/map-strangerthings/dmd'
import { dmdContent as zelda } from '@pinball/map-zelda/dmd'

const BY_ID: Record<string, DmdMapContent> = {
  strangerthings,
  zelda,
}

export function getDmdContent(id: string): DmdMapContent | null {
  return BY_ID[id] ?? null
}
