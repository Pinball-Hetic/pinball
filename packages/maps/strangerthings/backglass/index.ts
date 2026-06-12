// Composants d'art backglass Stranger Things (relocalisés depuis apps/backglass).
// Les classes CSS restent dans le globals.css de l'app (TODO : extraire le
// thème ST). Le type Reactor est structurel (cf. reactor.ts).
export { default as JoyceWall } from './JoyceWall'
export { default as SideArt } from './SideArt'
export { default as DemogorgonTakeover } from './DemogorgonTakeover'
export type { Reactor, Reaction } from './reactor'
export { renderMapTakeover, clipBehavior, eventTakeovers } from './takeover'
export type { MapTakeoverContext, ClipBehavior, EventTakeover } from './takeover'
import { manifest } from '../manifest'
// Libellés des compteurs ST (recap) — depuis le manifest (data légère).
export const counterLabels: Record<string, string> = manifest.counterLabels ?? {}
