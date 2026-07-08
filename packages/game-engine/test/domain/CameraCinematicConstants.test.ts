import { test, expect, describe } from 'bun:test';
import {
  CAMERA_CINEMATIC_DISTANCE_MIN,
  CAMERA_CINEMATIC_FOV_MIN,
  CAMERA_CINEMATIC_FOV_MAX,
  PORTRAIT_CINEMATIC_DISTANCE_MUL,
  cinematicZoomDistance,
} from '../../src/domain/CameraCinematicConstants';

describe('constantes cinématiques', () => {
  test('distance min strictement positive', () => {
    expect(CAMERA_CINEMATIC_DISTANCE_MIN).toBeGreaterThan(0);
  });

  test('plage FOV cohérente (min < max)', () => {
    expect(CAMERA_CINEMATIC_FOV_MIN).toBeLessThan(CAMERA_CINEMATIC_FOV_MAX);
  });

  test('multiplicateur portrait > 1 (zoom plus loin en portrait)', () => {
    expect(PORTRAIT_CINEMATIC_DISTANCE_MUL).toBeGreaterThan(1);
  });
});

describe('cinematicZoomDistance', () => {
  test('non-portrait : base * scale, multiplicateur neutre', () => {
    expect(cinematicZoomDistance(2, 0.5, false)).toBeCloseTo(1, 10);
  });

  test('portrait : applique le multiplicateur', () => {
    expect(cinematicZoomDistance(2, 0.5, true)).toBeCloseTo(
      1 * PORTRAIT_CINEMATIC_DISTANCE_MUL,
      10,
    );
  });

  test('clamp au minimum quand le résultat est trop petit', () => {
    expect(cinematicZoomDistance(0.001, 0.001, false)).toBe(
      CAMERA_CINEMATIC_DISTANCE_MIN,
    );
  });

  test('clamp au minimum avec scale nul', () => {
    expect(cinematicZoomDistance(5, 0, false)).toBe(
      CAMERA_CINEMATIC_DISTANCE_MIN,
    );
  });

  test('clamp au minimum avec base nulle', () => {
    expect(cinematicZoomDistance(0, 1, true)).toBe(
      CAMERA_CINEMATIC_DISTANCE_MIN,
    );
  });

  test('au-dessus du minimum : pas de clamp', () => {
    const d = cinematicZoomDistance(1, 1, false);
    expect(d).toBeGreaterThan(CAMERA_CINEMATIC_DISTANCE_MIN);
    expect(d).toBeCloseTo(1, 10);
  });

  test('portrait pousse la distance plus loin que non-portrait', () => {
    const base = 1;
    const scale = 1;
    expect(cinematicZoomDistance(base, scale, true)).toBeGreaterThan(
      cinematicZoomDistance(base, scale, false),
    );
  });

  test('valeur exactement au minimum reste au minimum', () => {
    // base*scale*mul == DISTANCE_MIN (mul=1 when not portrait)
    expect(cinematicZoomDistance(CAMERA_CINEMATIC_DISTANCE_MIN, 1, false)).toBe(
      CAMERA_CINEMATIC_DISTANCE_MIN,
    );
  });
});
