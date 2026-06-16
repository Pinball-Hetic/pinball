import { DEFAULT_MAP_ID } from '@pinball/shared-types'
import { getBackglassContent } from '@pinball/maps/backglass'

// Résolution UNIQUE du contenu backglass de la map active (build-time via
// NEXT_PUBLIC_MAP_ID) par le registry. Les composants/hooks consomment ces
// exports — aucun n'importe @pinball/map-* en direct.
export const MAP_ID = process.env.NEXT_PUBLIC_MAP_ID ?? DEFAULT_MAP_ID

const content = getBackglassContent(MAP_ID)

// Robustesse : une map sans contenu backglass (id inconnu / surface absente)
// ne doit PAS crasher — la page gate sur `hasMapContent` et affiche NO SIGNAL.
// Les exports tombent sur des no-op pour ne pas casser les imports statiques
// des hooks/composants montés avant le gate.
export const hasMapContent = content != null

const EMPTY = {
  JoyceWall: () => null,
  SideArt: () => null,
  renderMapTakeover: () => null,
  clipBehavior: {},
  eventTakeovers: {},
  counterLabels: {},
  clips: {},
  backglassTheme: {},
  backglassThemeAlternate: {},
} as unknown as NonNullable<ReturnType<typeof getBackglassContent>>

export const {
  JoyceWall,
  SideArt,
  renderMapTakeover,
  clipBehavior,
  eventTakeovers,
  counterLabels,
  clips,
  backglassTheme,
  backglassThemeAlternate,
} = content ?? EMPTY
