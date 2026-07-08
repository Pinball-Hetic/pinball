import type { DmdMapContent } from '@pinball/dmd-core'
import { cinematicHandlers } from './handlers'
import { scoreOverlay, feverBanner } from './overlays'
import { attractFrame } from './attract'
import { PALETTE_UPSIDE_DOWN } from './palette'

export const dmdContent: DmdMapContent = {
  paletteAlternateWorld: PALETTE_UPSIDE_DOWN,
  cinematicHandlers,
  scoreOverlay,
  feverBanner,
  attract: attractFrame,
  alternateWorldBurstMs: 1200,
}
