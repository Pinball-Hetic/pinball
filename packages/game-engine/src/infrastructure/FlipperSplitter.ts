import * as THREE from 'three';
import { HINGE_INSET_FROM_EDGE } from '../domain/FlipperConstants';

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
  const hingeX = side === 'left' ? min.x + inset : max.x - inset;

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
