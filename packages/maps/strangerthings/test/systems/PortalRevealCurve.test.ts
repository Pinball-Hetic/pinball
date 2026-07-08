import { describe, expect, test } from 'bun:test';
import {
  mapPortalRevealProgress,
  portalRevealTotalDuration,
} from '../../systems/PortalRevealCurve';
import {
  UPSIDE_DOWN_PORTAL_OPEN_DURATION,
  UPSIDE_DOWN_PORTAL_REVEAL_DELAY,
} from '../../systems/UpsideDownConstants';

describe('mapPortalRevealProgress', () => {
  const delayFrac =
    UPSIDE_DOWN_PORTAL_REVEAL_DELAY / portalRevealTotalDuration();

  test('total duration is delay + open', () => {
    expect(portalRevealTotalDuration()).toBe(
      UPSIDE_DOWN_PORTAL_REVEAL_DELAY + UPSIDE_DOWN_PORTAL_OPEN_DURATION,
    );
  });

  test('starts at 0 and ends at 1', () => {
    expect(mapPortalRevealProgress(0)).toBe(0);
    expect(mapPortalRevealProgress(1)).toBeCloseTo(1, 6);
  });

  test('delay phase eases linearly to 0.28', () => {
    expect(mapPortalRevealProgress(delayFrac)).toBeCloseTo(0.28, 6);
    expect(mapPortalRevealProgress(delayFrac / 2)).toBeCloseTo(0.14, 6);
  });

  test('progress is monotonically non-decreasing across the reveal', () => {
    let prev = -Infinity;
    for (let i = 0; i <= 20; i += 1) {
      const p = mapPortalRevealProgress(i / 20);
      expect(p).toBeGreaterThanOrEqual(prev);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1.000001);
      prev = p;
    }
  });
});
