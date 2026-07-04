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

// layout + module (game-engine types) cannot live on MapPackage
// (shared-types does not depend on game-engine). The registry — which does
// depend on game-engine — assembles them into this enriched type.
export interface ResolvedMap extends MapPackage {
  layout: MapLayout
  /** Lazy behavior-module factory (absent → no custom behavior). */
  module?: () => MapModule
}

// Maps composition root: the ONLY file in the repo that imports
// @pinball/map-* packages. Apps resolve a map by id via getMapPackage.
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

/** Lightweight metadata for the map selector (no layout, no module). */
export interface MapMeta {
  id: string
  name: string
  tagline: string
  accentColor: string
  /** Public URL of the preview video (looped inside the card). */
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
