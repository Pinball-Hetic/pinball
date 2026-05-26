import {
  WALL_LEFT_X,
  WALL_RIGHT_X,
  WALL_TOP_Z,
  WALL_BOTTOM_Z,
} from "@pinball/game-engine";

export function playfieldToScreenPercent(x: number, z: number): { x: number; y: number } {
  const nx =
    ((x - WALL_LEFT_X) / (WALL_RIGHT_X - WALL_LEFT_X)) * 100;
  const nz =
    ((z - WALL_TOP_Z) / (WALL_BOTTOM_Z - WALL_TOP_Z)) * 100;
  return {
    x: Math.min(92, Math.max(8, nx)),
    y: Math.min(78, Math.max(18, 14 + nz * 0.68)),
  };
}

export function jitterScreenPoint(point: { x: number; y: number }, spread = 5): {
  x: number;
  y: number;
} {
  return {
    x: point.x + (Math.random() - 0.5) * spread,
    y: point.y + (Math.random() - 0.5) * spread,
  };
}
