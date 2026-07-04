// Zelda backglass components and data — Ocarina of Time.
export { default as JoyceWall } from './JoyceWall'
export { default as SideArt } from './SideArt'
export { default as GanondorfTakeover } from './GanondorfTakeover'
// Type-compat alias with BackglassContent (typeof strangerthings) which
// exposes DemogorgonTakeover. TODO: extract a shared BackglassContent.
export { default as DemogorgonTakeover } from './GanondorfTakeover'
export type { Reactor, Reaction } from './reactor'
export { renderMapTakeover, clipBehavior, eventTakeovers } from './takeover'
export type { MapTakeoverContext, ClipBehavior, EventTakeover } from './takeover'
export { backglassTheme, backglassThemeAlternate } from './theme'
export type { ThemeTokens } from './theme'
import { manifest } from '../manifest'
import type { ClipTimings } from '@pinball/shared-types'
// Lightweight manifest data exposed to the backglass.
export const counterLabels: Record<string, string> = manifest.counterLabels ?? {}
export const clips: Record<string, ClipTimings> = manifest.clips ?? {}
