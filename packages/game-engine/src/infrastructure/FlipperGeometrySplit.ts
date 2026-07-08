export type TriangleSplit = {
  leftTris: number[];
  rightTris: number[];
};

export type RemappedGeometry = {
  positions: Float32Array;
  uvs: Float32Array;
  indices: number[];
};

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
