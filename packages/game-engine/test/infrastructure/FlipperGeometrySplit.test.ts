import { test, expect } from 'bun:test';
import { partitionTrianglesByPlaneX, remapTriangles } from '../../src/infrastructure/FlipperGeometrySplit';

test('partitions triangles left/right by centroid X relative to the plane', () => {
  // 6 vertices: 0,1,2 clearly on -X side; 3,4,5 clearly on +X side.
  const worldX = [-2, -1, -3, 2, 1, 3];
  const indices = [0, 1, 2, 3, 4, 5];

  const { leftTris, rightTris } = partitionTrianglesByPlaneX(indices, worldX, 0);

  expect(leftTris).toEqual([0, 1, 2]);
  expect(rightTris).toEqual([3, 4, 5]);
});

test('a triangle straddling the plane is assigned by its centroid', () => {
  // tri 0: centroid X = (-5 + 1 + 1)/3 = -1 → left
  // tri 1: centroid X = (5 + -1 + 1)/3 ≈ 1.67 → right
  const worldX = [-5, 1, 1, 5, -1, 1];
  const indices = [0, 1, 2, 3, 4, 5];

  const { leftTris, rightTris } = partitionTrianglesByPlaneX(indices, worldX, 0);

  expect(leftTris).toEqual([0, 1, 2]);
  expect(rightTris).toEqual([3, 4, 5]);
});

test('a triangle whose centroid is exactly on the plane goes left (inclusive)', () => {
  // centroid X = (-1 + 0 + 1)/3 = 0 → left (≤ planeX)
  const worldX = [-1, 0, 1];
  const indices = [0, 1, 2];

  const { leftTris, rightTris } = partitionTrianglesByPlaneX(indices, worldX, 0);

  expect(leftTris).toEqual([0, 1, 2]);
  expect(rightTris).toEqual([]);
});

test('honours a non-zero split plane', () => {
  // centroid = 4 with planeX = 5 → left; centroid = 7 → right
  const worldX = [3, 4, 5, 6, 7, 8];
  const indices = [0, 1, 2, 3, 4, 5];

  const { leftTris, rightTris } = partitionTrianglesByPlaneX(indices, worldX, 5);

  expect(leftTris).toEqual([0, 1, 2]);
  expect(rightTris).toEqual([3, 4, 5]);
});

test('empty index input yields empty partitions', () => {
  const { leftTris, rightTris } = partitionTrianglesByPlaneX([], [], 0);
  expect(leftTris).toEqual([]);
  expect(rightTris).toEqual([]);
});

test('ignores a trailing partial triangle (index length not a multiple of 3)', () => {
  const worldX = [-1, -1, -1, -1];
  const indices = [0, 1, 2, 3]; // only one full triangle

  const { leftTris } = partitionTrianglesByPlaneX(indices, worldX, 0);
  expect(leftTris).toEqual([0, 1, 2]);
});

test('remaps triangles into a compacted vertex range, first-seen order', () => {
  // source has 5 verts; only verts 2,4 are referenced.
  const positions = [
    0, 0, 0, // 0
    1, 1, 1, // 1
    2, 2, 2, // 2
    3, 3, 3, // 3
    4, 4, 4, // 4
  ];
  // tris reference 4 then 2 then 4 then 2.
  const tris = [4, 2, 4, 4, 2, 4];

  const { positions: outPos, indices } = remapTriangles(tris, positions, null);

  // first-seen: 4 → 0, 2 → 1
  expect(Array.from(outPos)).toEqual([4, 4, 4, 2, 2, 2]);
  expect(indices).toEqual([0, 1, 0, 0, 1, 0]);
});

test('rebuilds UVs alongside positions when present', () => {
  const positions = [10, 0, 0, 20, 0, 0, 30, 0, 0];
  const uvs = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
  const tris = [2, 0, 1];

  const { positions: outPos, uvs: outUvs, indices } = remapTriangles(tris, positions, uvs);

  expect(Array.from(outPos)).toEqual([30, 0, 0, 10, 0, 0, 20, 0, 0]);
  const expectedUvs = [0.5, 0.6, 0.1, 0.2, 0.3, 0.4];
  expect(outUvs.length).toBe(expectedUvs.length);
  expectedUvs.forEach((v, i) => expect(outUvs[i]).toBeCloseTo(v, 5));
  expect(indices).toEqual([0, 1, 2]);
});

test('emits no UVs when source UVs are absent or empty', () => {
  const positions = [0, 0, 0, 1, 1, 1, 2, 2, 2];
  const tris = [0, 1, 2];

  const fromNull = remapTriangles(tris, positions, null);
  const fromEmpty = remapTriangles(tris, positions, []);

  expect(fromNull.uvs.length).toBe(0);
  expect(fromEmpty.uvs.length).toBe(0);
});

test('empty triangle list yields empty geometry', () => {
  const { positions, uvs, indices } = remapTriangles([], [1, 2, 3], [0, 0]);
  expect(positions.length).toBe(0);
  expect(uvs.length).toBe(0);
  expect(indices).toEqual([]);
});

test('partition then remap reproduces a full split end-to-end', () => {
  // 2 triangles, one each side of X=0.
  const positions = [
    -2, 0, 0, // 0
    -1, 1, 0, // 1
    -3, 1, 0, // 2
    2, 0, 0,  // 3
    1, 1, 0,  // 4
    3, 1, 0,  // 5
  ];
  const worldX = [-2, -1, -3, 2, 1, 3];
  const indices = [0, 1, 2, 3, 4, 5];

  const { leftTris, rightTris } = partitionTrianglesByPlaneX(indices, worldX, 0);
  const left = remapTriangles(leftTris, positions, null);
  const right = remapTriangles(rightTris, positions, null);

  expect(Array.from(left.positions)).toEqual([-2, 0, 0, -1, 1, 0, -3, 1, 0]);
  expect(left.indices).toEqual([0, 1, 2]);
  expect(Array.from(right.positions)).toEqual([2, 0, 0, 1, 1, 0, 3, 1, 0]);
  expect(right.indices).toEqual([0, 1, 2]);
});
