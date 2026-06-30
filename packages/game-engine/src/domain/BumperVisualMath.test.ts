import { test, expect, describe } from 'bun:test';
import { nearestBumperIndex, bumperPunchScale, type BumperPoint } from './BumperVisualMath';

describe('nearestBumperIndex', () => {
  const bumpers: BumperPoint[] = [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 0, z: 0 },
    { x: 0, y: 0, z: 10 },
  ];

  test('retourne l index du point le plus proche', () => {
    expect(nearestBumperIndex({ x: 9, y: 0, z: 0 }, bumpers)).toBe(1);
    expect(nearestBumperIndex({ x: 0, y: 0, z: 8 }, bumpers)).toBe(2);
  });

  test('compte y dans la distance', () => {
    const pts: BumperPoint[] = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 5, z: 0 },
    ];
    expect(nearestBumperIndex({ x: 0, y: 4, z: 0 }, pts)).toBe(1);
    expect(nearestBumperIndex({ x: 0, y: 1, z: 0 }, pts)).toBe(0);
  });

  test('liste vide -> 0', () => {
    expect(nearestBumperIndex({ x: 3, y: 3, z: 3 }, [])).toBe(0);
  });

  test('en cas d egalite stricte, garde le premier (< pas <=)', () => {
    const pts: BumperPoint[] = [
      { x: -1, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ];
    // équidistant de 0 -> le premier gagne car le second n'est pas strictement plus proche
    expect(nearestBumperIndex({ x: 0, y: 0, z: 0 }, pts)).toBe(0);
  });
});

describe('bumperPunchScale', () => {
  const DURATION = 0.18;
  const PEAK = 0.28;

  test('remaining <= 0 -> facteur 1', () => {
    expect(bumperPunchScale(0, DURATION, PEAK)).toBe(1);
    expect(bumperPunchScale(-0.5, DURATION, PEAK)).toBe(1);
  });

  test('prog=0 (remaining = duration) -> easeOutBack(0) ~ 0 -> ~1', () => {
    // easeOutBack(0) = 1 + 2.70158*(-1)^3 + 1.70158*(-1)^2 = 1 - 2.70158 + 1.70158 = 0
    expect(bumperPunchScale(DURATION, DURATION, PEAK)).toBeCloseTo(1, 6);
  });

  test('milieu (prog=0.5) atteint le pic 1+peak (easeOutBack(1)=1)', () => {
    // remaining = duration/2 -> prog = 0.5 -> branche basse, prog*2 = 1 -> easeOutBack(1) = 1
    expect(bumperPunchScale(DURATION / 2, DURATION, PEAK)).toBeCloseTo(1 + PEAK, 6);
  });

  test('branche haute redescend vers 1', () => {
    // prog = 0.75 -> env = 1 - (0.25)*2 = 0.5 -> facteur = 1 + peak*0.5
    const remaining = DURATION * 0.25;
    expect(bumperPunchScale(remaining, DURATION, PEAK)).toBeCloseTo(1 + PEAK * 0.5, 6);
  });

  test('respecte la constante peak (ST 0.20 vs Zelda 0.28)', () => {
    expect(bumperPunchScale(0.15 / 2, 0.15, 0.2)).toBeCloseTo(1.2, 6);
    expect(bumperPunchScale(0.18 / 2, 0.18, 0.28)).toBeCloseTo(1.28, 6);
  });

  test('clamp max(0, env): jamais sous 1', () => {
    // toute valeur de remaining dans (0, duration) donne env >= 0 dans cette courbe;
    // vérifie la borne basse au tout début et toute fin
    expect(bumperPunchScale(DURATION * 0.999, DURATION, PEAK)).toBeGreaterThanOrEqual(1);
    expect(bumperPunchScale(DURATION * 0.001, DURATION, PEAK)).toBeGreaterThanOrEqual(1);
  });
});
