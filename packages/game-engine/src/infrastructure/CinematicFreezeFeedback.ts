import { strobeOn } from './CinematicEasing';

export interface CinematicFreezeFeedbackConfig {
  /** fréquence du strobe pendant le gel (Hz) */
  hz: number;
  /** intensité max du flash (mix passé au strobe) */
  maxMix: number;
  /**
   * part [0..1] de la durée du gel pendant laquelle le feedback est actif.
   * < 1 → le strobe s'arrête avant la fin du clip (repos avant reprise jeu),
   * évitant un flash brutal au moment où la physique redémarre.
   */
  activeFraction: number;
  /** part [0..1] de la fenêtre active consacrée au fondu de sortie */
  fadeOutFraction: number;
}

export interface CinematicFreezeFeedback {
  on: boolean;
  mix: number;
}

const OFF: CinematicFreezeFeedback = { on: false, mix: 0 };

/**
 * Décision pure : état du feedback playfield (flash strobé) pendant un gel de
 * cinématique. Rend le gel « lisible » comme intentionnel plutôt qu'un freeze
 * mort. Aucune dépendance Three.js — testable à la milliseconde.
 *
 * - hors gel (elapsed < 0 ou duration <= 0) → OFF
 * - dans la fenêtre active → strobe on/off à `hz`, mix fondu en sortie
 * - après la fenêtre active → OFF (repos avant reprise physique)
 */
export function cinematicFreezeFeedback(
  elapsedMs: number,
  durationMs: number,
  config: CinematicFreezeFeedbackConfig,
): CinematicFreezeFeedback {
  if (elapsedMs < 0 || durationMs <= 0) return OFF;

  const activeMs = durationMs * clamp01(config.activeFraction);
  if (activeMs <= 0 || elapsedMs >= activeMs) return OFF;

  const seconds = elapsedMs / 1000;
  const on = strobeOn(seconds, config.hz);

  const fadeStart = activeMs * (1 - clamp01(config.fadeOutFraction));
  const fade =
    elapsedMs <= fadeStart || activeMs <= fadeStart
      ? 1
      : 1 - (elapsedMs - fadeStart) / (activeMs - fadeStart);

  return { on, mix: config.maxMix * clamp01(fade) };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
