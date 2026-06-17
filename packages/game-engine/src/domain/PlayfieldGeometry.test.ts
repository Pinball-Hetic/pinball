import { afterEach, describe, expect, test } from 'bun:test';
import {
  configureSurfaceCoefficients,
  resetSurfaceCoefficients,
  surfaceYAtZ,
} from './PlayfieldGeometry';

afterEach(() => {
  resetSurfaceCoefficients();
});

describe('surfaceYAtZ', () => {
  test('defaults to the Stranger Things curve', () => {
    const st = (z: number) => 1.068 - ((z + 0.552) / 0.97) * 0.11;
    for (const z of [-0.552, -0.2, 0, 0.418]) {
      expect(surfaceYAtZ(z)).toBeCloseTo(st(z), 9);
    }
  });

  test('follows the configured map coefficients', () => {
    configureSurfaceCoefficients({ base: 2, zOffset: 0, zSpan: 1, yDrop: 0.5 });
    // base - ((z + 0)/1)*0.5
    expect(surfaceYAtZ(0)).toBeCloseTo(2, 9);
    expect(surfaceYAtZ(1)).toBeCloseTo(1.5, 9);
    expect(surfaceYAtZ(-1)).toBeCloseTo(2.5, 9);
  });

  test('reset restores the default curve', () => {
    configureSurfaceCoefficients({ base: 9, zOffset: 9, zSpan: 9, yDrop: 9 });
    resetSurfaceCoefficients();
    expect(surfaceYAtZ(0)).toBeCloseTo(1.068 - (0.552 / 0.97) * 0.11, 9);
  });
});
