import type { DmdDisplay } from '@pinball/shared-types';
import type { DotColor } from './palette';

// DMD content contract provided by a map. The engine (makeLayouts) stays
// generic; the map injects its cinematics, palettes and overlays.

export type ScoreDisplay = Extract<DmdDisplay, { mode: 'SCORE' }>;

// Minimal context passed to a clip handler (decoupled from the DmdDisplay shape).
export interface ClipContext {
  clip: string;
  value: number;
  score: number;
}

export type ClipHandler = (grid: Uint8Array, clockMs: number, ctx: ClipContext) => void;
export type ScoreOverlay = (grid: Uint8Array, display: ScoreDisplay, clockMs: number) => void;
export type FeverBanner = (grid: Uint8Array, score: number, clockMs: number) => void;
export type AttractRenderer = (
  grid: Uint8Array,
  display: { player: string },
  clockMs: number,
) => void;

export interface DmdMapContent {
  /** Map's normal palette (replaces the engine's PALETTE_NORMAL if provided).
   *  Lets each map have its own default dot colors. */
  paletteNormal?: Record<DotColor, string>;
  /** Alternate palette applied when display.alternateWorld. */
  paletteAlternateWorld?: Record<DotColor, string>;
  /** NeonBand color (top/bottom of the DMD screen). Default: ST red. */
  neonColor?: string;
  /** Cinematic handlers by clipId (take precedence over engine defaults). */
  cinematicHandlers?: Record<string, ClipHandler>;
  /** Overlay drawn on top of SCORE mode (e.g. HETIC row). */
  scoreOverlay?: ScoreOverlay;
  /** Full-screen banner when mapState.fever is active. */
  feverBanner?: FeverBanner;
  /** Full attract-mode rendering (otherwise minimal engine default). */
  attract?: AttractRenderer;
  /** Game Over burst duration (exit effect, ms). */
  alternateWorldBurstMs?: number;
}
