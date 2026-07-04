import * as THREE from 'three';
import { getBallRadius, WALL_BOTTOM_Z } from '../domain/Ball';
import { canonicalGltfName, normalizeGltfName } from './GltfNodeNames';

const LAUNCHER_LANE_MESH_NAMES = new Set([
  'launcher',
  'plunger_panel',
  'separator_left',
  'separator_right',
]);

/** Shooter-lane Z bounds from the GLB (fallback = legacy constants). */
export function computeLauncherLaneZBounds(playfieldRoot: THREE.Object3D): {
  minZ: number;
  maxZ: number;
} {
  const box = new THREE.Box3();
  let found = false;
  playfieldRoot.updateMatrixWorld(true);
  playfieldRoot.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const c = canonicalGltfName(child.name);
    const n = normalizeGltfName(child.name);
    if (!LAUNCHER_LANE_MESH_NAMES.has(c) && !LAUNCHER_LANE_MESH_NAMES.has(n)) return;
    box.union(new THREE.Box3().setFromObject(child));
    found = true;
  });
  if (!found || box.isEmpty()) {
    return { minZ: 0.03, maxZ: 0.42 };
  }
  const r = getBallRadius();
  return {
    minZ: Math.max(-0.05, box.min.z - r),
    maxZ: Math.min(WALL_BOTTOM_Z, box.max.z + r * 0.5),
  };
}
