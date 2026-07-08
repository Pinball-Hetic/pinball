import { createContext, useContext } from 'react'
import { getBackglassContent } from '@pinball/maps/backglass'

export type BackglassContent = NonNullable<ReturnType<typeof getBackglassContent>>

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

const MapContentCtx = createContext<BackglassContent>(EMPTY_CONTENT)

export const MapContentProvider = MapContentCtx.Provider

export function useMapContent(): BackglassContent {
  return useContext(MapContentCtx)
}
