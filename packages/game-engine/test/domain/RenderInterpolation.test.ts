import { test, expect } from 'bun:test';
import { lerpVec3 } from '../../src/domain/RenderInterpolation';

const prev = { x: 0, y: 10, z: -2 };
const curr = { x: 1, y: 20, z: 2 };

test('alpha 0 → position précédente', () => {
  const out = { x: 0, y: 0, z: 0 };
  expect(lerpVec3(prev, curr, 0, out)).toEqual(prev);
});

test('alpha 1 → position courante', () => {
  const out = { x: 0, y: 0, z: 0 };
  expect(lerpVec3(prev, curr, 1, out)).toEqual(curr);
});

test('alpha 0.5 → milieu, écrit dans out et le renvoie', () => {
  const out = { x: 0, y: 0, z: 0 };
  const r = lerpVec3(prev, curr, 0.5, out);
  expect(r).toBe(out);
  expect(out).toEqual({ x: 0.5, y: 15, z: 0 });
});

test('alpha hors bornes → clamp, jamais d\'extrapolation', () => {
  const out = { x: 0, y: 0, z: 0 };
  expect(lerpVec3(prev, curr, 2, out)).toEqual(curr);
  expect(lerpVec3(prev, curr, -1, out)).toEqual(prev);
});
