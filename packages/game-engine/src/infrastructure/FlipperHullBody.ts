import * as RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { kinematicPositionBasedDesc } from './RapierCompat';

export type FlipperHullBodyResult = {
  body: RAPIER.RigidBody | null;
  localOffset: THREE.Vector3;
  hullVertices: Float32Array;
  localPts: THREE.Vector3[];
};

export function buildFlipperHullBody(
  world: RAPIER.World,
  flipper: THREE.Mesh,
  opts: { restitution: number; friction: number },
): FlipperHullBodyResult {
  flipper.updateMatrixWorld(true);
  const meshOrigin = new THREE.Vector3();
  const worldQuat = new THREE.Quaternion();
  flipper.getWorldPosition(meshOrigin);
  flipper.getWorldQuaternion(worldQuat);
  const invWorldQuat = worldQuat.clone().invert();
  const posAttr = flipper.geometry.attributes.position as THREE.BufferAttribute;
  const n = posAttr.count;
  const v = new THREE.Vector3();

  let wSumX = 0,
    wSumY = 0,
    wSumZ = 0;
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(posAttr, i).applyMatrix4(flipper.matrixWorld);
    wSumX += v.x;
    wSumY += v.y;
    wSumZ += v.z;
  }
  const geoCenter = new THREE.Vector3(wSumX / n, wSumY / n, wSumZ / n);
  const localOffset = geoCenter.clone().sub(meshOrigin).applyQuaternion(invWorldQuat);

  const localPts: THREE.Vector3[] = [];
  const raw: number[] = [];
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(posAttr, i).applyMatrix4(flipper.matrixWorld);
    v.sub(geoCenter).applyQuaternion(invWorldQuat);
    localPts.push(v.clone());
    raw.push(v.x, v.y, v.z);
  }

  const hullVertices = new Float32Array(raw);

  const body = world.createRigidBody(
    kinematicPositionBasedDesc()
      .setTranslation(geoCenter.x, geoCenter.y, geoCenter.z)
      .setRotation({ x: worldQuat.x, y: worldQuat.y, z: worldQuat.z, w: worldQuat.w }),
  );

  const hullDesc = RAPIER.ColliderDesc.convexHull(hullVertices);
  if (hullDesc) {
    world.createCollider(
      hullDesc
        .setRestitution(opts.restitution)
        .setFriction(opts.friction)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
  }

  return { body, localOffset, hullVertices, localPts };
}

export function flipperWorldTransform(
  flipper: THREE.Object3D,
  localOffset: THREE.Vector3,
): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  flipper.updateMatrixWorld(true);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  flipper.getWorldPosition(position);
  flipper.getWorldQuaternion(quaternion);
  const worldOffset = localOffset.clone().applyQuaternion(quaternion);
  position.add(worldOffset);
  return { position, quaternion };
}

export function syncFlipperBody(
  body: RAPIER.RigidBody | null,
  flipper: THREE.Object3D | null,
  localOffset: THREE.Vector3,
): void {
  if (!body || !flipper) return;
  const { position, quaternion } = flipperWorldTransform(flipper, localOffset);
  body.setNextKinematicTranslation({ x: position.x, y: position.y, z: position.z });
  body.setNextKinematicRotation({
    x: quaternion.x,
    y: quaternion.y,
    z: quaternion.z,
    w: quaternion.w,
  });
}
