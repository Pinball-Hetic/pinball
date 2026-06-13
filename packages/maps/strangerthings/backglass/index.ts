// Composants d'art backglass Stranger Things (relocalisés depuis apps/backglass).
// Les classes CSS restent dans le globals.css de l'app (TODO : extraire le
// thème ST). Le type Reactor est structurel (cf. reactor.ts).
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
// Data légère du manifest exposée au backglass (pas de getMapPackage lourd).
export const counterLabels: Record<string, string> = manifest.counterLabels ?? {}
// Timings des clips (manifest.clips) — durées de takeover backglass.
export const clips: Record<string, ClipTimings> = manifest.clips ?? {}
