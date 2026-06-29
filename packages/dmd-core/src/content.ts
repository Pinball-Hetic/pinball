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
  /** Palette normale de la map (remplace PALETTE_NORMAL du moteur si fournie).
   *  Permet à chaque map d'avoir ses propres couleurs de dots par défaut. */
  paletteNormal?: Record<DotColor, string>;
  /** Palette alternative appliquée quand display.alternateWorld. */
  paletteAlternateWorld?: Record<DotColor, string>;
  /** Couleur du bandeau NeonBand (haut/bas de l'écran DMD). Défaut : rouge ST. */
  neonColor?: string;
  /** Handlers de cinématiques par clipId (priment sur les défauts du moteur). */
  cinematicHandlers?: Record<string, ClipHandler>;
  /** Overlay dessiné par-dessus le mode SCORE (ex. rangée HETIC). */
  scoreOverlay?: ScoreOverlay;
  /** Bandeau plein écran quand mapState.fever est actif. */
  feverBanner?: FeverBanner;
  /** Rendu complet de l'attract mode (sinon défaut minimal du moteur). */
  attract?: AttractRenderer;
  /** Durée du burst Game Over (effet de sortie, ms). */
  alternateWorldBurstMs?: number;
}
