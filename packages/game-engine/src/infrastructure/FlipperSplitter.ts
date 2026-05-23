import * as THREE from 'three';
import { HINGE_INSET_FROM_EDGE } from '../domain/FlipperConstants';
import { findObjectByNormalizedName, normalizeGltfName } from './GltfNodeNames';

export type PlayfieldFlipperPair = {
  left: THREE.Mesh;
  right: THREE.Mesh;
  hide: THREE.Object3D;
};

function meshCenterX(mesh: THREE.Mesh): number {
  mesh.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()).x;
}

function meshSpansPlayfieldCenter(mesh: THREE.Mesh, centerLine = 0): boolean {
  mesh.updateMatrixWorld(true);
  const { min, max } = new THREE.Box3().setFromObject(mesh);
  return min.x < centerLine - 0.015 && max.x > centerLine + 0.015;
}

function extractFlipperHalves(meshes: THREE.Mesh[]): THREE.Mesh[] {
  const halves: THREE.Mesh[] = [];
  for (const mesh of meshes) {
    if (meshSpansPlayfieldCenter(mesh)) {
      const [leftHalf, rightHalf] = splitFlipperIntoTwo(mesh);
      if (leftHalf) halves.push(leftHalf);
      if (rightHalf) halves.push(rightHalf);
      mesh.visible = false;
    } else {
      halves.push(mesh);
    }
  }
  return halves;
}

export function resolvePlayfieldFlippers(root: THREE.Object3D): PlayfieldFlipperPair | null {
  const group =
    findObjectByNormalizedName(root, 'flipper.001', 'flipper', 'pf_flipper', 'pf_flipper_left') ??
    null;

  const meshes: THREE.Mesh[] = [];
  if (group) {
    for (const child of group.children) {
      if (child instanceof THREE.Mesh) meshes.push(child);
    }
  }
  if (meshes.length === 0) {
    const left = findObjectByNormalizedName(root, 'flipper.002');
    const right = findObjectByNormalizedName(root, 'flipper.003');
    if (left instanceof THREE.Mesh) meshes.push(left);
    if (right instanceof THREE.Mesh) meshes.push(right);
  }
  if (meshes.length === 0) {
    const searchRoot = group ?? root;
    searchRoot.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const n = normalizeGltfName(obj.name);
      if (n === 'flipper' || (n.startsWith('flipper.') && n !== 'flipper.001')) meshes.push(obj);
    });
  }
  if (meshes.length === 0 && group instanceof THREE.Mesh) {
    meshes.push(group);
  }
  if (meshes.length === 0) return null;

  const center = new THREE.Vector3();
  meshes.sort((a, b) => {
    a.updateMatrixWorld(true);
    b.updateMatrixWorld(true);
    const ax = new THREE.Box3().setFromObject(a).getCenter(center).x;
    const bx = new THREE.Box3().setFromObject(b).getCenter(center).x;
    return ax - bx;
  });

  if (meshes.length === 1) {
    const [lMesh, rMesh] = splitFlipperIntoTwo(meshes[0]!);
    if (!lMesh || !rMesh) return null;
    const parent = group?.parent ?? root;
    parent.add(lMesh);
    parent.add(rMesh);
    if (group) group.visible = false;
    meshes[0]!.visible = false;
    return finalizeFlipperPair(root, { left: lMesh, right: rMesh, hide: group ?? meshes[0]! });
  }

  const halves = extractFlipperHalves(meshes);
  if (halves.length === 0) return null;
  halves.sort((a, b) => meshCenterX(a) - meshCenterX(b));

  if (halves.length === 1) {
    const [lMesh, rMesh] = splitFlipperIntoTwo(halves[0]!);
    if (!lMesh || !rMesh) return null;
    halves[0]!.visible = false;
    return finalizeFlipperPair(root, { left: lMesh, right: rMesh, hide: group ?? halves[0]! });
  }

  return finalizeFlipperPair(root, {
    left: halves[0]!,
    right: halves[halves.length - 1]!,
    hide: group ?? meshes[0]!.parent ?? root,
  });
}

function hideUnusedFlipperMeshes(root: THREE.Object3D, left: THREE.Mesh, right: THREE.Mesh): void {
  const keep = new Set<THREE.Object3D>([left, right]);
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const n = normalizeGltfName(obj.name);
    if (!n.startsWith('flipper')) return;
    if (keep.has(obj)) return;
    if (n === 'flipper.001' || n === 'flipper' || meshSpansPlayfieldCenter(obj)) {
      obj.visible = false;
    }
  });
}

function finalizeFlipperPair(
  root: THREE.Object3D,
  pair: PlayfieldFlipperPair,
): PlayfieldFlipperPair {
  hideUnusedFlipperMeshes(root, pair.left, pair.right);
  return pair;
}

export function splitFlipperIntoTwo(
  flipperObj: THREE.Object3D,
): [THREE.Mesh | null, THREE.Mesh | null] {
  let src: THREE.Mesh | null = null;
  if (flipperObj instanceof THREE.Mesh) {
    src = flipperObj;
  } else {
    flipperObj.traverse((c) => {
      if (!src && c instanceof THREE.Mesh) src = c as THREE.Mesh;
    });
  }
  if (!src || !flipperObj.parent) return [null, null];

  src.updateMatrixWorld(true);
  flipperObj.parent.updateMatrixWorld(true);

  const worldMat = src.matrixWorld;
  const toParent = flipperObj.parent.matrixWorld.clone().invert();
  const geom = src.geometry as THREE.BufferGeometry;
  const posAttr = geom.attributes.position as THREE.BufferAttribute;
  const uvAttr = geom.attributes.uv as THREE.BufferAttribute | undefined;
  const vertCount = posAttr.count;

  const wX: number[] = new Array(vertCount);
  const localVerts: number[][] = new Array(vertCount);
  const tmp = new THREE.Vector3();

  for (let i = 0; i < vertCount; i++) {
    tmp.fromBufferAttribute(posAttr, i).applyMatrix4(worldMat);
    wX[i] = tmp.x;
    tmp.applyMatrix4(toParent);
    localVerts[i] = [tmp.x, tmp.y, tmp.z];
  }

  const idxArr: number[] = geom.index
    ? Array.from(geom.index.array as ArrayLike<number>)
    : Array.from({ length: vertCount }, (_, i) => i);

  const leftTris: number[] = [];
  const rightTris: number[] = [];
  for (let t = 0; t < idxArr.length; t += 3) {
    const a = idxArr[t], b = idxArr[t + 1], c = idxArr[t + 2];
    const cx = (wX[a] + wX[b] + wX[c]) / 3;
    (cx <= 0 ? leftTris : rightTris).push(a, b, c);
  }

  const buildGeom = (tris: number[]): THREE.BufferGeometry | null => {
    if (tris.length === 0) return null;
    const remap = new Map<number, number>();
    const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
    for (const old of tris) {
      if (!remap.has(old)) {
        remap.set(old, pos.length / 3);
        const [lx, ly, lz] = localVerts[old];
        pos.push(lx, ly, lz);
        if (uvAttr) uvs.push(uvAttr.getX(old), uvAttr.getY(old));
      }
      idx.push(remap.get(old)!);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (uvs.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };

  const baseMat = src.material as THREE.MeshStandardMaterial;
  const srcTransform = src;
  const makeMesh = (tris: number[], name: string): THREE.Mesh | null => {
    const g = buildGeom(tris);
    if (!g) return null;
    const m = new THREE.Mesh(g, baseMat.clone());
    m.name = name;
    m.position.copy(srcTransform.position);
    m.rotation.copy(srcTransform.rotation);
    m.scale.copy(srcTransform.scale);
    m.castShadow = m.receiveShadow = true;
    return m;
  };

  return [
    makeMesh(leftTris, 'flipper_left_split'),
    makeMesh(rightTris, 'flipper_right_split'),
  ];
}

export function attachFlipperAtHinge(
  flipper: THREE.Object3D,
  side: 'left' | 'right',
): THREE.Object3D {
  const parent = flipper.parent;
  if (!parent) return flipper;

  flipper.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(flipper);
  const { min, max } = box;
  const midY = (min.y + max.y) / 2;
  const midZ = (min.z + max.z) / 2;
  const widthX = max.x - min.x;
  const inset = widthX * HINGE_INSET_FROM_EDGE;
  const hingeX = side === 'left' ? max.x - inset : min.x + inset;

  const pivot = new THREE.Group();
  pivot.name = `${flipper.name}_pivot`;
  const hingeWorld = new THREE.Vector3(hingeX, midY, midZ);
  const hingeLocal = hingeWorld.clone();
  parent.worldToLocal(hingeLocal);
  pivot.position.copy(hingeLocal);
  parent.add(pivot);
  pivot.attach(flipper);
  return pivot;
}

export function applyFlipperSwing(
  pivot: THREE.Object3D,
  side: 'left' | 'right',
  angle: number,
  axis: 'x' | 'y',
): void {
  pivot.rotation.set(0, 0, 0);
  if (axis === 'x') {
    pivot.rotation.x = side === 'left' ? angle : -angle;
  } else {
    pivot.rotation.y = side === 'left' ? angle : -angle;
  }
  pivot.updateMatrixWorld(true);
}
