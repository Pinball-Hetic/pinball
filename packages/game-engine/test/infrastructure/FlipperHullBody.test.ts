import { test, expect, beforeAll, beforeEach } from 'bun:test';
import * as RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import {
  buildFlipperHullBody,
  flipperWorldTransform,
  syncFlipperBody,
} from '../../src/infrastructure/FlipperHullBody';

beforeAll(async () => {
  // convexHull runs in WASM → init once for the whole file.
  await RAPIER.init();
});

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

// A unit tetrahedron as a minimal flipper geometry (4 non-coplanar vertices
// → valid convex hull).
function tetraMesh(): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    0, 0, 1,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Mesh(geo);
}

let stub: ReturnType<typeof makeWorldStub>;
beforeEach(() => {
  stub = makeWorldStub();
});

test('geoCenter = moyenne des sommets monde ; localOffset centré à origine identité', () => {
  const mesh = tetraMesh(); // origine (0,0,0), aucune transform
  const { localOffset } = buildFlipperHullBody(stub.world as unknown as RAPIER.World, mesh, {
    restitution: 0.3,
    friction: 0.2,
  });
  // geoCenter = (0.25, 0.25, 0.25); meshOrigin = (0,0,0); identity quat
  expect(localOffset.x).toBeCloseTo(0.25, 6);
  expect(localOffset.y).toBeCloseTo(0.25, 6);
  expect(localOffset.z).toBeCloseTo(0.25, 6);
});

test('place le corps à geoCenter (translation du body = centre géométrique monde)', () => {
  const mesh = tetraMesh();
  buildFlipperHullBody(stub.world as unknown as RAPIER.World, mesh, {
    restitution: 0.3,
    friction: 0.2,
  });
  const t = stub.captured.bodyDesc!.translation;
  expect(t.x).toBeCloseTo(0.25, 6);
  expect(t.y).toBeCloseTo(0.25, 6);
  expect(t.z).toBeCloseTo(0.25, 6);
});

test('corps kinematic position-based (vélocité linéaire nulle)', () => {
  const mesh = tetraMesh();
  buildFlipperHullBody(stub.world as unknown as RAPIER.World, mesh, {
    restitution: 0.3,
    friction: 0.2,
  });
  expect(stub.captured.bodyDesc!.linvel).toEqual({ x: 0, y: 0, z: 0 });
});

test('hullVertices sont en espace body-local (centrés sur geoCenter)', () => {
  const mesh = tetraMesh();
  const { hullVertices } = buildFlipperHullBody(stub.world as unknown as RAPIER.World, mesh, {
    restitution: 0.3,
    friction: 0.2,
  });
  // sommet 0 (0,0,0) - geoCenter (0.25,0.25,0.25) = (-0.25,-0.25,-0.25)
  expect(hullVertices.length).toBe(12);
  expect(hullVertices[0]).toBeCloseTo(-0.25, 6);
  expect(hullVertices[1]).toBeCloseTo(-0.25, 6);
  expect(hullVertices[2]).toBeCloseTo(-0.25, 6);
  // sommet 1 (1,0,0) - geoCenter = (0.75,-0.25,-0.25)
  expect(hullVertices[3]).toBeCloseTo(0.75, 6);
  expect(hullVertices[4]).toBeCloseTo(-0.25, 6);
  expect(hullVertices[5]).toBeCloseTo(-0.25, 6);
});

test('localPts miroir de hullVertices (même centrage local)', () => {
  const mesh = tetraMesh();
  const { localPts, hullVertices } = buildFlipperHullBody(
    stub.world as unknown as RAPIER.World,
    mesh,
    { restitution: 0.3, friction: 0.2 },
  );
  expect(localPts).toHaveLength(4);
  expect(localPts[0].x).toBeCloseTo(hullVertices[0], 6);
  expect(localPts[0].y).toBeCloseTo(hullVertices[1], 6);
  expect(localPts[0].z).toBeCloseTo(hullVertices[2], 6);
  expect(localPts[1].x).toBeCloseTo(hullVertices[3], 6);
});

test('applique restitution / friction passées et COLLISION_EVENTS', () => {
  const mesh = tetraMesh();
  buildFlipperHullBody(stub.world as unknown as RAPIER.World, mesh, {
    restitution: 0.42,
    friction: 0.13,
  });
  expect(stub.captured.colliderDesc!.restitution).toBe(0.42);
  expect(stub.captured.colliderDesc!.friction).toBe(0.13);
  expect(stub.captured.colliderDesc!.activeEvents).toBe(RAPIER.ActiveEvents.COLLISION_EVENTS);
});

test('attache le collider au corps fraîchement créé et retourne ce corps', () => {
  const mesh = tetraMesh();
  const { body } = buildFlipperHullBody(stub.world as unknown as RAPIER.World, mesh, {
    restitution: 0.3,
    friction: 0.2,
  });
  expect(stub.captured.parentBody).toBe(stub.bodyHandle);
  expect(body).toBe(stub.bodyHandle as unknown as RAPIER.RigidBody);
});

test('la transform monde du mesh est prise en compte (mesh translaté)', () => {
  const mesh = tetraMesh();
  mesh.position.set(10, 0, 0);
  const { localOffset } = buildFlipperHullBody(stub.world as unknown as RAPIER.World, mesh, {
    restitution: 0.3,
    friction: 0.2,
  });
  // world geoCenter = (10.25, 0.25, 0.25); meshOrigin = (10,0,0)
  // localOffset = geoCenter - meshOrigin (identity quat) = (0.25,0.25,0.25)
  expect(localOffset.x).toBeCloseTo(0.25, 6);
  expect(localOffset.y).toBeCloseTo(0.25, 6);
  expect(localOffset.z).toBeCloseTo(0.25, 6);
  const t = stub.captured.bodyDesc!.translation;
  expect(t.x).toBeCloseTo(10.25, 6);
});

// ── flipperWorldTransform ─────────────────────────────────────────────────

test('flipperWorldTransform : offset nul → position = position monde du flipper', () => {
  const obj = new THREE.Object3D();
  obj.position.set(3, 4, 5);
  const { position, quaternion } = flipperWorldTransform(obj, new THREE.Vector3());
  expect(position.x).toBeCloseTo(3, 6);
  expect(position.y).toBeCloseTo(4, 6);
  expect(position.z).toBeCloseTo(5, 6);
  // identity rotation
  expect(quaternion.x).toBeCloseTo(0, 6);
  expect(quaternion.w).toBeCloseTo(1, 6);
});

test('flipperWorldTransform : offset additionné à la position (quat identité)', () => {
  const obj = new THREE.Object3D();
  obj.position.set(1, 0, 0);
  const { position } = flipperWorldTransform(obj, new THREE.Vector3(0.5, 0, 0));
  expect(position.x).toBeCloseTo(1.5, 6);
  expect(position.y).toBeCloseTo(0, 6);
  expect(position.z).toBeCloseTo(0, 6);
});

test('flipperWorldTransform : offset local pivoté dans le monde (rot 90° autour Y)', () => {
  const obj = new THREE.Object3D();
  // +90° rotation about Y: a local +X offset points to -Z in world space
  obj.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const { position } = flipperWorldTransform(obj, new THREE.Vector3(1, 0, 0));
  expect(position.x).toBeCloseTo(0, 6);
  expect(position.y).toBeCloseTo(0, 6);
  expect(position.z).toBeCloseTo(-1, 6);
});

test('flipperWorldTransform : hérite de la transform du parent', () => {
  const parent = new THREE.Object3D();
  parent.position.set(10, 0, 0);
  const child = new THREE.Object3D();
  child.position.set(0, 2, 0);
  parent.add(child);
  const { position } = flipperWorldTransform(child, new THREE.Vector3());
  expect(position.x).toBeCloseTo(10, 6);
  expect(position.y).toBeCloseTo(2, 6);
});

// ── syncFlipperBody ───────────────────────────────────────────────────────

type BodyStub = {
  nextT?: { x: number; y: number; z: number };
  nextR?: { x: number; y: number; z: number; w: number };
};
function makeBodyStub() {
  const state: BodyStub = {};
  const body = {
    setNextKinematicTranslation(t: { x: number; y: number; z: number }) {
      state.nextT = t;
    },
    setNextKinematicRotation(r: { x: number; y: number; z: number; w: number }) {
      state.nextR = r;
    },
  };
  return { body, state };
}

test('syncFlipperBody : no-op si body nul', () => {
  const obj = new THREE.Object3D();
  obj.position.set(1, 2, 3);
  expect(() => syncFlipperBody(null, obj, new THREE.Vector3())).not.toThrow();
});

test('syncFlipperBody : no-op si flipper nul', () => {
  const { body, state } = makeBodyStub();
  syncFlipperBody(body as unknown as RAPIER.RigidBody, null, new THREE.Vector3());
  expect(state.nextT).toBeUndefined();
  expect(state.nextR).toBeUndefined();
});

test('syncFlipperBody : pousse translation (pos + offset monde) et rotation', () => {
  const { body, state } = makeBodyStub();
  const obj = new THREE.Object3D();
  obj.position.set(2, 0, 0);
  syncFlipperBody(
    body as unknown as RAPIER.RigidBody,
    obj,
    new THREE.Vector3(0.25, 0, 0),
  );
  expect(state.nextT!.x).toBeCloseTo(2.25, 6);
  expect(state.nextT!.y).toBeCloseTo(0, 6);
  expect(state.nextT!.z).toBeCloseTo(0, 6);
  expect(state.nextR!.w).toBeCloseTo(1, 6);
});

test('syncFlipperBody : la rotation poussée = quaternion monde du flipper', () => {
  const { body, state } = makeBodyStub();
  const obj = new THREE.Object3D();
  obj.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  const expected = obj.quaternion.clone();
  syncFlipperBody(body as unknown as RAPIER.RigidBody, obj, new THREE.Vector3());
  expect(state.nextR!.x).toBeCloseTo(expected.x, 6);
  expect(state.nextR!.y).toBeCloseTo(expected.y, 6);
  expect(state.nextR!.z).toBeCloseTo(expected.z, 6);
  expect(state.nextR!.w).toBeCloseTo(expected.w, 6);
});
