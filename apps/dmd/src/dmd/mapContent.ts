import type { DmdMapContent } from '@pinball/dmd-core'
import { getDmdContent } from '@pinball/maps/dmd'

// Résolution du contenu DMD de la map active (build-time via
// NEXT_PUBLIC_MAP_ID) par le registry — l'app n'importe jamais @pinball/map-*
// en direct. Une map sans contenu DMD → moteur générique seul.
const MAP_ID = process.env.NEXT_PUBLIC_MAP_ID ?? 'strangerthings'

export const mapDmdContent: DmdMapContent = getDmdContent(MAP_ID) ?? {}
