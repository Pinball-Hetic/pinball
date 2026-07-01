import { test, expect, beforeAll } from 'bun:test';
import RAPIER from '@dimforge/rapier3d-compat';
import { kinematicPositionBasedDesc } from './RapierCompat';

beforeAll(async () => {
  await RAPIER.init();
});

test('returns a kinematic-position-based RigidBodyDesc on the installed Rapier', () => {
  const desc = kinematicPositionBasedDesc();
  expect(desc).toBeInstanceOf(RAPIER.RigidBodyDesc);
  // 0 = KinematicPositionBased in Rapier's RigidBodyType enum.
  expect(desc.status).toBe(RAPIER.RigidBodyType.KinematicPositionBased);
});
