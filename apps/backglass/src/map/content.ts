import { createContext, useContext } from 'react'
import { getBackglassContent } from '@pinball/maps/backglass'

export type BackglassContent = NonNullable<ReturnType<typeof getBackglassContent>>

// Valeur de fallback : no-op pour chaque champ (la page gate sur la présence du
// contenu avant de rendre le Stage, donc ce fallback n'est jamais rendu en
// pratique — il évite les crashes si un consommateur lit le contexte hors Provider).
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
