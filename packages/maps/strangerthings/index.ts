import type { MapPackage } from '@pinball/shared-types'
import { manifest } from './manifest'

export { layout } from './layout'
export { createModule } from './module'

export const mapPackage: MapPackage = {
  manifest,
  hasModule: true,
  hasDmd: true,
  hasBackglass: false,
}
