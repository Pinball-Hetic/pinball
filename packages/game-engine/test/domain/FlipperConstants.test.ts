import { test, expect, describe } from 'bun:test';
import {
  SWING_RAD,
  SWING_SMOOTH,
  FLIPPER_Z_MIN,
  FLIPPER_Z_MAX,
  FLIPPER_RESTITUTION,
  FLIPPER_FRICTION,
  FLIPPER_MIN_LAUNCH_VZ,
  FLIPPER_MIN_LAUNCH_ANGVEL,
  INITIAL_LIVES,
  PLUNGER_CHARGE_MS,
  PLUNGER_MIN_FACTOR,
  PLUNGER_MAX_FACTOR,
  plungerChargeProgress,
  plungerLaunchFactor,
} from '../../src/domain/FlipperConstants';

describe('FlipperConstants invariants', () => {
  test('swing lerp factor is in (0, 1]', () => {
    expect(SWING_SMOOTH).toBeGreaterThan(0);
    expect(SWING_SMOOTH).toBeLessThanOrEqual(1);
  });

  test('swing amplitude is positive', () => {
    expect(SWING_RAD).toBeGreaterThan(0);
  });

  test('flipper Z zone is a non-degenerate ordered range', () => {
    expect(FLIPPER_Z_MIN).toBeLessThan(FLIPPER_Z_MAX);
  });

  test('restitution is a valid physical coefficient [0, 1]', () => {
    expect(FLIPPER_RESTITUTION).toBeGreaterThanOrEqual(0);
    expect(FLIPPER_RESTITUTION).toBeLessThanOrEqual(1);
  });

  test('friction is non-negative', () => {
    expect(FLIPPER_FRICTION).toBeGreaterThanOrEqual(0);
  });

  test('guaranteed launch velocity points up the table (negative Z)', () => {
    expect(FLIPPER_MIN_LAUNCH_VZ).toBeLessThan(0);
  });

  test('min launch angular velocity is positive', () => {
    expect(FLIPPER_MIN_LAUNCH_ANGVEL).toBeGreaterThan(0);
  });

  test('initial lives is a positive integer', () => {
    expect(Number.isInteger(INITIAL_LIVES)).toBe(true);
    expect(INITIAL_LIVES).toBeGreaterThan(0);
  });

  test('plunger charge duration is positive', () => {
    expect(PLUNGER_CHARGE_MS).toBeGreaterThan(0);
  });

  test('plunger factors form a valid min < max range within [0, 1]', () => {
    expect(PLUNGER_MIN_FACTOR).toBeGreaterThan(0);
    expect(PLUNGER_MIN_FACTOR).toBeLessThan(PLUNGER_MAX_FACTOR);
    expect(PLUNGER_MAX_FACTOR).toBeLessThanOrEqual(1);
  });
});

describe('plungerChargeProgress', () => {
  test('returns 0 at the very start of the charge', () => {
    expect(plungerChargeProgress(1000, 1000)).toBe(0);
  });

  test('returns ~1 exactly at full charge duration', () => {
    // (1)^1.15 === 1
    expect(plungerChargeProgress(PLUNGER_CHARGE_MS, 0)).toBe(1);
  });

  test('clamps to 1 when held past full charge', () => {
    expect(plungerChargeProgress(PLUNGER_CHARGE_MS * 5, 0)).toBe(1);
  });

  test('applies the 1.15 easing exponent mid-charge', () => {
    // half the charge time → (0.5)^1.15
    const half = plungerChargeProgress(PLUNGER_CHARGE_MS / 2, 0);
    expect(half).toBeCloseTo(0.5 ** 1.15, 10);
    // exponent > 1 puts the curve below the linear diagonal
    expect(half).toBeLessThan(0.5);
  });

  test('is monotonically increasing over the charge window', () => {
    const a = plungerChargeProgress(300, 0);
    const b = plungerChargeProgress(600, 0);
    const c = plungerChargeProgress(900, 0);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });

  test('negative elapsed (clock skew) yields NaN — base négative ** exposant fractionnaire', () => {
    // now < start → negative ratio; (neg) ** 1.15 = NaN in JS.
    // Documented edge case: callers must guarantee now >= chargeStart.
    expect(Number.isNaN(plungerChargeProgress(500, 1000))).toBe(true);
  });
});

describe('plungerLaunchFactor', () => {
  test('returns the minimum factor at zero progress', () => {
    expect(plungerLaunchFactor(0)).toBe(PLUNGER_MIN_FACTOR);
  });

  test('returns the maximum factor at full progress', () => {
    expect(plungerLaunchFactor(1)).toBe(PLUNGER_MAX_FACTOR);
  });

  test('interpolates linearly at half progress', () => {
    const mid = (PLUNGER_MIN_FACTOR + PLUNGER_MAX_FACTOR) / 2;
    expect(plungerLaunchFactor(0.5)).toBeCloseTo(mid, 10);
  });

  test('composes with plungerChargeProgress to stay within [min, max]', () => {
    const progress = plungerChargeProgress(PLUNGER_CHARGE_MS / 3, 0);
    const factor = plungerLaunchFactor(progress);
    expect(factor).toBeGreaterThanOrEqual(PLUNGER_MIN_FACTOR);
    expect(factor).toBeLessThanOrEqual(PLUNGER_MAX_FACTOR);
  });
});
