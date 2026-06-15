import type { MapLayout, MapModule } from '@pinball/game-engine'
import type { MapPackage } from '@pinball/shared-types'
import {
  mapPackage as stPackage,
  layout as stLayout,
  createModule as stCreateModule,
} from '@pinball/map-strangerthings'
import {
  mapPackage as zeldaPackage,
  layout as zeldaLayout,
  createModule as zeldaCreateModule,
} from '@pinball/map-zelda'

// Le layout + le module (types game-engine) ne peuvent pas vivre sur
// MapPackage (shared-types ne dépend pas de game-engine). Le registry — qui,
// lui, dépend de game-engine — les assemble dans un type enrichi.
export interface ResolvedMap extends MapPackage {
  layout: MapLayout
  /** Factory lazy du module de comportement (absent → pas de comportement custom). */
  module?: () => MapModule
}

// Composition root des maps : SEUL fichier du repo qui importe les packages
// @pinball/map-*. Les apps résolvent une map par id via getMapPackage.
export function getMapPackage(id: string): ResolvedMap | null {
  switch (id) {
    case 'strangerthings':
      return { ...stPackage, layout: stLayout, module: stCreateModule }
    case 'zelda':
      return { ...zeldaPackage, layout: zeldaLayout, module: zeldaCreateModule }
    default:
      return null
  }
}

/** Métadonnées légères pour le sélecteur de map (pas de layout ni module). */
export interface MapMeta {
  id: string
  name: string
  tagline: string
  accentColor: string
}

export const AVAILABLE_MAPS: MapMeta[] = [
  {
    id: 'strangerthings',
    name: 'Stranger Things',
    tagline: 'Hawkins, Indiana',
    accentColor: '#e53935',
  },
  {
    id: 'zelda',
    name: 'The Legend of Zelda',
    tagline: 'Hyrule Kingdom',
    accentColor: '#FFD700',
  },
]
