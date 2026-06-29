import { createContext, useContext } from 'react'
import { DEFAULT_MAP_ID } from '@pinball/shared-types'
import { getBackglassContent } from '@pinball/maps/backglass'

export type BackglassContent = NonNullable<ReturnType<typeof getBackglassContent>>

// Valeur de fallback : no-op pour chaque champ (la page gate sur hasMapContent,
// donc ce fallback n'est jamais rendu — il évite les crashes pendant le montage).
export const EMPTY_CONTENT: BackglassContent = {
  JoyceWall: () => null,
  SideArt: () => null,
  renderMapTakeover: () => null,
  clipBehavior: {},
  eventTakeovers: {},
  counterLabels: {},
  clips: {},
  backglassTheme: {},
  backglassThemeAlternate: {},
} as unknown as BackglassContent

// Context React pour le contenu backglass de la map active.
// Fourni par BackglassPage (via MapContentProvider) et consommé par les hooks
// et composants enfants via useMapContent(). Permet le changement dynamique de
// map sans rechargement de page (key={mapId} sur le Stage force un remontage
// propre quand la map change).
const MapContentCtx = createContext<BackglassContent>(EMPTY_CONTENT)

export const MapContentProvider = MapContentCtx.Provider

export function useMapContent(): BackglassContent {
  return useContext(MapContentCtx)
}

// ─── Compat statique (build-time, pour les contextes mono-map) ───────────────
// Résolution UNIQUE du contenu backglass de la map active (build-time via
// NEXT_PUBLIC_MAP_ID) par le registry. Conservé pour les imports existants
// non encore migrés vers useMapContent().
export const MAP_ID = process.env.NEXT_PUBLIC_MAP_ID ?? DEFAULT_MAP_ID

const _content = getBackglassContent(MAP_ID)
export const hasMapContent = _content != null

/** @deprecated Utiliser useMapContent() à la place (dynamique). */
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
} = _content ?? EMPTY_CONTENT
