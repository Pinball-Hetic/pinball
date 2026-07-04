import { strobeOn } from './CinematicEasing';

export interface CinematicFreezeFeedbackConfig {
  /** strobe frequency during the freeze (Hz) */
  hz: number;
  /** max flash intensity (mix passed to the strobe) */
  maxMix: number;
  /**
   * fraction [0..1] of the freeze duration during which the feedback is
   * active. < 1 → the strobe stops before the clip ends (rest before play
   * resumes), avoiding a harsh flash right when physics restarts.
   */
  activeFraction: number;
  /** fraction [0..1] of the active window spent fading out */
  fadeOutFraction: number;
}

export interface CinematicFreezeFeedback {
  on: boolean;
  mix: number;
}

const OFF: CinematicFreezeFeedback = { on: false, mix: 0 };

/**
 * Playfield feedback state (strobed flash) during a cinematic freeze. Makes
 * the freeze read as intentional rather than a dead hang.
 *
 * - outside the freeze (elapsed < 0 or duration <= 0) → OFF
 * - inside the active window → strobe on/off at `hz`, mix fades out
 * - past the active window → OFF (rest before physics resumes)
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
