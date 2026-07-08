import { test, expect, describe, beforeEach } from 'bun:test';
import { StuckBallDetector } from '../../src/use-cases/DetectStuckBall';

// Default centered position (x = 0 → nudge toward +X).
const center = { x: 0 };

describe('StuckBallDetector', () => {
  let detector: StuckBallDetector;

  beforeEach(() => {
    detector = new StuckBallDetector();
  });

  test('returns null while the ball is moving (speed >= 0.02)', () => {
    expect(detector.update(0.5, center, 0.5)).toBeNull();
    // Even after a long dt, a fast ball never triggers.
    expect(detector.update(0.02, center, 10)).toBeNull();
  });

  test('returns null when slow but timer not yet over 1.0s', () => {
    expect(detector.update(0.01, center, 0.5)).toBeNull();
    expect(detector.update(0.01, center, 0.4)).toBeNull(); // timer = 0.9
  });

  test('does not trigger exactly at timer === 1.0 (strict >)', () => {
    expect(detector.update(0.01, center, 1.0)).toBeNull(); // timer = 1.0, not > 1.0
  });

  test('emits a nudge once the slow timer exceeds 1.0s', () => {
    const result = detector.update(0.01, center, 1.01);
    expect(result).toEqual({
      type: 'nudge',
      impulse: { x: 0.08, y: 0.02, z: 0.12 },
    });
  });

  test('nudge direction depends on ball X sign', () => {
    const right = detector.update(0.01, { x: 0.5 }, 1.01);
    expect(right!.impulse!.x).toBe(-0.08); // x > 0 → pushes toward -X

    const left = new StuckBallDetector().update(0.01, { x: -0.5 }, 1.01);
    expect(left!.impulse!.x).toBe(0.08); // x <= 0 → pushes toward +X
  });

  test('x === 0 nudges toward +X (boundary)', () => {
    const result = detector.update(0.01, { x: 0 }, 1.01);
    expect(result!.impulse!.x).toBe(0.08);
  });

  test('resets the timer between nudges (each nudge needs its own >1s)', () => {
    // 1st nudge
    expect(detector.update(0.01, center, 1.01)!.type).toBe('nudge');
    // Timer reset to zero → a small dt does not re-trigger.
    expect(detector.update(0.01, center, 0.5)).toBeNull();
    // 2nd nudge after a fresh overshoot.
    expect(detector.update(0.01, center, 0.6)!.type).toBe('nudge');
  });

  test('force_drain on the 3rd nudge', () => {
    expect(detector.update(0.01, center, 1.01)!.type).toBe('nudge'); // 1
    expect(detector.update(0.01, center, 1.01)!.type).toBe('nudge'); // 2
    const third = detector.update(0.01, center, 1.01); // 3
    expect(third).toEqual({ type: 'force_drain' });
    expect(third!.impulse).toBeUndefined();
  });

  test('nudge cycle restarts after a force_drain', () => {
    detector.update(0.01, center, 1.01); // nudge 1
    detector.update(0.01, center, 1.01); // nudge 2
    expect(detector.update(0.01, center, 1.01)!.type).toBe('force_drain'); // 3 → reset count
    // Counter back to zero: next trigger is a nudge again.
    expect(detector.update(0.01, center, 1.01)!.type).toBe('nudge');
  });

  test('a moving ball resets timer and nudge count', () => {
    detector.update(0.01, center, 1.01); // nudge 1
    detector.update(0.01, center, 1.01); // nudge 2 (count = 2)
    detector.update(0.5, center, 0.1); // ball moving → reset
    // count restarts at 0: 3 fresh nudges needed before force_drain.
    expect(detector.update(0.01, center, 1.01)!.type).toBe('nudge'); // 1
    expect(detector.update(0.01, center, 1.01)!.type).toBe('nudge'); // 2
    expect(detector.update(0.01, center, 1.01)!.type).toBe('force_drain');
  });

  test('reset() clears timer and nudge count', () => {
    detector.update(0.01, center, 1.01); // nudge 1
    detector.update(0.01, center, 0.9); // timer = 0.9
    detector.reset();
    // Timer cleared: 0.9 + 0.2 = 1.1 would only have triggered before reset.
    expect(detector.update(0.01, center, 0.2)).toBeNull(); // timer = 0.2
    // Nudge count is also zero → next trigger is a nudge, not force_drain.
    expect(detector.update(0.01, center, 1.0)!.type).toBe('nudge');
  });

  test('accumulates dt across multiple slow frames', () => {
    expect(detector.update(0.01, center, 0.4)).toBeNull(); // 0.4
    expect(detector.update(0.01, center, 0.4)).toBeNull(); // 0.8
    expect(detector.update(0.01, center, 0.3)!.type).toBe('nudge'); // 1.1 > 1.0
  });
});
