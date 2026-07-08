import type { DmdDisplay } from '@pinball/shared-types';
import type { DotColor } from './palette';

export type ScoreDisplay = Extract<DmdDisplay, { mode: 'SCORE' }>;

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
  paletteNormal?: Record<DotColor, string>;
  paletteAlternateWorld?: Record<DotColor, string>;
  neonColor?: string;
  cinematicHandlers?: Record<string, ClipHandler>;
  scoreOverlay?: ScoreOverlay;
  feverBanner?: FeverBanner;
  attract?: AttractRenderer;
  alternateWorldBurstMs?: number;
}
