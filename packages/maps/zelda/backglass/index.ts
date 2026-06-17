// Composants et données du backglass Zelda — Ocarina of Time.
export { default as JoyceWall } from './JoyceWall'
export { default as SideArt } from './SideArt'
export { default as GanondorfTakeover } from './GanondorfTakeover'
// Alias de compatibilité de type avec BackglassContent (typeof strangerthings)
// qui expose DemogorgonTakeover. TODO: extraire une BackglassContent commune.
export { default as DemogorgonTakeover } from './GanondorfTakeover'
export type { Reactor, Reaction } from './reactor'
export { renderMapTakeover, clipBehavior, eventTakeovers } from './takeover'
export type { MapTakeoverContext, ClipBehavior, EventTakeover } from './takeover'
export { backglassTheme, backglassThemeAlternate } from './theme'
export type { ThemeTokens } from './theme'
import { manifest } from '../manifest'
import type { ClipTimings } from '@pinball/shared-types'
// Data légère du manifest exposée au backglass.
export const counterLabels: Record<string, string> = manifest.counterLabels ?? {}
export const clips: Record<string, ClipTimings> = manifest.clips ?? {}
