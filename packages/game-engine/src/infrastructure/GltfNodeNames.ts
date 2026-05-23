import * as THREE from 'three';

/**
 * Noms GLB normalisés pour la physique / la recherche de nœuds.
 *
 * Export Blender (`Pinballmap.glb`) :
 * - `pf_*`  : visuel gameplay
 * - `coll_*`: collision seule (trimesh si au moins un mesh `coll_*` est présent)
 * - `vis_*` : visuel uniquement (exclu du trimesh)
 */
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
    if (n === 'flipper' || n.startsWith('flipper.')) return true;
    current = current.parent;
  }
  return false;
}

export function isPinballmapFloorMesh(mesh: THREE.Mesh): boolean {
  const n = normalizeGltfName(mesh.name);
  if (/^table\.\d+$/.test(n)) return true;
  if (/^sphere\.\d+$/.test(n)) return true;
  return false;
}

export function hidePinballmapDecorativeMeshes(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (!isPinballmapGameplayMesh(obj)) return;
    const n = normalizeGltfName(obj.name);
    if (/^sphere\.\d+$/.test(n)) {
      obj.visible = false;
    }
  });
}

/** Au moins un mesh `coll_*` → trimesh limité à ces meshes. */
export function playfieldUsesCollOnlyCollision(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((obj) => {
    if (found) return;
    if (!(obj instanceof THREE.Mesh)) return;
    if (normalizeGltfName(obj.name).startsWith('coll_')) found = true;
  });
  return found;
}

export function hideGltfDecorativeBall(root: THREE.Object3D): void {
  const hideNames = new Set(['ball', 'ball_metal', 'icosphere_001', 'sphere_001']);
  root.traverse((obj) => {
    const n = canonicalGltfName(obj.name);
    if (hideNames.has(n) || n === 'ball' || /^sphere(\.\d+)?$/.test(n)) {
      obj.visible = false;
      obj.traverse((child) => {
        child.visible = false;
      });
    }
  });
}

/** Nœuds parasites (formes orphelines Sketchfab / Blender) — exclus du trimesh. */
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
