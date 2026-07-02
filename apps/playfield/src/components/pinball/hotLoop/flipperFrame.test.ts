import { test, expect, describe } from "bun:test";
import { SWING_RAD } from "@pinball/game-engine";
import {
  computeSwingStep,
  decayFlash,
  createFlipperFrameState,
} from "./flipperFrame";

describe("computeSwingStep", () => {
  test("converge vers SWING_RAD quand target=1", () => {
    let swing = 0;
    for (let i = 0; i < 200; i++) swing = computeSwingStep(swing, 1, 1 / 60);
    expect(swing).toBeCloseTo(SWING_RAD, 3);
  });

  test("converge vers 0 quand target=0", () => {
    let swing = SWING_RAD;
    for (let i = 0; i < 200; i++) swing = computeSwingStep(swing, 0, 1 / 60);
    expect(swing).toBeCloseTo(0, 3);
  });

  test("monotone croissant vers la cible", () => {
    const a = computeSwingStep(0, 1, 1 / 60);
    const b = computeSwingStep(a, 1, 1 / 60);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThanOrEqual(SWING_RAD);
  });

  test("frame-rate independent : 2 pas à 120 Hz ≈ 1 pas à 60 Hz", () => {
    const at60 = computeSwingStep(0, 1, 1 / 60);
    let at120 = computeSwingStep(0, 1, 1 / 120);
    at120 = computeSwingStep(at120, 1, 1 / 120);
    expect(at120).toBeCloseTo(at60, 4);
  });
});

describe("decayFlash", () => {
  test("décroît linéairement, plancher 0", () => {
    expect(decayFlash(0.1, 0.016)).toBeCloseTo(0.084, 5);
    expect(decayFlash(0.01, 0.016)).toBe(0);
    expect(decayFlash(0, 0.016)).toBe(0);
  });
});

describe("createFlipperFrameState", () => {
  test("état initial à zéro", () => {
    const s = createFlipperFrameState();
    expect(s).toEqual({
      leftSwing: 0,
      rightSwing: 0,
      prevLeftSwing: 0,
      prevRightSwing: 0,
      leftFlash: 0,
      rightFlash: 0,
    });
  });
});
