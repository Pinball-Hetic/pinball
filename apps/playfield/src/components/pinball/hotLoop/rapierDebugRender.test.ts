import { test, expect, describe } from "bun:test";
import { sanitizeRapierDebugBuffers } from "./rapierDebugRender";

describe("sanitizeRapierDebugBuffers", () => {
  test("RGBA → RGB : alpha droppé, ordre préservé", () => {
    const vertices = new Float32Array([0, 1, 2, 3, 4, 5]);
    const colors = new Float32Array([0.1, 0.2, 0.3, 1, 0.4, 0.5, 0.6, 1]);
    const { rgb } = sanitizeRapierDebugBuffers(vertices, colors);
    expect([...rgb]).toEqual([
      expect.closeTo(0.1), expect.closeTo(0.2), expect.closeTo(0.3),
      expect.closeTo(0.4), expect.closeTo(0.5), expect.closeTo(0.6),
    ]);
  });

  test("sommets NaN/Infinity écrasés à 0, finis intacts", () => {
    const vertices = new Float32Array([1, NaN, 3, Infinity, -Infinity, 6]);
    const colors = new Float32Array(8);
    const { vertices: out } = sanitizeRapierDebugBuffers(vertices, colors);
    expect([...out]).toEqual([1, 0, 3, 0, 0, 6]);
  });

  test("rgb dimensionné sur vertices (3 par sommet)", () => {
    const vertices = new Float32Array(9);
    const colors = new Float32Array(12);
    const { rgb } = sanitizeRapierDebugBuffers(vertices, colors);
    expect(rgb.length).toBe(9);
  });
});
