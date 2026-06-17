import type { MapPackage } from '@pinball/shared-types'
import { manifest } from './manifest'

export { layout } from './layout'
export { createModule } from './module'

// Paquet de la map Zelda. Contenu DMD via '@pinball/map-zelda/dmd',
// contenu backglass via '@pinball/map-zelda/backglass'.
export const mapPackage: MapPackage = {
  manifest,
  hasModule: true,
  hasDmd: true,
  hasBackglass: true,
}
