import { test, expect, describe } from "bun:test";
import {
  computeFrameDt,
  computeTrailIntensity,
  MAX_FRAME_DT,
  FIRST_FRAME_DT,
} from "../../../../src/components/pinball/hotLoop/frameMath";

describe("computeFrameDt", () => {
  test("première frame (prev<=0) → FIRST_FRAME_DT", () => {
    expect(computeFrameDt(0, 1000)).toBe(FIRST_FRAME_DT);
    expect(computeFrameDt(-5, 1000)).toBe(FIRST_FRAME_DT);
  });

  test("delta normal converti en secondes", () => {
    expect(computeFrameDt(1000, 1016)).toBeCloseTo(0.016, 5);
  });

  test("borné à MAX_FRAME_DT après un grand saut", () => {
    expect(computeFrameDt(1000, 5000)).toBe(MAX_FRAME_DT);
  });
});

describe("computeTrailIntensity", () => {
  test("hors jeu → 0 (même en fever/combo élevé)", () => {
    expect(computeTrailIntensity(false, true, 50)).toBe(0);
  });

  test("fever → 1", () => {
    expect(computeTrailIntensity(true, true, 0)).toBe(1);
  });

  test("rampe combo : ≤3 → 0, 10 → 1, milieu interpolé", () => {
    expect(computeTrailIntensity(true, false, 3)).toBe(0);
    expect(computeTrailIntensity(true, false, 2)).toBe(0);
    expect(computeTrailIntensity(true, false, 10)).toBe(1);
    expect(computeTrailIntensity(true, false, 17)).toBe(1); // clamp
    expect(computeTrailIntensity(true, false, 6.5)).toBeCloseTo(0.5, 5);
  });
});
