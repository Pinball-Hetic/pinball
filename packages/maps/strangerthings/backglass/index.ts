// Stranger Things backglass art components. CSS classes stay in the app's
// globals.css (TODO: extract the ST theme). The Reactor type is structural
// (see reactor.ts).
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
// Lightweight manifest data exposed to the backglass (no heavy getMapPackage).
export const counterLabels: Record<string, string> = manifest.counterLabels ?? {}
// Clip timings (manifest.clips) — backglass takeover durations.
export const clips: Record<string, ClipTimings> = manifest.clips ?? {}
