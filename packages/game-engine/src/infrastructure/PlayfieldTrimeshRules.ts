import { canonicalGltfName, normalizeGltfName } from './GltfNodeNames';
import type { MeshElements } from './PlayfieldTrimeshBuilder';

/**
 * Vrai si l'un des noms d'ancêtres (self inclus, du plus spécifique à la
 * racine) appartient à `names`, en comparant à la fois la forme normalisée
 * et la forme canonique (préfixes vis_/coll_/pf_ retirés).
 */
export function ancestryMatchesSet(ancestryNames: string[], names: Set<string>): boolean {
  for (const raw of ancestryNames) {
    const n = normalizeGltfName(raw);
    const c = canonicalGltfName(raw);
    if (names.has(n) || names.has(c)) return true;
  }
  return false;
}

export interface TrimeshMaterialParams {
  restitution: number;
  friction: number;
  smooth: boolean;
  doubleSided: boolean;
}

function elemNum(v: number | string | undefined, def: number): number {
  return typeof v === 'number' ? v : def;
}

/**
 * Résout les paramètres matière d'un groupe trimesh depuis `elements[key]`,
 * en appliquant les défauts. `role` détermine le défaut de lissage (floor
 * lissé, wall/lane bruts).
 */
export function resolveMaterialParams(
  el: MeshElements[string] | undefined,
  role: string,
): TrimeshMaterialParams {
  const e = el ?? {};
  const restitution = elemNum(e.restitution, 0.35);
  const friction = elemNum(e.friction, 0.15);
  const singleSided = e.singleSided === 1;
  const doubleSided = e.doubleSided !== undefined ? e.doubleSided === 1 : !singleSided;
  const defaultSmooth = role === 'floor';
  const smooth = e.smooth !== undefined ? e.smooth === 1 : defaultSmooth;
  return { restitution, friction, smooth, doubleSided };
}

export interface GeometryTuple {
  positions: ArrayLike<number>;
  index: ArrayLike<number> | null;
}

/**
 * Fusionne plusieurs géométries (positions interleavées xyz + index optionnel)
 * en un seul couple verts/indices, en décalant les index par groupe. Sans
 * index, les sommets sont indexés séquentiellement.
 */
export function mergeGeometryTuples(geos: GeometryTuple[]): { verts: number[]; indices: number[] } {
  const verts: number[] = [];
  const indices: number[] = [];
  let offset = 0;
  for (const g of geos) {
    const count = g.positions.length / 3;
    for (let i = 0; i < g.positions.length; i++) {
      verts.push(g.positions[i]);
    }
    const idxArr = g.index
      ? Array.from(g.index)
      : Array.from({ length: count }, (_, k) => k);
    for (const idx of idxArr) indices.push(idx + offset);
    offset += count;
  }
  return { verts, indices };
}
