import type { MapPackage } from '@pinball/shared-types'
import { manifest } from './manifest'

export { layout } from './layout'
export { createModule } from './module'

// Paquet de la map Stranger Things. Le contenu DMD est exposé via le
// sous-chemin '@pinball/map-strangerthings/dmd' (gardé hors de l'index
// principal pour ne pas alourdir le bundle playfield).
export const mapPackage: MapPackage = {
  manifest,
  hasModule: true,
  hasDmd: true,
  hasBackglass: false,
}
