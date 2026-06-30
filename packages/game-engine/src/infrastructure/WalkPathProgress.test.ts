import { describe, it, expect, afterEach } from 'bun:test';
import {
  WalkPathProgress,
  cameraFacingYaw,
  pathFacingYaw,
} from './WalkPathProgress';
import {
  surfaceYAtZ,
  resetSurfaceCoefficients,
} from '../domain/PlayfieldGeometry';

afterEach(() => {
  resetSurfaceCoefficients();
});

describe('WalkPathProgress.progressAt', () => {
  const path = new WalkPathProgress({ x: 0, z: 0 }, { x: 1, z: 1 }, 0, 4);

  it('is 0 at elapsed 0', () => {
    expect(path.progressAt(0)).toBe(0);
  });

  it('is the elapsed/duration ratio mid-walk', () => {
    expect(path.progressAt(1)).toBe(0.25);
    expect(path.progressAt(2)).toBe(0.5);
  });

  it('reaches 1 at the duration', () => {
    expect(path.progressAt(4)).toBe(1);
  });

  it('clamps to 1 past the duration', () => {
    expect(path.progressAt(10)).toBe(1);
  });
});

describe('WalkPathProgress.positionAt', () => {
  it('returns spawn x/z at t=0 with y on the surface plus foot lift', () => {
    const footLift = 0.02;
    const path = new WalkPathProgress({ x: -0.2, z: -0.3 }, { x: 0.1, z: 0.2 }, footLift, 2);
    const p = path.positionAt(0);
    expect(p.x).toBeCloseTo(-0.2, 12);
    expect(p.z).toBeCloseTo(-0.3, 12);
    expect(p.y).toBeCloseTo(surfaceYAtZ(-0.3) + footLift, 12);
  });

  it('returns target x/z at t=1', () => {
    const path = new WalkPathProgress({ x: -0.2, z: -0.3 }, { x: 0.1, z: 0.2 }, 0, 2);
    const p = path.positionAt(1);
    expect(p.x).toBeCloseTo(0.1, 12);
    expect(p.z).toBeCloseTo(0.2, 12);
    expect(p.y).toBeCloseTo(surfaceYAtZ(0.2), 12);
  });

  it('lerps x/z linearly at t=0.5', () => {
    const path = new WalkPathProgress({ x: -0.2, z: -0.4 }, { x: 0.2, z: 0.4 }, 0.05, 2);
    const p = path.positionAt(0.5);
    expect(p.x).toBeCloseTo(0, 12);
    expect(p.z).toBeCloseTo(0, 12);
    expect(p.y).toBeCloseTo(surfaceYAtZ(0) + 0.05, 12);
  });

  it('clamps t below 0 to the spawn', () => {
    const path = new WalkPathProgress({ x: -0.2, z: -0.3 }, { x: 0.1, z: 0.2 }, 0, 2);
    const p = path.positionAt(-5);
    expect(p.x).toBeCloseTo(-0.2, 12);
    expect(p.z).toBeCloseTo(-0.3, 12);
  });

  it('clamps t above 1 to the target', () => {
    const path = new WalkPathProgress({ x: -0.2, z: -0.3 }, { x: 0.1, z: 0.2 }, 0, 2);
    const p = path.positionAt(5);
    expect(p.x).toBeCloseTo(0.1, 12);
    expect(p.z).toBeCloseTo(0.2, 12);
  });
});

describe('cameraFacingYaw', () => {
  it('returns atan2(camX-anchorX, camZ-anchorZ) + yaw', () => {
    const anchor = { x: 0, z: 0 };
    const cam = { x: 1, z: 1 };
    expect(cameraFacingYaw(anchor, cam, 0)).toBeCloseTo(Math.atan2(1, 1), 12);
  });

  it('adds the yaw offset', () => {
    const anchor = { x: 0.1, z: -0.2 };
    const cam = { x: 0.5, z: 0.3 };
    const yaw = Math.PI / 3;
    const expected = Math.atan2(cam.x - anchor.x, cam.z - anchor.z) + yaw;
    expect(cameraFacingYaw(anchor, cam, yaw)).toBeCloseTo(expected, 12);
  });
});

describe('pathFacingYaw', () => {
  it('returns atan2(targetX-spawnX, targetZ-spawnZ) + yaw', () => {
    const spawn = { x: 0, z: 0 };
    const target = { x: 1, z: 0 };
    expect(pathFacingYaw(spawn, target, 0)).toBeCloseTo(Math.atan2(1, 0), 12);
  });

  it('adds the yaw offset', () => {
    const spawn = { x: -0.3, z: -0.5 };
    const target = { x: 0.2, z: 0.4 };
    const yaw = -Math.PI / 4;
    const expected = Math.atan2(target.x - spawn.x, target.z - spawn.z) + yaw;
    expect(pathFacingYaw(spawn, target, yaw)).toBeCloseTo(expected, 12);
  });
});
