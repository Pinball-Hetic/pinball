import * as THREE from 'three';

export function normalizeGltfName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
}

export function stripGltfPrefixes(normalized: string): string {
  if (normalized.startsWith('vis_')) return normalized.slice(4);
  if (normalized.startsWith('coll_')) return normalized.slice(5);
  if (normalized.startsWith('pf_')) return normalized.slice(3);
  return normalized;
}

export function isVisualOnlyGltfName(name: string): boolean {
  const n = normalizeGltfName(name);
  return n.startsWith('vis_') || n === 'glass' || n.includes('glass');
}

/** Ancestry variant: true if self OR any ancestor is visual-only. */
export function isVisualOnlyGltfAncestry(ancestryNames: string[]): boolean {
  return ancestryNames.some(isVisualOnlyGltfName);
}

export function canonicalGltfName(name: string): string {
  return stripGltfPrefixes(normalizeGltfName(name));
}

export function findObjectByNormalizedName(
  root: THREE.Object3D,
  ...candidates: string[]
): THREE.Object3D | null {
  const wanted = new Set<string>();
  for (const c of candidates) {
    wanted.add(normalizeGltfName(c));
    wanted.add(canonicalGltfName(c));
  }

  let found: THREE.Object3D | null = null;
  root.traverse((obj) => {
    if (found) return;
    const n = normalizeGltfName(obj.name);
    const c = canonicalGltfName(obj.name);
    if (wanted.has(n) || wanted.has(c)) found = obj;
  });
  return found;
}

export function hasNamedAncestor(obj: THREE.Object3D, ...names: string[]): boolean {
  const wanted = new Set(names.map(normalizeGltfName));
  let current: THREE.Object3D | null = obj;
  while (current) {
    if (wanted.has(normalizeGltfName(current.name))) return true;
    current = current.parent;
  }
  return false;
}

/**
 * Variant of isPinballmapGameplayMesh operating on the ancestry name list
 * (self → parents) instead of a THREE.Mesh.
 */
export function isPinballmapGameplayMeshName(ancestryNames: string[]): boolean {
  return ancestryNames.some((name) => normalizeGltfName(name) === 'pinballmap');
}

export function isPinballmapGameplayMesh(mesh: THREE.Mesh): boolean {
  return hasNamedAncestor(mesh, 'Pinballmap');
}

/**
 * Variant of isFlipperGltfMesh operating on the ancestry name list
 * (self → parents). Stops at the 'pinballmap' boundary.
 */
export function isFlipperGltfMeshName(ancestryNames: string[]): boolean {
  for (const name of ancestryNames) {
    const n = normalizeGltfName(name);
    if (n === 'pinballmap') return false;
    // Old convention: single "flipper" or "flipper.001" node
    // New convention: separate "flipper-left" / "flipper-right" sub-models
    if (
      n === 'flipper' ||
      n.startsWith('flipper.') ||
      n === 'flipper-left' ||
      n === 'flipper-right' ||
      n === 'flipper_left' ||
      n === 'flipper_right'
    ) return true;
  }
  return false;
}

export function isFlipperGltfMesh(mesh: THREE.Mesh): boolean {
  const names: string[] = [];
  let current: THREE.Object3D | null = mesh;
  while (current) {
    names.push(current.name);
    current = current.parent;
  }
  return isFlipperGltfMeshName(names);
}

function isRailNodeName(normalized: string): boolean {
  return /^circle\.\d+$/.test(normalized) || /^plane\.\d+$/.test(normalized);
}

/**
 * Variant of isPinballmapRailMesh operating on the ancestry name list
 * (self → parents). Self is a rail if it matches circle.NNN / plane.NNN;
 * otherwise walk up the parents until the 'pinballmap' boundary.
 */
export function isPinballmapRailMeshName(ancestryNames: string[]): boolean {
  const self = normalizeGltfName(ancestryNames[0] ?? '');
  if (isRailNodeName(self)) return true;
  for (let i = 1; i < ancestryNames.length; i++) {
    const n = normalizeGltfName(ancestryNames[i]);
    if (n === 'pinballmap') return false;
    if (isRailNodeName(n)) return true;
  }
  return false;
}

export function isPinballmapRailMesh(mesh: THREE.Mesh): boolean {
  const names: string[] = [];
  let current: THREE.Object3D | null = mesh;
  while (current) {
    names.push(current.name);
    current = current.parent;
  }
  return isPinballmapRailMeshName(names);
}

export function hasPinballmapRoot(root: THREE.Object3D): boolean {
  return !!findObjectByNormalizedName(root, 'Pinballmap', 'pinballmap');
}

/**
 * Flat GLB floors replaced, FOR COLLISION ONLY, by the smooth analytic
 * cuboid (PlayfieldColliderFactory.createPlayfieldFloor). The meshes stay
 * VISIBLE: only their physics is removed (bumpy trimesh that slowed the
 * ball down).
 *
 * - Mesh_0: play surface (full playfield) — verified in Blender.
 *
 * WARNING: Mesh_1 = the molded WALLS (verified in Blender). It was once
 * wrongly excluded here ("2nd surface layer") → the bottom walls stopped
 * blocking the ball. It MUST keep its collision.
 */
export const PINBALLMAP_NONPHYSICAL_FLOOR_MESHES = new Set([
  'mesh_0',
  'mesh.0',
  'mesh0',
]);

/** Name-based variant of isPinballmapNonPhysicalFloorMesh (self name). */
export function isPinballmapNonPhysicalFloorMeshName(selfName: string): boolean {
  const n = normalizeGltfName(selfName);
  const c = canonicalGltfName(selfName);
  return (
    PINBALLMAP_NONPHYSICAL_FLOOR_MESHES.has(n) ||
    PINBALLMAP_NONPHYSICAL_FLOOR_MESHES.has(c)
  );
}

export function isPinballmapNonPhysicalFloorMesh(mesh: THREE.Mesh): boolean {
  return isPinballmapNonPhysicalFloorMeshName(mesh.name);
}

/**
 * GLB switch sensors (visual, non-gameplay sensor zones).
 * Single source shared by the 3 pipelines: trimesh (HIDDEN_NODES),
 * colliders (EXCLUDED_NODES) and rendering (VISUALLY_HIDDEN_NODES).
 * Both underscore and space variants are matched.
 */
export const SWITCH_SENSOR_NODES = new Set([
  'switch_slingshot', 'switch slingshot',
  'switch_left_pop_bumper_zone',  'switch left pop bumper zone',
  'switch_center_pop_bumper_zone','switch center pop bumper zone',
  'switch_right_pop_bumper_zone', 'switch right pop bumper zone',
  'switch_plunger', 'switch plunger',
  'switch_rocket',  'switch rocket',
  'switch_out',     'switch out',
]);

/**
 * GLB nodes present in the model that must stay invisible in game
 * (plate, switch sensors…).
 * No collision either — these nodes are already in PlayfieldTrimeshBuilder's
 * EXCLUDED_NODES.
 */
const VISUALLY_HIDDEN_NODES = new Set(['plate', ...SWITCH_SENSOR_NODES]);

/** Hides the decorative / non-gameplay GLB meshes (plate, switches). */
export function hidePinballmapDecorNodes(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const n = normalizeGltfName(obj.name);
    const c = canonicalGltfName(obj.name);
    if (VISUALLY_HIDDEN_NODES.has(n) || VISUALLY_HIDDEN_NODES.has(c)) {
      obj.visible = false;
    }
  });
}

export function removePinballmapUnusedMeshes(root: THREE.Object3D): void {
  const toRemove: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const c = canonicalGltfName(obj.name);
    const n = normalizeGltfName(obj.name);
    if (c === 'ball' || c === 'ball_metal' || c === 'icosphere_001' || c === 'sphere_001') {
      toRemove.push(obj);
      return;
    }
    if (isPinballmapGameplayMesh(obj) && /^sphere\.\d+$/.test(n)) {
      toRemove.push(obj);
    }
  });
  for (const obj of toRemove) {
    obj.parent?.remove(obj);
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    }
  }
}

export function playfieldUsesCollOnlyCollision(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((obj) => {
    if (found) return;
    if (!(obj instanceof THREE.Mesh)) return;
    if (normalizeGltfName(obj.name).startsWith('coll_')) found = true;
  });
  return found;
}

export function isJunkGltfMeshName(name: string): boolean {
  const n = normalizeGltfName(name);
  if (n.startsWith('circle')) return true;
  if (/^cube(\.\d+)?$/.test(n)) return true;
  if (/^sphere(\.\d+)?$/.test(n)) return true;
  if (/^cylinder(\.\d+)?$/.test(n)) return true;
  if (/^table\.\d+$/.test(n)) return true;
  if (n.includes('_normal') || n.includes('_color')) return true;
  if (/^(board_wood|red_acrilic|aluminum|copper|locknut|white_|black_|metal_sheet)/.test(n)) {
    return true;
  }
  return false;
}
