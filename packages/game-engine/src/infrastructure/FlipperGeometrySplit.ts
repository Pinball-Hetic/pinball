/**
 * Pure geometry math for splitting a single flipper mesh into a left/right
 * pair at the playfield center plane (X = `planeX`). No THREE.js: operates on
 * plain typed arrays so the partition + remap logic is unit-testable.
 *
 * The caller (FlipperSplitter) reads THREE geometry attributes into these
 * arrays, runs the pure math here, then rebuilds THREE meshes from the result.
 */

export type TriangleSplit = {
  /** Flat triangle list (vertex indices, 3 per tri) whose centroid X ≤ planeX. */
  leftTris: number[];
  /** Flat triangle list (vertex indices, 3 per tri) whose centroid X > planeX. */
  rightTris: number[];
};

export type RemappedGeometry = {
  /** Compacted vertex positions (x, y, z per vertex), only kept vertices. */
  positions: Float32Array;
  /** Compacted UVs (u, v per vertex), empty when source had no UVs. */
  uvs: Float32Array;
  /** Triangle indices remapped to the compacted vertex range. */
  indices: number[];
};

/**
 * Partition triangles by the X coordinate of their centroid relative to the
 * split plane. A triangle whose centroid X is ≤ planeX goes left, otherwise
 * right — matching the original FlipperSplitter behaviour (boundary inclusive
 * on the left).
 *
 * @param indices flat index list, 3 entries per triangle
 * @param worldX  per-vertex world-space X, indexed by vertex id
 * @param planeX  split plane X (playfield center, usually 0)
 */
export function partitionTrianglesByPlaneX(
  indices: number[],
  worldX: number[],
  planeX: number,
): TriangleSplit {
  const leftTris: number[] = [];
  const rightTris: number[] = [];
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = indices[t]!;
    const b = indices[t + 1]!;
    const c = indices[t + 2]!;
    const centroidX = (worldX[a]! + worldX[b]! + worldX[c]!) / 3;
    (centroidX <= planeX ? leftTris : rightTris).push(a, b, c);
  }
  return { leftTris, rightTris };
}

/**
 * Rebuild a compacted geometry for a subset of triangles: only the vertices
 * referenced by `tris` are kept, in first-seen order, and the triangle indices
 * are remapped into that compacted range. Positions/UVs are read from the
 * source per-vertex arrays.
 *
 * @param tris      flat triangle list (vertex indices into source arrays)
 * @param positions source local positions (x, y, z per vertex)
 * @param uvs       source UVs (u, v per vertex); pass null/empty when absent
 * @returns compacted positions, uvs, and remapped indices
 */
export function remapTriangles(
  tris: number[],
  positions: ArrayLike<number>,
  uvs: ArrayLike<number> | null,
): RemappedGeometry {
  const hasUvs = uvs != null && uvs.length > 0;
  const remap = new Map<number, number>();
  const pos: number[] = [];
  const outUvs: number[] = [];
  const indices: number[] = [];

  for (const old of tris) {
    let next = remap.get(old);
    if (next === undefined) {
      next = pos.length / 3;
      remap.set(old, next);
      pos.push(positions[old * 3]!, positions[old * 3 + 1]!, positions[old * 3 + 2]!);
      if (hasUvs) outUvs.push(uvs[old * 2]!, uvs[old * 2 + 1]!);
    }
    indices.push(next);
  }

  return {
    positions: new Float32Array(pos),
    uvs: new Float32Array(outUvs),
    indices,
  };
}
