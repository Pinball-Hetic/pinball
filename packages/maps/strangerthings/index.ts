import type { MapPackage } from '@pinball/shared-types'
import { manifest } from './manifest'

// Paquet de la map Stranger Things. Les drapeaux restent false tant que le
// comportement (phase 4) et les contenus DMD/backglass (phase 5) ne sont pas
// extraits dans ce package.
export const mapPackage: MapPackage = {
  manifest,
  hasModule: false,
  hasDmd: false,
  hasBackglass: false,
}
