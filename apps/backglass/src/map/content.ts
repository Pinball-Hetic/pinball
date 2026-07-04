import { createContext, useContext } from 'react'
import { getBackglassContent } from '@pinball/maps/backglass'

export type BackglassContent = NonNullable<ReturnType<typeof getBackglassContent>>

// Fallback value: no-op for every field (the page gates on content presence
// before rendering the Stage, so this fallback is never rendered in practice —
// it avoids crashes if a consumer reads the context outside a Provider).
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

// React context for the active map's backglass content.
// Provided by BackglassPage (via MapContentProvider) and consumed by hooks and
// child components via useMapContent(). Enables dynamic map switching without
// a page reload (key={mapId} on the Stage forces a clean remount when the map
// changes).
const MapContentCtx = createContext<BackglassContent>(EMPTY_CONTENT)

export const MapContentProvider = MapContentCtx.Provider

export function useMapContent(): BackglassContent {
  return useContext(MapContentCtx)
}
