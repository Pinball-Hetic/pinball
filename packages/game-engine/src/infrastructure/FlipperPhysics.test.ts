import { test, expect, beforeEach, afterEach } from 'bun:test';
import RAPIER from '@dimforge/rapier3d-compat';
import { FlipperPhysics } from './FlipperPhysics';
import { FLIPPER_RESTITUTION } from '../domain/FlipperConstants';
import {
  configureBallRadius,
  resetBallRadius,
  getBallRadius,
} from '../domain/Ball';

// Stub minimal du monde Rapier : capture les descripteurs sans World réel.
type Captured = {
  bodyDesc?: RAPIER.RigidBodyDesc;
  colliderDesc?: RAPIER.ColliderDesc;
  parentBody?: unknown;
};

function makeWorldStub() {
  const captured: Captured = {};
  const bodyHandle = { __body: true };
  const world = {
    createRigidBody(desc: RAPIER.RigidBodyDesc) {
      captured.bodyDesc = desc;
      return bodyHandle;
    },
    createCollider(desc: RAPIER.ColliderDesc, parent: unknown) {
      captured.colliderDesc = desc;
      captured.parentBody = parent;
      return { __collider: true };
    },
  };
  return { world, captured, bodyHandle };
}

let stub: ReturnType<typeof makeWorldStub>;
beforeEach(() => {
  stub = makeWorldStub();
  resetBallRadius();
});
afterEach(() => {
  resetBallRadius();
});

test('place le corps au centre fourni', () => {
  const center = { x: 0.05, y: 1.0, z: -0.2 };
  FlipperPhysics.createBody(stub.world as unknown as RAPIER.World, center, { x: 0.1, y: 0.02, z: 0.04 });
  expect(stub.captured.bodyDesc.translation).toEqual(center);
});

test('demi-extents X et Z = moitié de la taille, Z élargi du rayon de bille', () => {
  const size = { x: 0.12, y: 0.08, z: 0.05 };
  FlipperPhysics.createBody(stub.world as unknown as RAPIER.World, { x: 0, y: 0, z: 0 }, size);
  const r = getBallRadius();
  const he = stub.captured.colliderDesc.shape.halfExtents;
  expect(he.x).toBeCloseTo(size.x / 2, 10);
  expect(he.z).toBeCloseTo(size.z / 2 + r, 10);
});

test('halfY suit size.y/2 quand le flipper est suffisamment épais', () => {
  // size.y/2 nettement > r*3 → la borne basse n'est pas active.
  const size = { x: 0.1, y: 0.5, z: 0.04 };
  FlipperPhysics.createBody(stub.world as unknown as RAPIER.World, { x: 0, y: 0, z: 0 }, size);
  expect(stub.captured.colliderDesc.shape.halfExtents.y).toBeCloseTo(0.25, 10);
});

test('halfY est borné au minimum r*3 quand le flipper est trop fin (clamp)', () => {
  const r = getBallRadius();
  // size.y/2 = 0.0001 << r*3 → clamp doit l'emporter.
  const size = { x: 0.1, y: 0.0002, z: 0.04 };
  FlipperPhysics.createBody(stub.world as unknown as RAPIER.World, { x: 0, y: 0, z: 0 }, size);
  expect(stub.captured.colliderDesc.shape.halfExtents.y).toBeCloseTo(r * 3, 10);
});

test('le rayon de bille configuré influe sur halfY et halfZ', () => {
  configureBallRadius(0.05);
  const size = { x: 0.1, y: 0.001, z: 0.04 };
  FlipperPhysics.createBody(stub.world as unknown as RAPIER.World, { x: 0, y: 0, z: 0 }, size);
  const he = stub.captured.colliderDesc.shape.halfExtents;
  expect(he.y).toBeCloseTo(0.05 * 3, 10); // clamp r*3
  expect(he.z).toBeCloseTo(size.z / 2 + 0.05, 10);
});

test('applique restitution flipper, friction 0.28 et active les events de collision', () => {
  FlipperPhysics.createBody(stub.world as unknown as RAPIER.World, { x: 0, y: 0, z: 0 }, { x: 0.1, y: 0.04, z: 0.04 });
  expect(stub.captured.colliderDesc.restitution).toBe(FLIPPER_RESTITUTION);
  expect(stub.captured.colliderDesc.friction).toBe(0.28);
  expect(stub.captured.colliderDesc.activeEvents).toBe(RAPIER.ActiveEvents.COLLISION_EVENTS);
});

test('attache le collider au corps et le retourne', () => {
  const body = FlipperPhysics.createBody(
    stub.world as unknown as RAPIER.World,
    { x: 0, y: 0, z: 0 },
    { x: 0.1, y: 0.04, z: 0.04 },
  );
  expect(stub.captured.parentBody).toBe(stub.bodyHandle);
  expect(body).toBe(stub.bodyHandle as unknown as RAPIER.RigidBody);
});
