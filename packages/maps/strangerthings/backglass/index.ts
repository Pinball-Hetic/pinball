// TODO: extract the ST theme out of the app's globals.css
export { default as JoyceWall } from './JoyceWall'
export { default as SideArt } from './SideArt'
export { default as DemogorgonTakeover } from './DemogorgonTakeover'
export type { Reactor, Reaction } from './reactor'
export { renderMapTakeover, clipBehavior, eventTakeovers } from './takeover'
export type { MapTakeoverContext, ClipBehavior, EventTakeover } from './takeover'
export { backglassTheme, backglassThemeAlternate } from './theme'
export type { ThemeTokens } from './theme'
import { manifest } from '../manifest'
import type { ClipTimings } from '@pinball/shared-types'
export const counterLabels: Record<string, string> = manifest.counterLabels ?? {}
export const clips: Record<string, ClipTimings> = manifest.clips ?? {}
