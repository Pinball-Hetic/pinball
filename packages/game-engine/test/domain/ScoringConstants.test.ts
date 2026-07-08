import { test, expect, describe } from 'bun:test';
import {
  SCORE_BUMPER,
  SCORE_BUMP,
  SCORE_SLINGSHOT,
  SCORE_POP_ZONE,
  SCORE_RAMP,
  SCORE_DROP_TARGET,
  SCORE_DROP_COMPLETE,
} from '../../src/domain/ScoringConstants';

describe('ScoringConstants invariants', () => {
  const allScores = {
    SCORE_BUMPER,
    SCORE_BUMP,
    SCORE_SLINGSHOT,
    SCORE_POP_ZONE,
    SCORE_RAMP,
    SCORE_DROP_TARGET,
    SCORE_DROP_COMPLETE,
  };

  test('every score is a positive integer', () => {
    for (const [name, value] of Object.entries(allScores)) {
      expect(Number.isInteger(value), `${name} should be an integer`).toBe(true);
      expect(value, `${name} should be positive`).toBeGreaterThan(0);
    }
  });

  test('completing all drop targets rewards more than a single target', () => {
    expect(SCORE_DROP_COMPLETE).toBeGreaterThan(SCORE_DROP_TARGET);
  });

  test('the bumper is the highest single per-hit score (excl. completion bonus)', () => {
    const perHit = [
      SCORE_BUMPER,
      SCORE_BUMP,
      SCORE_SLINGSHOT,
      SCORE_POP_ZONE,
      SCORE_RAMP,
      SCORE_DROP_TARGET,
    ];
    expect(Math.max(...perHit)).toBe(SCORE_BUMPER);
  });

  test('slingshot is the lowest-value event', () => {
    expect(Math.min(...Object.values(allScores))).toBe(SCORE_SLINGSHOT);
  });

  test('exposes the expected score values', () => {
    expect(SCORE_BUMPER).toBe(1000);
    expect(SCORE_BUMP).toBe(30);
    expect(SCORE_SLINGSHOT).toBe(10);
    expect(SCORE_POP_ZONE).toBe(50);
    expect(SCORE_RAMP).toBe(200);
    expect(SCORE_DROP_TARGET).toBe(75);
    expect(SCORE_DROP_COMPLETE).toBe(500);
  });
});
