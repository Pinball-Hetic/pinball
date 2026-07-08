import type { DmdMapContent } from '@pinball/dmd-core'
import { cinematicHandlers } from './handlers'
import { scoreOverlay, feverBanner } from './overlays'
import { attractFrame } from './attract'
import { PALETTE_ZELDA, PALETTE_SACRED_REALM } from './palette'

export const dmdContent: DmdMapContent = {
  paletteNormal: PALETTE_ZELDA,
  paletteAlternateWorld: PALETTE_SACRED_REALM,
  neonColor: '#FFD700',
  cinematicHandlers,
  scoreOverlay,
  feverBanner,
  attract: attractFrame,
  alternateWorldBurstMs: 1200,
}
