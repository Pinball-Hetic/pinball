import type { MapPackage } from '@pinball/shared-types'
import { manifest } from './manifest'

export { layout } from './layout'
export { createModule } from './module'

// Paquet de la map Zelda. Le contenu DMD est exposé via le sous-chemin
// '@pinball/map-zelda/dmd'. Pas de backglass dédié pour l'instant
// (hasBackglass: false → l'app affiche le moteur générique / NO SIGNAL).
export const mapPackage: MapPackage = {
  manifest,
  hasModule: true,
  hasDmd: true,
  hasBackglass: false,
}
