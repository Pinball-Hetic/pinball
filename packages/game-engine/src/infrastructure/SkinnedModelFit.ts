import * as THREE from 'three';

export type SkinnedAxisBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _box = new THREE.Box3();

const BOX_CORNER = [
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
];

const MAX_SANE_HEIGHT = 8;

function isSaneHeight(bounds: SkinnedAxisBounds): boolean {
  const height = bounds.maxY - bounds.minY;
  return Number.isFinite(height) && height > 1e-4 && height <= MAX_SANE_HEIGHT;
}

function withFootFloorY(
  model: THREE.Object3D,
  anchor: THREE.Object3D,
  bounds: SkinnedAxisBounds,
): SkinnedAxisBounds {
  const footY = measureFootFloorY(model, anchor);
  if (footY === null) return bounds;
  return { ...bounds, minY: Math.min(bounds.minY, footY) };
}

export function measureFootFloorY(
  model: THREE.Object3D,
  anchor: THREE.Object3D,
): number | null {
  let minY = Infinity;

  model.traverse((obj) => {
    const name = obj.name.toLowerCase();
    const isFoot =
      name.includes('foot')
      || name.includes('toe')
      || name.includes('backleg');
    if (!isFoot) return;
    if (!name.includes('end') && !name.includes('foot')) return;
    obj.getWorldPosition(_p);
    anchor.worldToLocal(_p);
    minY = Math.min(minY, _p.y);
  });

  return minY === Infinity ? null : minY;
}

function measureSkinnedVertexBounds(
  model: THREE.Object3D,
  anchor: THREE.Object3D,
): SkinnedAxisBounds | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let samples = 0;

  model.traverse((obj) => {
    if (!(obj instanceof THREE.SkinnedMesh)) return;
    const pos = obj.geometry.attributes.position;
    const hasSkin = obj.geometry.attributes.skinIndex && obj.geometry.attributes.skinWeight;
    if (!pos) return;
    obj.skeleton.update();
    // Decimate: an axis-aligned bbox needs only a few hundred samples. A full
    // per-vertex skin pass (applyBoneTransform + 2 matrix transforms each) on a
    // 10k+ vert model is a needless load-time CPU spike, ×2 boss models.
    const step = Math.max(1, Math.floor(pos.count / 800));
    for (let i = 0; i < pos.count; i += step) {
      _v.fromBufferAttribute(pos, i);
      if (hasSkin) obj.applyBoneTransform(i, _v);
      obj.localToWorld(_v);
      anchor.worldToLocal(_v);
      minX = Math.min(minX, _v.x);
      maxX = Math.max(maxX, _v.x);
      minY = Math.min(minY, _v.y);
      maxY = Math.max(maxY, _v.y);
      minZ = Math.min(minZ, _v.z);
      maxZ = Math.max(maxZ, _v.z);
      samples += 1;
    }
  });

  if (samples === 0) return null;
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

function measureObjectBoxBounds(
  model: THREE.Object3D,
  anchor: THREE.Object3D,
): SkinnedAxisBounds | null {
  model.updateMatrixWorld(true);
  _box.setFromObject(model);
  if (_box.isEmpty()) return null;

  const { min, max } = _box;
  BOX_CORNER[0].set(min.x, min.y, min.z);
  BOX_CORNER[1].set(max.x, min.y, min.z);
  BOX_CORNER[2].set(min.x, max.y, min.z);
  BOX_CORNER[3].set(max.x, max.y, min.z);
  BOX_CORNER[4].set(min.x, min.y, max.z);
  BOX_CORNER[5].set(max.x, min.y, max.z);
  BOX_CORNER[6].set(min.x, max.y, max.z);
  BOX_CORNER[7].set(max.x, max.y, max.z);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const corner of BOX_CORNER) {
    anchor.worldToLocal(corner);
    minX = Math.min(minX, corner.x);
    maxX = Math.max(maxX, corner.x);
    minY = Math.min(minY, corner.y);
    maxY = Math.max(maxY, corner.y);
    minZ = Math.min(minZ, corner.z);
    maxZ = Math.max(maxZ, corner.z);
  }

  return { minX, maxX, minY, maxY, minZ, maxZ };
}

export function measureSkinnedMeshBounds(
  model: THREE.Object3D,
  anchor: THREE.Object3D,
): SkinnedAxisBounds | null {
  const skinned = measureSkinnedVertexBounds(model, anchor);
  if (skinned && isSaneHeight(skinned)) {
    return withFootFloorY(model, anchor, skinned);
  }

  const boxed = measureObjectBoxBounds(model, anchor);
  if (boxed && isSaneHeight(boxed)) {
    return withFootFloorY(model, anchor, boxed);
  }

  return null;
}

export type ApplySkinnedModelFitOptions = {
  model: THREE.Object3D;
  rig: THREE.Group;
  offset: THREE.Group;
  anchor: THREE.Object3D;
  targetHeight: number;
  floorClearance: number;
  fixedBindHeight?: number;
  fallbackBindHeight?: number;
  beforeMeasure?: () => void;
};

function applyOffsetFromBounds(
  bounds: SkinnedAxisBounds,
  offset: THREE.Group,
  floorClearance: number,
): void {
  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
  offset.position.set(
    -centerX,
    -bounds.minY + floorClearance,
    -centerZ,
  );
}

function applyBoundsToRig(
  bounds: SkinnedAxisBounds,
  rig: THREE.Group,
  offset: THREE.Group,
  targetHeight: number,
  floorClearance: number,
): void {
  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
  const height = Math.max(bounds.maxY - bounds.minY, 1e-4);

  offset.position.set(
    -centerX,
    -bounds.minY + floorClearance,
    -centerZ,
  );
  rig.scale.setScalar(targetHeight / height);
}

export function applySkinnedModelFit(options: ApplySkinnedModelFitOptions): boolean {
  const {
    model,
    rig,
    offset,
    anchor,
    targetHeight,
    floorClearance,
    fixedBindHeight,
    fallbackBindHeight,
    beforeMeasure,
  } = options;

  beforeMeasure?.();

  const bindHeight = fixedBindHeight ?? fallbackBindHeight;
  if (fixedBindHeight && fixedBindHeight > 1e-4) {
    rig.scale.setScalar(targetHeight / fixedBindHeight);
  }

  anchor.updateMatrixWorld(true);
  model.updateMatrixWorld(true);

  const bounds = measureSkinnedMeshBounds(model, anchor);
  if (bounds) {
    if (fixedBindHeight) {
      applyOffsetFromBounds(bounds, offset, floorClearance);
    } else {
      applyBoundsToRig(bounds, rig, offset, targetHeight, floorClearance);
    }
    return true;
  }

  if (bindHeight && bindHeight > 1e-4) {
    if (!fixedBindHeight) {
      rig.scale.setScalar(targetHeight / bindHeight);
    }
    offset.position.set(0, floorClearance, 0);
    return true;
  }

  return false;
}

export async function fitSkinnedModelWithRetry(
  apply: () => boolean,
  maxFrames: number,
  shouldContinue: () => boolean,
): Promise<boolean> {
  for (let i = 0; i < maxFrames; i++) {
    if (!shouldContinue()) return false;
    if (apply()) return true;
    await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
  }
  if (!shouldContinue()) return false;
  return apply();
}

export function updateSkinnedBindPose(model: THREE.Object3D): void {
  model.updateMatrixWorld(true);
  model.traverse((obj) => {
    if (obj instanceof THREE.SkinnedMesh) obj.skeleton.update();
  });
}
