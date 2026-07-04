import { canonicalGltfName, normalizeGltfName } from './GltfNodeNames';
import type { MeshElements } from './PlayfieldTrimeshBuilder';

/**
 * True if any ancestor name (self included, most specific to root) belongs
 * to `names`, comparing both the normalized form and the canonical form
 * (vis_/coll_/pf_ prefixes stripped).
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
 * Resolves a trimesh group's material params from `elements[key]`, applying
 * defaults. `role` decides the smoothing default (floor smoothed, wall/lane
 * raw).
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
 * Laplacian smoothing over interleaved xyz positions of an already-welded
 * geometry. Each vertex is pulled toward the barycenter of its neighbors
 * (triangle edges) by `factor`, over `iterations` passes.
 * Returns a new Float32Array; the input is not mutated. Isolated vertices
 * (count 0) are left unchanged.
 */
export function laplacianSmoothPositions(
  positions: Float32Array,
  index: ArrayLike<number>,
  iterations: number,
  factor: number,
): Float32Array {
  const out = new Float32Array(positions);
  const vertexCount = out.length / 3;

  for (let iter = 0; iter < iterations; iter++) {
    const sums = new Float32Array(vertexCount * 3);
    const counts = new Uint32Array(vertexCount);

    for (let i = 0; i < index.length; i += 3) {
      const a = index[i], b = index[i + 1], c = index[i + 2];
      for (const [u, v] of [[a, b], [b, c], [a, c]] as [number, number][]) {
        sums[u * 3] += out[v * 3];
        sums[u * 3 + 1] += out[v * 3 + 1];
        sums[u * 3 + 2] += out[v * 3 + 2];
        sums[v * 3] += out[u * 3];
        sums[v * 3 + 1] += out[u * 3 + 1];
        sums[v * 3 + 2] += out[u * 3 + 2];
        counts[u]++;
        counts[v]++;
      }
    }

    for (let i = 0; i < vertexCount; i++) {
      if (counts[i] === 0) continue;
      const cx = sums[i * 3] / counts[i];
      const cy = sums[i * 3 + 1] / counts[i];
      const cz = sums[i * 3 + 2] / counts[i];
      out[i * 3] += (cx - out[i * 3]) * factor;
      out[i * 3 + 1] += (cy - out[i * 3 + 1]) * factor;
      out[i * 3 + 2] += (cz - out[i * 3 + 2]) * factor;
    }
  }

  return out;
}

/**
 * Index of a double-sided geometry: concatenates the original index with a
 * reverse-wound copy (back-faces). For each triangle (i, i+1, i+2) the back
 * face is (i+2, i+1, i). Returns a new array; the input is not mutated.
 */
export function reverseWoundIndices(index: ArrayLike<number>): number[] {
  const n = index.length;
  const doubled = new Array<number>(n * 2);
  for (let i = 0; i < n; i++) doubled[i] = index[i];
  for (let i = 0; i < n; i += 3) {
    doubled[n + i] = index[i + 2];
    doubled[n + i + 1] = index[i + 1];
    doubled[n + i + 2] = index[i];
  }
  return doubled;
}

/**
 * Merges several geometries (interleaved xyz positions + optional index) into
 * a single verts/indices pair, offsetting indices per group. Without an
 * index, vertices are indexed sequentially.
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
