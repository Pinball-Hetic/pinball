import type { DmdDisplay } from '@pinball/shared-types';
import type { DotColor } from './palette';

// Contrat de contenu DMD fourni par une map. Le moteur (makeLayouts) reste
// générique ; la map injecte ses cinématiques, palettes et overlays.

export type ScoreDisplay = Extract<DmdDisplay, { mode: 'SCORE' }>;

// Contexte minimal passé à un handler de clip (découplé du shape DmdDisplay).
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
  /** Palette alternative (ex. Upside Down) appliquée quand display.upsideDown. */
  paletteUpsideDown?: Record<DotColor, string>;
  /** Handlers de cinématiques par clipId (priment sur les défauts du moteur). */
  cinematicHandlers?: Record<string, ClipHandler>;
  /** Overlay dessiné par-dessus le mode SCORE (ex. rangée HETIC). */
  scoreOverlay?: ScoreOverlay;
  /** Bandeau plein écran quand mapState.fever est actif. */
  feverBanner?: FeverBanner;
  /** Rendu complet de l'attract mode (sinon défaut minimal du moteur). */
  attract?: AttractRenderer;
  /** Durée du burst Game Over (effet de sortie, ms). */
  upsideDownBurstMs?: number;
}
