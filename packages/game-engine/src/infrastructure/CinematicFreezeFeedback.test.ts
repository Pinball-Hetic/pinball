import { describe, expect, test } from 'bun:test';
import {
  cinematicFreezeFeedback,
  type CinematicFreezeFeedbackConfig,
} from './CinematicFreezeFeedback';

const cfg = (o: Partial<CinematicFreezeFeedbackConfig> = {}): CinematicFreezeFeedbackConfig => ({
  hz: 8,
  maxMix: 1,
  activeFraction: 0.8,
  fadeOutFraction: 0.3,
  ...o,
});

describe('cinematicFreezeFeedback', () => {
  test('off before the clip starts (negative elapsed)', () => {
    expect(cinematicFreezeFeedback(-1, 1000, cfg())).toEqual({ on: false, mix: 0 });
  });

  test('off when duration is zero or negative', () => {
    expect(cinematicFreezeFeedback(10, 0, cfg())).toEqual({ on: false, mix: 0 });
    expect(cinematicFreezeFeedback(10, -5, cfg())).toEqual({ on: false, mix: 0 });
  });

  test('off once past the active window (rest before physics resumes)', () => {
    // active window = 800ms of a 1000ms freeze
    expect(cinematicFreezeFeedback(801, 1000, cfg()).mix).toBe(0);
    expect(cinematicFreezeFeedback(801, 1000, cfg()).on).toBe(false);
    expect(cinematicFreezeFeedback(999, 1000, cfg()).mix).toBe(0);
  });

  test('full mix at the start of the active window', () => {
    // t=0 → sin(0)=0, not > 0, so on=false but mix should be full (fade=1)
    const early = cinematicFreezeFeedback(20, 1000, cfg({ hz: 8, fadeOutFraction: 0.3 }));
    expect(early.mix).toBeCloseTo(1, 6);
  });

  test('strobe toggles on/off at the configured hz', () => {
    // hz=2 → period 0.5s. on when sin(2*pi*2*t) > 0 → first quarter (t in (0,0.25))
    const c = cfg({ hz: 2 });
    expect(cinematicFreezeFeedback(100, 1000, c).on).toBe(true); // t=0.1s
    expect(cinematicFreezeFeedback(300, 1000, c).on).toBe(false); // t=0.3s
  });

  test('mix fades out across the tail of the active window', () => {
    // activeMs=800, fadeStart=800*(1-0.3)=560. At 560 mix=full, near 800 mix→0.
    const c = cfg({ hz: 8, maxMix: 1, activeFraction: 0.8, fadeOutFraction: 0.3 });
    const atFadeStart = cinematicFreezeFeedback(560, 1000, c).mix;
    const mid = cinematicFreezeFeedback(680, 1000, c).mix; // halfway through fade
    const late = cinematicFreezeFeedback(795, 1000, c).mix;
    expect(atFadeStart).toBeCloseTo(1, 6);
    expect(mid).toBeCloseTo(0.5, 2);
    expect(late).toBeLessThan(0.1);
  });

  test('maxMix scales the output', () => {
    const c = cfg({ maxMix: 0.4, fadeOutFraction: 0 });
    expect(cinematicFreezeFeedback(50, 1000, c).mix).toBeCloseTo(0.4, 6);
  });

  test('activeFraction clamps above 1 (whole freeze is active)', () => {
    const c = cfg({ activeFraction: 5, fadeOutFraction: 0 });
    expect(cinematicFreezeFeedback(950, 1000, c).mix).toBeCloseTo(1, 6);
  });
});
