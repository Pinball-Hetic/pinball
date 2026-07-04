import { test, expect, beforeEach } from 'bun:test';
import RAPIER from '@dimforge/rapier3d-compat';
import { PlungerPhysics } from './PlungerPhysics';

// Minimal Rapier world stub: captures the passed descriptors without
// instantiating a real World (Rapier desc builders are pure, no init()).
type Captured = {
  bodyDesc: RAPIER.RigidBodyDesc;
  colliderDesc: RAPIER.ColliderDesc;
  parentBody: unknown;
};

function makeWorldStub() {
  const captured: Partial<Captured> = {};
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
});

test('place le corps cinématique à la position demandée', () => {
  const pos = { x: 0.1, y: 0.2, z: -0.3 };
  PlungerPhysics.createBody(stub.world as unknown as RAPIER.World, pos);
  expect(stub.captured.bodyDesc.translation).toEqual(pos);
});

test('crée un corps kinematic position-based (vélocité initiale nulle)', () => {
  PlungerPhysics.createBody(stub.world as unknown as RAPIER.World, { x: 0, y: 0, z: 0 });
  // a kinematicPositionBased body has no prescribed linear velocity
  expect(stub.captured.bodyDesc.linvel).toEqual({ x: 0, y: 0, z: 0 });
});

test('crée un collider cuboid aux demi-dimensions fixes du plongeur', () => {
  PlungerPhysics.createBody(stub.world as unknown as RAPIER.World, { x: 0, y: 0, z: 0 });
  expect(stub.captured.colliderDesc.shape.halfExtents).toEqual({
    x: 0.015,
    y: 0.015,
    z: 0.02,
  });
});

test('applique restitution et friction du plongeur', () => {
  PlungerPhysics.createBody(stub.world as unknown as RAPIER.World, { x: 0, y: 0, z: 0 });
  expect(stub.captured.colliderDesc.restitution).toBe(0.4);
  expect(stub.captured.colliderDesc.friction).toBe(0.1);
});

test('attache le collider au corps fraîchement créé', () => {
  PlungerPhysics.createBody(stub.world as unknown as RAPIER.World, { x: 0, y: 0, z: 0 });
  expect(stub.captured.parentBody).toBe(stub.bodyHandle);
});

test('retourne le rigid body créé par le monde', () => {
  const body = PlungerPhysics.createBody(stub.world as unknown as RAPIER.World, { x: 0, y: 0, z: 0 });
  expect(body).toBe(stub.bodyHandle as unknown as RAPIER.RigidBody);
});
