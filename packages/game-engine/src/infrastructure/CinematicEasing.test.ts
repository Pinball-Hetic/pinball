import { test, expect, describe } from 'bun:test';
import { easeOut, easeIn, easeInOut, strobeOn } from './CinematicEasing';

describe('easeOut', () => {
  test('boundaries: 0 -> 0, 1 -> 1', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
  });

  test('démarre vite puis ralentit (au-dessus de la linéaire au milieu)', () => {
    expect(easeOut(0.5)).toBeCloseTo(0.875, 6);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
  });

  test('monotone croissante', () => {
    expect(easeOut(0.25)).toBeLessThan(easeOut(0.75));
  });
});

describe('easeIn', () => {
  test('boundaries: 0 -> 0, 1 -> 1', () => {
    expect(easeIn(0)).toBe(0);
    expect(easeIn(1)).toBe(1);
  });

  test('démarre lentement (sous la linéaire au milieu)', () => {
    expect(easeIn(0.5)).toBeCloseTo(0.125, 6);
    expect(easeIn(0.5)).toBeLessThan(0.5);
  });

  test('cube exact', () => {
    expect(easeIn(0.2)).toBeCloseTo(0.008, 6);
  });
});

describe('easeInOut', () => {
  test('boundaries: 0 -> 0, 1 -> 1', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
  });

  test('symétrique autour de 0.5', () => {
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 6);
  });

  test('branche basse (t < 0.5) utilise 4*t^3', () => {
    expect(easeInOut(0.25)).toBeCloseTo(4 * 0.25 ** 3, 6);
    expect(easeInOut(0.25)).toBeLessThan(0.25);
  });

  test('branche haute (t >= 0.5) accélère vers 1', () => {
    expect(easeInOut(0.75)).toBeCloseTo(1 - Math.pow(-2 * 0.75 + 2, 3) / 2, 6);
    expect(easeInOut(0.75)).toBeGreaterThan(0.75);
  });

  test('symétrie de la courbe: f(t) + f(1-t) = 1', () => {
    expect(easeInOut(0.3) + easeInOut(0.7)).toBeCloseTo(1, 6);
  });
});

describe('strobeOn', () => {
  test('true sur la première moitié de la période, false sur la seconde', () => {
    // hz = 1 -> période 1s. sin > 0 pour t dans (0, 0.5).
    expect(strobeOn(0.25, 1)).toBe(true);
    expect(strobeOn(0.75, 1)).toBe(false);
  });

  test('faux exactement à t=0 (sin = 0, pas > 0)', () => {
    expect(strobeOn(0, 5)).toBe(false);
  });

  test('repasse à false sur la seconde moitié de période', () => {
    // hz=1 : sin négatif sur (0.5, 1) -> off.
    expect(strobeOn(0.6, 1)).toBe(false);
  });

  test('fréquence plus élevée commute plus vite', () => {
    // hz = 2 -> période 0.5s. t=0.125 est dans la 1re moitié.
    expect(strobeOn(0.125, 2)).toBe(true);
    expect(strobeOn(0.375, 2)).toBe(false);
  });
});
