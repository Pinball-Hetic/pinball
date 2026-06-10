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

export function isPinballmapGameplayMesh(mesh: THREE.Mesh): boolean {
  return hasNamedAncestor(mesh, 'Pinballmap');
}

export function isFlipperGltfMesh(mesh: THREE.Mesh): boolean {
  let current: THREE.Object3D | null = mesh;
  while (current) {
    const n = normalizeGltfName(current.name);
    if (n === 'pinballmap') return false;
    // Ancienne convention : nœud unique "flipper" ou "flipper.001"
    // Nouvelle convention : sous-modèles séparés "flipper-left" / "flipper-right"
    if (
      n === 'flipper' ||
      n.startsWith('flipper.') ||
      n === 'flipper-left' ||
      n === 'flipper-right' ||
      n === 'flipper_left' ||
      n === 'flipper_right'
    ) return true;
    current = current.parent;
  }
  return false;
}

export function isPinballmapRailMesh(mesh: THREE.Mesh): boolean {
  const self = normalizeGltfName(mesh.name);
  if (/^circle\.\d+$/.test(self) || /^plane\.\d+$/.test(self)) return true;
  let current: THREE.Object3D | null = mesh.parent;
  while (current) {
    const n = normalizeGltfName(current.name);
    if (n === 'pinballmap') return false;
    if (/^circle\.\d+$/.test(n) || /^plane\.\d+$/.test(n)) return true;
    current = current.parent;
  }
  return false;
}

export function hasPinballmapRoot(root: THREE.Object3D): boolean {
  return !!findObjectByNormalizedName(root, 'Pinballmap', 'pinballmap');
}

/**
 * Sols GLB plats remplacés, POUR LA COLLISION UNIQUEMENT, par le cuboïde
 * analytique lisse (PlayfieldColliderFactory.createPlayfieldFloor). Les
 * meshes restent VISIBLES : on n'enlève que leur physique (trimesh
 * bosselé qui freinait la balle).
 *
 * - Mesh_0 : surface de jeu (plein plateau) — vérifié dans Blender.
 *
 * ATTENTION : Mesh_1 = les MURS moulés (vérifié dans Blender). Il a été
 * exclu ici par erreur par le passé ("2ᵉ couche de surface") → les murs
 * du bas ne stoppaient plus la bille. Il DOIT garder sa collision.
 */
export const PINBALLMAP_NONPHYSICAL_FLOOR_MESHES = new Set([
  'mesh_0',
  'mesh.0',
  'mesh0',
]);

export function isPinballmapNonPhysicalFloorMesh(mesh: THREE.Mesh): boolean {
  const n = normalizeGltfName(mesh.name);
  const c = canonicalGltfName(mesh.name);
  return (
    PINBALLMAP_NONPHYSICAL_FLOOR_MESHES.has(n) ||
    PINBALLMAP_NONPHYSICAL_FLOOR_MESHES.has(c)
  );
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
