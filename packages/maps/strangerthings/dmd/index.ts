import type { DmdMapContent } from '@pinball/dmd-core'
import { cinematicHandlers } from './handlers'
import { scoreOverlay, feverBanner } from './overlays'
import { attractFrame } from './attract'
import { PALETTE_UPSIDE_DOWN } from './palette'

// Contenu DMD Stranger Things injecté dans le moteur @pinball/dmd-core.
export const dmdContent: DmdMapContent = {
  paletteUpsideDown: PALETTE_UPSIDE_DOWN,
  cinematicHandlers,
  scoreOverlay,
  feverBanner,
  attract: attractFrame,
  upsideDownBurstMs: 1200,
}
