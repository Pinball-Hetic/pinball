import type { MapPackage } from '@pinball/shared-types'
import { manifest } from './manifest'

export { layout } from './layout'
export { createModule } from './module'

// Stranger Things map package. DMD content is exposed via the
// '@pinball/map-strangerthings/dmd' subpath (kept out of the main index to
// avoid bloating the playfield bundle).
export const mapPackage: MapPackage = {
  manifest,
  hasModule: true,
  hasDmd: true,
  hasBackglass: false,
}
