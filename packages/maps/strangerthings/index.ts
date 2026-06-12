import type { MapPackage } from '@pinball/shared-types'
import { manifest } from './manifest'

export { layout } from './layout'
export { createModule } from './module'

// Paquet de la map Stranger Things. hasModule passe à true (pipeline de
// comportement actif, module vide pour l'instant — rempli en phase 4.3).
// hasDmd/hasBackglass restent false (contenus écrans = phase 5).
export const mapPackage: MapPackage = {
  manifest,
  hasModule: true,
  hasDmd: false,
  hasBackglass: false,
}
