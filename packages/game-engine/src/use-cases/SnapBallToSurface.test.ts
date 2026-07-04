import { test, expect } from 'bun:test';
import { computeSurfaceSnap } from './SnapBallToSurface';
import { SURFACE_SNAP_THRESHOLD } from '../domain/Ball';
import { ballCenterOnSurface } from '../domain/PlayfieldGeometry';

// Valid play point (playfield center, outside the shooter lane).
const X = 0;
const Z = 0;
const surfaceY = ballCenterOnSurface(Z);
// Injected lane config.
const LANE = { leftWallTopZ: -0.28, lockX: 0.19 };

test('snaps a ball that lifted above the threshold', () => {
  const snap = computeSurfaceSnap(
    { x: X, y: surfaceY + SURFACE_SNAP_THRESHOLD + 0.01, z: Z },
    { x: 1, y: 2, z: 3 },
    LANE,
  );
  expect(snap).not.toBeNull();
  expect(snap!.translation).toEqual({ x: X, y: surfaceY, z: Z });
});

test('cancels only positive Y velocity, preserves XZ', () => {
  const snap = computeSurfaceSnap(
    { x: X, y: surfaceY + 0.05, z: Z },
    { x: 1.5, y: 2, z: -3.2 },
    LANE,
  );
  expect(snap!.linvel).toEqual({ x: 1.5, y: 0, z: -3.2 });
});

test('does not touch a downward (gravity) Y velocity', () => {
  const snap = computeSurfaceSnap(
    { x: X, y: surfaceY + 0.05, z: Z },
    { x: 1, y: -2, z: 3 },
    LANE,
  );
  expect(snap!.translation).toEqual({ x: X, y: surfaceY, z: Z });
  expect(snap!.linvel).toBeUndefined();
});

test('returns null when within the jitter threshold', () => {
  const snap = computeSurfaceSnap(
    { x: X, y: surfaceY + SURFACE_SNAP_THRESHOLD * 0.5, z: Z },
    { x: 0, y: 1, z: 0 },
    LANE,
  );
  expect(snap).toBeNull();
});

test('returns null inside the straight shooter lane', () => {
  // z > LEFT_WALL_TOP_Z (-0.28) and x > LOCK_X (0.19) → straight lane.
  const snap = computeSurfaceSnap(
    { x: 0.235, y: 1.2, z: 0.16 },
    { x: 0, y: 5, z: 0 },
    LANE,
  );
  expect(snap).toBeNull();
});

test('returns null outside the playfield walls', () => {
  const snap = computeSurfaceSnap(
    { x: 999, y: 999, z: Z },
    { x: 0, y: 5, z: 0 },
    LANE,
  );
  expect(snap).toBeNull();
});
