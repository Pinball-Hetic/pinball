import type { DmdMapContent } from '@pinball/dmd-core'
import { cinematicHandlers } from './handlers'
import { scoreOverlay, feverBanner } from './overlays'
import { attractFrame } from './attract'
import { PALETTE_SACRED_REALM } from './palette'

// Contenu DMD Zelda injecté dans le moteur @pinball/dmd-core.
export const dmdContent: DmdMapContent = {
  paletteAlternateWorld: PALETTE_SACRED_REALM,
  cinematicHandlers,
  scoreOverlay,
  feverBanner,
  attract: attractFrame,
  alternateWorldBurstMs: 1200,
}
