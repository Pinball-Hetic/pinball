import { describe, expect, it } from 'bun:test';
import { BALL_MAX_SPEED } from '../domain/Ball';
import { ballCenterOnSurface } from '../domain/PlayfieldGeometry';
import {
  computeIdleSpawnLock,
  computeLaneStraightLock,
  computeSpeedClamp,
} from './BallFrameCorrections';

const lane = { leftWallTopZ: -0.3, lockX: 0.2, exitX: 0.15 };

describe('computeIdleSpawnLock', () => {
  it('locks translation to spawn on surface, zero velocities', () => {
    const spawn = { x: 0.24, y: 0.9, z: 0.4 };
    const r = computeIdleSpawnLock(spawn);
    expect(r.translation).toEqual({ x: 0.24, y: ballCenterOnSurface(0.4), z: 0.4 });
    expect(r.linvel).toEqual({ x: 0, y: 0, z: 0 });
    expect(r.angvel).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('computeLaneStraightLock', () => {
  it('returns straight-lock state when in the right (straight) part of the lane', () => {
    // z > leftWallTopZ AND x > lockX
    const pos = { x: 0.25, y: 0.85, z: 0.1 };
    const linvel = { x: 0.3, y: -0.1, z: -2.0 };
    const angvel = { x: 5, y: 7, z: 9 };
    const r = computeLaneStraightLock(pos, linvel, angvel, lane, 0.24);
    expect(r).not.toBe('close');
    expect(r).not.toBeNull();
    if (r === 'close' || r === null) throw new Error('unreachable');
    // X snapped to spawnX, Y/Z from pos
    expect(r.translation).toEqual({ x: 0.24, y: 0.85, z: 0.1 });
    // linvel: x cancelled, y/z preserved
    expect(r.linvel).toEqual({ x: 0, y: -0.1, z: -2.0 });
    // angvel: x preserved, y and z cancelled
    expect(r.angvel).toEqual({ x: 5, y: 0, z: 0 });
  });

  it("signals 'close' once past exitX (and not in straight zone)", () => {
    // not in straight (x <= lockX), and x < exitX
    const pos = { x: 0.1, y: 0.85, z: 0.1 };
    const r = computeLaneStraightLock(pos, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, lane, 0.24);
    expect(r).toBe('close');
  });

  it('returns null when neither in straight zone nor past exitX', () => {
    // x between exitX and lockX: 0.15 <= x <= 0.2, so not straight and not < exitX
    const pos = { x: 0.18, y: 0.85, z: 0.1 };
    const r = computeLaneStraightLock(pos, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, lane, 0.24);
    expect(r).toBeNull();
  });

  it('straight zone requires BOTH z > leftWallTopZ and x > lockX', () => {
    // x > lockX but z below leftWallTopZ → not straight; x=0.25 not < exitX → null
    const pos = { x: 0.25, y: 0.85, z: -0.4 };
    const r = computeLaneStraightLock(pos, { x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 }, lane, 0.24);
    expect(r).toBeNull();
  });
});

describe('computeSpeedClamp', () => {
  it('returns null when under max speed and y <= 1.25', () => {
    expect(computeSpeedClamp({ x: 1, y: 1, z: 1 })).toBeNull();
  });

  it('scales velocity down to BALL_MAX_SPEED when over the limit', () => {
    const vel = { x: 10, y: 0, z: 0 };
    const r = computeSpeedClamp(vel);
    expect(r).not.toBeNull();
    if (!r) throw new Error('unreachable');
    const speed = Math.sqrt(r.x ** 2 + r.y ** 2 + r.z ** 2);
    expect(speed).toBeCloseTo(BALL_MAX_SPEED, 6);
    expect(r).toEqual({ x: BALL_MAX_SPEED, y: 0, z: 0 });
  });

  it('caps a fast upward y to 0.35 using ORIGINAL x/z (overwrites the scale step)', () => {
    // both conditions fire: speed>max AND y>1.25. The second rule wins,
    // with ORIGINAL x/z (not scaled).
    const vel = { x: 3, y: 8, z: 0 };
    const r = computeSpeedClamp(vel);
    expect(r).toEqual({ x: 3, y: 0.35, z: 0 });
  });

  it('caps upward y even when not over max speed', () => {
    const vel = { x: 0.1, y: 2, z: 0.1 };
    const r = computeSpeedClamp(vel);
    expect(r).toEqual({ x: 0.1, y: 0.35, z: 0.1 });
  });
});
