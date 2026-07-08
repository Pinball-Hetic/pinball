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

export interface ResolvedMap extends MapPackage {
  layout: MapLayout
  module?: () => MapModule
}

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

export interface MapMeta {
  id: string
  name: string
  tagline: string
  accentColor: string
  previewVideo?: string
}

export const AVAILABLE_MAPS: MapMeta[] = [
  {
    id: 'strangerthings',
    name: 'Stranger Things',
    tagline: 'Hawkins, Indiana',
    accentColor: '#e53935',
    previewVideo: '/map-previews/strangerthings.mp4',
  },
  {
    id: 'zelda',
    name: 'The Legend of Zelda',
    tagline: 'Hyrule Kingdom',
    accentColor: '#FFD700',
    previewVideo: '/map-previews/zelda.mp4',
  },
]
