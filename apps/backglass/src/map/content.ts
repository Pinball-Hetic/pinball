import { getBackglassContent } from '@pinball/maps/backglass'

// Résolution UNIQUE du contenu backglass de la map active (build-time via
// NEXT_PUBLIC_MAP_ID) par le registry. Les composants/hooks consomment ces
// exports — aucun n'importe @pinball/map-* en direct.
const MAP_ID = process.env.NEXT_PUBLIC_MAP_ID ?? 'strangerthings'

const content = getBackglassContent(MAP_ID)

if (!content) {
  // L'app backglass est buildée pour une map donnée : un contenu absent est
  // une erreur de config (échoue tôt plutôt que crash silencieux au render).
  throw new Error(`[backglass] aucun contenu backglass pour la map "${MAP_ID}"`)
}

export const {
  JoyceWall,
  SideArt,
  renderMapTakeover,
  clipBehavior,
  eventTakeovers,
  counterLabels,
} = content
