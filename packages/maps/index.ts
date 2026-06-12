import type { MapPackage } from '@pinball/shared-types'
import { mapPackage as strangerthings } from '@pinball/map-strangerthings'

// Composition root des maps : SEUL fichier du repo qui importe les packages
// @pinball/map-*. Les apps résolvent une map par id via getMapPackage.
export function getMapPackage(id: string): MapPackage | null {
  switch (id) {
    case 'strangerthings':
      return strangerthings
    default:
      return null
  }
}
