import type { DmdMapContent } from '@pinball/dmd-core'
import { DEFAULT_MAP_ID } from '@pinball/shared-types'
import { getDmdContent } from '@pinball/maps/dmd'

// Resolves the active map's DMD content (build-time via NEXT_PUBLIC_MAP_ID)
// through the registry — the app never imports @pinball/map-* directly.
// A map without DMD content → generic engine only.
const MAP_ID = process.env.NEXT_PUBLIC_MAP_ID ?? DEFAULT_MAP_ID

export const mapDmdContent: DmdMapContent = getDmdContent(MAP_ID) ?? {}
