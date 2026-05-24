import * as THREE from 'three';
import { HINGE_INSET_FROM_EDGE } from '../domain/FlipperConstants';
import { findObjectByNormalizedName, normalizeGltfName } from './GltfNodeNames';

export type PlayfieldFlipperPair = {
  left: THREE.Mesh;
  right: THREE.Mesh;
  hide: THREE.Object3D;
};

export type FlipperPivot = {
  pivot: THREE.Object3D;
  mesh: THREE.Object3D;
  side: 'left' | 'right';
  axis: 'x' | 'y';
};

function isRenderableMesh(obj: THREE.Object3D): obj is THREE.Mesh {
  return (obj as THREE.Mesh).isMesh === true;
}

function flipperMeshFrom(node: THREE.Object3D | null): THREE.Mesh | null {
  if (!node) return null;
  if (isRenderableMesh(node)) return node;
  let found: THREE.Mesh | null = null;
  node.traverse((child) => {
    if (!found && isRenderableMesh(child)) found = child;
  });
  return found;
}

function meshCenterX(mesh: THREE.Mesh): number {
  mesh.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()).x;
}

function resolveStrangerThingsFlippers(root: THREE.Object3D): PlayfieldFlipperPair | null {
  const meshA = flipperMeshFrom(findObjectByNormalizedName(root, 'flipper.002'));
  const meshB = flipperMeshFrom(findObjectByNormalizedName(root, 'flipper.003'));
  if (!meshA || !meshB) return null;

  const left = meshCenterX(meshA) <= meshCenterX(meshB) ? meshA : meshB;
  const right = left === meshA ? meshB : meshA;

  return finalizeFlipperPair(root, { left, right, hide: root });
}

export function resolvePlayfieldFlippers(root: THREE.Object3D): PlayfieldFlipperPair | null {
  const stPair = resolveStrangerThingsFlippers(root);
  if (stPair) return stPair;

  const group = findObjectByNormalizedName(root, 'flipper.001', 'flipper') ?? null;
  const meshes: THREE.Mesh[] = [];
  if (group) {
    for (const child of group.children) {
      const mesh = flipperMeshFrom(child);
      if (mesh) meshes.push(mesh);
    }
  }
  if (meshes.length < 2) return null;
  meshes.sort((a, b) => meshCenterX(a) - meshCenterX(b));
  return finalizeFlipperPair(root, {
    left: meshes[0]!,
    right: meshes[meshes.length - 1]!,
    hide: root,
  });
}

function hideUnusedFlipperMeshes(root: THREE.Object3D, left: THREE.Mesh, right: THREE.Mesh): void {
  const keep = new Set<THREE.Object3D>([left, right]);
  root.traverse((obj) => {
    if (!isRenderableMesh(obj)) return;
    const n = normalizeGltfName(obj.name);
    if (!n.startsWith('flipper')) return;
    if (keep.has(obj)) return;
    obj.visible = false;
  });
}

function finalizeFlipperPair(
  root: THREE.Object3D,
  pair: PlayfieldFlipperPair,
): PlayfieldFlipperPair {
  pair.left.visible = true;
  pair.right.visible = true;
  hideUnusedFlipperMeshes(root, pair.left, pair.right);
  return pair;
}

export function prepareFlipperMesh(mesh: THREE.Mesh): void {
  mesh.renderOrder = 999;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    if (!(material instanceof THREE.MeshStandardMaterial)) continue;
    material.emissive = new THREE.Color(0xff6600);
    material.emissiveIntensity = 0.85;
    material.depthTest = false;
    material.transparent = true;
    material.opacity = 0.98;
  }
}

function hingeLocalPosition(
  flipper: THREE.Object3D,
  side: 'left' | 'right',
  parent: THREE.Object3D,
): THREE.Vector3 {
  flipper.updateMatrixWorld(true);
  parent.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(flipper);
  const { min, max } = box;
  const inset = (max.x - min.x) * HINGE_INSET_FROM_EDGE;
  const hingeX = side === 'left' ? max.x - inset : min.x + inset;
  const hingeWorld = new THREE.Vector3(
    hingeX,
    (min.y + max.y) / 2 + 0.012,
    (min.z + max.z) / 2,
  );
  const hingeLocal = hingeWorld.clone();
  parent.worldToLocal(hingeLocal);
  return hingeLocal;
}

function tipLiftForAxis(pivot: THREE.Object3D, mesh: THREE.Object3D, axis: 'x' | 'y'): number {
  pivot.rotation.set(0, 0, 0);
  pivot.rotation[axis] = 0.65;
  pivot.updateMatrixWorld(true);
  mesh.updateMatrixWorld(true);
  const top = new THREE.Box3().setFromObject(mesh).max.y;
  pivot.rotation.set(0, 0, 0);
  return top;
}

function detectPivotAxis(pivot: THREE.Object3D, mesh: THREE.Object3D): 'x' | 'y' {
  mesh.updateMatrixWorld(true);
  const restTop = new THREE.Box3().setFromObject(mesh).max.y;
  const liftX = tipLiftForAxis(pivot, mesh, 'x') - restTop;
  const liftY = tipLiftForAxis(pivot, mesh, 'y') - restTop;
  return liftX > liftY ? 'x' : 'y';
}

export function attachFlipperAtHinge(
  flipper: THREE.Object3D,
  side: 'left' | 'right',
  mountParent?: THREE.Object3D,
): FlipperPivot {
  const parent = mountParent ?? flipper.parent;
  if (!parent) {
    return { pivot: flipper, mesh: flipper, side, axis: 'y' };
  }

  const pivot = new THREE.Group();
  pivot.name = `${flipper.name}_pivot`;
  pivot.position.copy(hingeLocalPosition(flipper, side, parent));
  parent.add(pivot);
  pivot.attach(flipper);

  const axis = detectPivotAxis(pivot, flipper);
  pivot.rotation.set(0, 0, 0);
  return { pivot, mesh: flipper, side, axis };
}

export function applyFlipperSwing(flipper: FlipperPivot, angle: number): void {
  flipper.pivot.rotation.set(0, 0, 0);
  const signed = flipper.side === 'left' ? angle : -angle;
  if (flipper.axis === 'x') flipper.pivot.rotation.x = signed;
  else flipper.pivot.rotation.y = signed;
  flipper.pivot.updateMatrixWorld(true);
}

export function splitFlipperIntoTwo(
  _flipperObj: THREE.Object3D,
  _attachParent?: THREE.Object3D,
): [THREE.Mesh | null, THREE.Mesh | null] {
  return [null, null];
}
