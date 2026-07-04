import { describe, expect, test } from 'bun:test';
import { radialEjectionImpulse, sidedEjectionImpulse } from './BumperEjection';

describe('radialEjectionImpulse', () => {
  test('pushes the ball directly away from the bumper, scaled to magnitude', () => {
    const v = radialEjectionImpulse({ x: 3, z: 4 }, { x: 0, z: 0 }, 10);
    // (dx, dz) = (3, 4), len = 5 → unit (0.6, 0.8) × 10
    expect(v.x).toBeCloseTo(6, 9);
    expect(v.z).toBeCloseTo(8, 9);
    expect(v.y).toBe(0);
  });

  test('points along +X when ball is to the right on the same Z', () => {
    const v = radialEjectionImpulse({ x: 2, z: 1 }, { x: 0, z: 1 }, 7);
    expect(v.x).toBeCloseTo(7, 9);
    expect(v.z).toBeCloseTo(0, 9);
  });

  test('negative offsets produce a negative direction', () => {
    const v = radialEjectionImpulse({ x: -1, z: -1 }, { x: 0, z: 0 }, Math.SQRT2);
    expect(v.x).toBeCloseTo(-1, 9);
    expect(v.z).toBeCloseTo(-1, 9);
  });

  test('guards division by zero when ball sits on the bumper center (len || 1)', () => {
    const v = radialEjectionImpulse({ x: 0, z: 0 }, { x: 0, z: 0 }, 10);
    expect(v.x).toBe(0);
    expect(v.z).toBe(0);
    expect(v.y).toBe(0);
  });
});

describe('sidedEjectionImpulse', () => {
  test('left bumper pushes right (+X)', () => {
    expect(sidedEjectionImpulse('left', 5)).toEqual({ x: 5, y: 0, z: 0 });
  });

  test('right bumper pushes left (-X)', () => {
    expect(sidedEjectionImpulse('right', 5)).toEqual({ x: -5, y: 0, z: 0 });
  });

  test('never produces vertical or depth components', () => {
    const v = sidedEjectionImpulse('left', 3.5);
    expect(v.y).toBe(0);
    expect(v.z).toBe(0);
  });
});
