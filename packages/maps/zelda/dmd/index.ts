import type { DmdMapContent } from '@pinball/dmd-core'
import { cinematicHandlers } from './handlers'
import { scoreOverlay, feverBanner } from './overlays'
import { attractFrame } from './attract'
import { PALETTE_ZELDA, PALETTE_SACRED_REALM } from './palette'

// Contenu DMD Zelda injecté dans le moteur @pinball/dmd-core.
export const dmdContent: DmdMapContent = {
  // Palette normale : vert émeraude / or / bleu saphir (identité Zelda).
  paletteNormal: PALETTE_ZELDA,
  // Palette monde alternatif (Sacred Realm) : vert vif + or éclatant.
  paletteAlternateWorld: PALETTE_SACRED_REALM,
  // Couleur des bandeaux NeonBand haut/bas de l'écran DMD.
  neonColor: '#FFD700',
  cinematicHandlers,
  scoreOverlay,
  feverBanner,
  attract: attractFrame,
  alternateWorldBurstMs: 1200,
}
