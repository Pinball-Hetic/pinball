import type { MapPackage } from '@pinball/shared-types'
import { manifest } from './manifest'

export { layout } from './layout'
export { createModule } from './module'

// Zelda map package. DMD content via '@pinball/map-zelda/dmd',
// backglass content via '@pinball/map-zelda/backglass'.
export const mapPackage: MapPackage = {
  manifest,
  hasModule: true,
  hasDmd: true,
  hasBackglass: true,
}
