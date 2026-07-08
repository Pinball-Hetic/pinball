import { strobeOn } from './CinematicEasing';

export interface CinematicFreezeFeedbackConfig {
  hz: number;
  maxMix: number;
  activeFraction: number;
  fadeOutFraction: number;
}

export interface CinematicFreezeFeedback {
  on: boolean;
  mix: number;
}

const OFF: CinematicFreezeFeedback = { on: false, mix: 0 };

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
