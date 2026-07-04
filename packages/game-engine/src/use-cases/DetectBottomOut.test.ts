import { test, expect, describe } from 'bun:test';
import { DetectBottomOut } from './DetectBottomOut';
import { BOTTOM_OUT_Z } from '../domain/PlayfieldGeometry';
import { WALL_RIGHT_X } from '../domain/Ball';

describe('DetectBottomOut.check', () => {
  const detector = new DetectBottomOut();

  test('vrai quand z atteint le seuil et x dans le plateau', () => {
    expect(detector.check({ x: 0, z: BOTTOM_OUT_Z })).toBe(true);
  });

  test('vrai au-delà du seuil z', () => {
    expect(detector.check({ x: 0, z: BOTTOM_OUT_Z + 0.1 })).toBe(true);
  });

  test('faux juste avant le seuil z', () => {
    expect(detector.check({ x: 0, z: BOTTOM_OUT_Z - 0.001 })).toBe(false);
  });

  test('couvre toute la largeur jusqu\'au mur droit (pas de limite couloir)', () => {
    // Even on the shooter lane side (high x), the ball must drain.
    expect(detector.check({ x: WALL_RIGHT_X, z: BOTTOM_OUT_Z })).toBe(true);
  });

  test('faux au-delà du mur droit (x > WALL_RIGHT_X)', () => {
    expect(detector.check({ x: WALL_RIGHT_X + 0.001, z: BOTTOM_OUT_Z })).toBe(false);
  });

  test('vrai pour x très négatif (côté gauche du plateau)', () => {
    expect(detector.check({ x: -0.265, z: BOTTOM_OUT_Z + 0.05 })).toBe(true);
  });

  test('faux quand z sous le seuil même avec x valide', () => {
    expect(detector.check({ x: -0.1, z: 0 })).toBe(false);
  });
});
