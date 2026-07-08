import { describe, expect, it } from 'bun:test';
import {
  FLIPPER_LAUNCH_VX_ATTENUATION,
  FLIPPER_MIN_LAUNCH_ANGVEL,
  FLIPPER_MIN_LAUNCH_VZ,
} from '../../src/domain/FlipperConstants';
import type { FlipperZone } from '../../src/infrastructure/FlipperZones';
import { computeFlipperLaunchAssist } from '../../src/use-cases/FlipperLaunchAssist';

const zone: FlipperZone = {
  xMin: -1,
  xMax: 1,
  yMin: 0,
  yMax: 1,
  zMin: -1,
  zMax: 1,
};

const insidePos = { x: 0, y: 0.5, z: 0 };

describe('computeFlipperLaunchAssist', () => {
  it('rewrites linvel when in zone, angVel above threshold, vz above min', () => {
    const result = computeFlipperLaunchAssist({
      pos: insidePos,
      vel: { x: 2, y: 0.4, z: -1 },
      zone,
      angVel: FLIPPER_MIN_LAUNCH_ANGVEL + 1,
    });
    expect(result).not.toBeNull();
    expect(result!.linvel.x).toBeCloseTo(2 * FLIPPER_LAUNCH_VX_ATTENUATION, 10);
    expect(result!.linvel.y).toBe(0.4);
    expect(result!.linvel.z).toBe(FLIPPER_MIN_LAUNCH_VZ);
  });

  it('returns null when ball outside the zone', () => {
    const result = computeFlipperLaunchAssist({
      pos: { x: 5, y: 0.5, z: 0 },
      vel: { x: 2, y: 0.4, z: -1 },
      zone,
      angVel: FLIPPER_MIN_LAUNCH_ANGVEL + 1,
    });
    expect(result).toBeNull();
  });

  it('returns null when angVel at or below threshold', () => {
    const result = computeFlipperLaunchAssist({
      pos: insidePos,
      vel: { x: 2, y: 0.4, z: -1 },
      zone,
      angVel: FLIPPER_MIN_LAUNCH_ANGVEL,
    });
    expect(result).toBeNull();
  });

  it('returns null when vz at or below FLIPPER_MIN_LAUNCH_VZ', () => {
    const result = computeFlipperLaunchAssist({
      pos: insidePos,
      vel: { x: 2, y: 0.4, z: FLIPPER_MIN_LAUNCH_VZ },
      zone,
      angVel: FLIPPER_MIN_LAUNCH_ANGVEL + 1,
    });
    expect(result).toBeNull();
  });

  it('treats zone boundaries as inclusive on y, exclusive on x/z', () => {
    // y at yMax is inclusive, x/z strictly inside
    const result = computeFlipperLaunchAssist({
      pos: { x: 0, y: 1, z: 0 },
      vel: { x: 4, y: 0, z: -1 },
      zone,
      angVel: FLIPPER_MIN_LAUNCH_ANGVEL + 1,
    });
    expect(result).not.toBeNull();
    expect(result!.linvel.x).toBeCloseTo(4 * FLIPPER_LAUNCH_VX_ATTENUATION, 10);
  });
});
