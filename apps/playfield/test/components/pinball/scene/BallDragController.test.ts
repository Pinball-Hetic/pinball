import { describe, expect, it } from "bun:test";
import { pointerToNdc } from "../../../../src/components/pinball/scene/BallDragController";

describe("pointerToNdc", () => {
  const rect = { left: 0, top: 0, width: 800, height: 600 };

  it("maps the top-left corner to (-1, 1)", () => {
    expect(pointerToNdc(0, 0, rect)).toEqual({ x: -1, y: 1 });
  });

  it("maps the bottom-right corner to (1, -1)", () => {
    expect(pointerToNdc(800, 600, rect)).toEqual({ x: 1, y: -1 });
  });

  it("maps the center to (0, 0)", () => {
    expect(pointerToNdc(400, 300, rect)).toEqual({ x: 0, y: 0 });
  });

  it("accounts for the canvas offset (rect.left/top)", () => {
    const offset = { left: 100, top: 50, width: 800, height: 600 };
    expect(pointerToNdc(100, 50, offset)).toEqual({ x: -1, y: 1 });
    expect(pointerToNdc(500, 350, offset)).toEqual({ x: 0, y: 0 });
  });

  it("inverts Y (screen down = NDC down)", () => {
    // Halfway down the canvas → NDC y should be 0, not 0.5.
    const { y } = pointerToNdc(0, 300, rect);
    expect(y).toBe(0);
  });
});
