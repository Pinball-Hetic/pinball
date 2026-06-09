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
  // Three.js GLTFLoader sanitize les dots dans les node names. Tente les 2 formes.
  const meshA = flipperMeshFrom(findObjectByNormalizedName(root, 'flipper.002', 'flipper002'));
  const meshB = flipperMeshFrom(findObjectByNormalizedName(root, 'flipper.003', 'flipper003'));
  if (!meshA || !meshB) return null;

  const left = meshCenterX(meshA) <= meshCenterX(meshB) ? meshA : meshB;
  const right = left === meshA ? meshB : meshA;

  return finalizeFlipperPair(root, { left, right, hide: root });
}

const PLAYFIELD_CENTER_X = 0;
const SPAN_TOLERANCE = 0.015;

function meshSpansPlayfieldCenter(mesh: THREE.Mesh): boolean {
  mesh.updateMatrixWorld(true);
  const { min, max } = new THREE.Box3().setFromObject(mesh);
  return min.x < PLAYFIELD_CENTER_X - SPAN_TOLERANCE && max.x > PLAYFIELD_CENTER_X + SPAN_TOLERANCE;
}

export function resolvePlayfieldFlippers(root: THREE.Object3D): PlayfieldFlipperPair | null {
  const stPair = resolveStrangerThingsFlippers(root);
  if (stPair) return stPair;

  // Three.js GLTFLoader sanitize les dots → flipper.001 devient flipper001 dans la scène.
  const group = findObjectByNormalizedName(root, 'flipper.001', 'flipper001', 'flipper') ?? null;
  const meshes: THREE.Mesh[] = [];
  if (group) {
    for (const child of group.children) {
      const mesh = flipperMeshFrom(child);
      if (mesh) meshes.push(mesh);
    }
  }
  if (meshes.length === 0) return null;

  // Cas Strangerthings.glb : 2+ meshes qui couvrent CHACUN toute la largeur
  // du playfield (base + plastique du même couple de flippers). On découpe
  // géométriquement le plus dense au X=0 pour obtenir 2 demi-meshes
  // gauche/droit, et on masque les autres.
  const spanning = meshes.filter(meshSpansPlayfieldCenter);
  if (spanning.length >= 1 && (meshes.length === 1 || spanning.length === meshes.length)) {
    // Tri par vertex count décroissant : primary = mesh le plus dense
    // (généralement la couche structurelle principale). Les autres sont
    // splitées aussi et attachées comme enfants des demi-meshes primaires
    // pour préserver le multi-layer (ex : red rubber + white plastic).
    const ordered = [...spanning].sort(
      (a, b) =>
        (b.geometry.attributes.position?.count ?? 0) -
        (a.geometry.attributes.position?.count ?? 0),
    );
    const primary = ordered[0]!;
    const [leftHalf, rightHalf] = splitFlipperIntoTwo(primary);
    if (!leftHalf || !rightHalf) return null;
    const parent = primary.parent ?? root;
    parent.add(leftHalf);
    parent.add(rightHalf);

    for (let i = 1; i < ordered.length; i++) {
      const [secLeft, secRight] = splitFlipperIntoTwo(ordered[i]!);
      if (secLeft) leftHalf.add(secLeft);
      if (secRight) rightHalf.add(secRight);
    }

    for (const mesh of meshes) mesh.visible = false;
    return finalizeFlipperPair(root, { left: leftHalf, right: rightHalf, hide: root });
  }

  if (meshes.length < 2) return null;
  meshes.sort((a, b) => meshCenterX(a) - meshCenterX(b));
  return finalizeFlipperPair(root, {
    left: meshes[0]!,
    right: meshes[meshes.length - 1]!,
    hide: root,
  });
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
    const a = idxArr[t]!, b = idxArr[t + 1]!, c = idxArr[t + 2]!;
    const cx = (wX[a]! + wX[b]! + wX[c]!) / 3;
    (cx <= PLAYFIELD_CENTER_X ? leftTris : rightTris).push(a, b, c);
  }

  const buildGeom = (tris: number[]): THREE.BufferGeometry | null => {
    if (tris.length === 0) return null;
    const remap = new Map<number, number>();
    const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
    for (const old of tris) {
      if (!remap.has(old)) {
        remap.set(old, pos.length / 3);
        const v = localVerts[old]!;
        pos.push(v[0]!, v[1]!, v[2]!);
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
  const makeMesh = (tris: number[], name: string): THREE.Mesh | null => {
    const g = buildGeom(tris);
    if (!g) return null;
    const m = new THREE.Mesh(g, baseMat.clone());
    m.name = name;
    m.castShadow = m.receiveShadow = true;
    return m;
  };

  return [
    makeMesh(leftTris, 'flipper_left_split'),
    makeMesh(rightTris, 'flipper_right_split'),
  ];
}

function hideUnusedFlipperMeshes(root: THREE.Object3D, left: THREE.Mesh, right: THREE.Mesh): void {
  const keep = new Set<THREE.Object3D>([left, right]);
  const isDescendantOfKept = (obj: THREE.Object3D): boolean => {
    let current: THREE.Object3D | null = obj.parent;
    while (current) {
      if (keep.has(current)) return true;
      current = current.parent;
    }
    return false;
  };
  root.traverse((obj) => {
    if (!isRenderableMesh(obj)) return;
    const n = normalizeGltfName(obj.name);
    if (!n.startsWith('flipper')) return;
    if (keep.has(obj) || isDescendantOfKept(obj)) return;
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
  // Convention pinball : hinge au far-X (côté bord playfield), tip au center.
  // LEFT → hinge à min.x (far left). RIGHT → hinge à max.x (far right).
  const hingeX = side === 'left' ? min.x + inset : max.x - inset;
  const hingeWorld = new THREE.Vector3(
    hingeX,
    (min.y + max.y) / 2 + 0.012,
    (min.z + max.z) / 2,
  );
  const hingeLocal = hingeWorld.clone();
  parent.worldToLocal(hingeLocal);
  return hingeLocal;
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

  // Pinball : swing horizontal autour d'un axe perpendiculaire au playfield.
  // Y est suffisamment proche du normal du tapis (tilt ~6.5°) pour le rendu
  // visuel. L'ancien `detectPivotAxis` mesurait le lift Y et picked X pour un
  // flipper plat — ce qui donnait un tilt vertical au lieu d'un swing.
  pivot.rotation.set(0, 0, 0);
  return { pivot, mesh: flipper, side, axis: 'y' };
}

export function applyFlipperSwing(flipper: FlipperPivot, angle: number): void {
  flipper.pivot.rotation.set(0, 0, 0);
  const signed = flipper.side === 'left' ? angle : -angle;
  if (flipper.axis === 'x') flipper.pivot.rotation.x = signed;
  else flipper.pivot.rotation.y = signed;
  flipper.pivot.updateMatrixWorld(true);
}
