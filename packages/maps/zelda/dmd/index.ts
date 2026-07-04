import type { DmdMapContent } from '@pinball/dmd-core'
import { cinematicHandlers } from './handlers'
import { scoreOverlay, feverBanner } from './overlays'
import { attractFrame } from './attract'
import { PALETTE_ZELDA, PALETTE_SACRED_REALM } from './palette'

// Zelda DMD content injected into the @pinball/dmd-core engine.
export const dmdContent: DmdMapContent = {
  // Normal palette: emerald green / gold / sapphire blue (Zelda identity).
  paletteNormal: PALETTE_ZELDA,
  // Alternate world palette (Sacred Realm): bright green + vivid gold.
  paletteAlternateWorld: PALETTE_SACRED_REALM,
  // Color of the top/bottom NeonBand strips of the DMD screen.
  neonColor: '#FFD700',
  cinematicHandlers,
  scoreOverlay,
  feverBanner,
  attract: attractFrame,
  alternateWorldBurstMs: 1200,
}
