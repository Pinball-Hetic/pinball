import {
  WALL_LEFT_X,
  WALL_RIGHT_X,
  WALL_TOP_Z,
  WALL_BOTTOM_Z,
  parsePlayfieldViewMode,
  type PlayfieldViewMode,
} from '@pinball/game-engine';

const VIEW_MODE = parsePlayfieldViewMode(process.env.NEXT_PUBLIC_PLAYFIELD_VIEW_MODE);

const LEGACY_X_MIN = 8;
const LEGACY_X_MAX = 92;
const LEGACY_Y_MIN = 18;
const LEGACY_Y_MAX = 78;
const LEGACY_Y_BASE = 14;
const LEGACY_Y_SCALE = 0.68;

const PORTRAIT_PAD_X = 0;
const PORTRAIT_PAD_Y = 0;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizedPlayfieldCoords(x: number, z: number): { nx: number; nz: number } {
  return {
    nx: ((x - WALL_LEFT_X) / (WALL_RIGHT_X - WALL_LEFT_X)) * 100,
    nz: ((z - WALL_TOP_Z) / (WALL_BOTTOM_Z - WALL_TOP_Z)) * 100,
  };
}

export function playfieldToScreenPercentForMode(
  x: number,
  z: number,
  viewMode: PlayfieldViewMode,
): { x: number; y: number } {
  const { nx, nz } = normalizedPlayfieldCoords(x, z);
  if (viewMode === 'portrait-fill') {
    return {
      x: clamp(nx, PORTRAIT_PAD_X, 100 - PORTRAIT_PAD_X),
      y: clamp(nz, PORTRAIT_PAD_Y, 100 - PORTRAIT_PAD_Y),
    };
  }
  return {
    x: clamp(nx, LEGACY_X_MIN, LEGACY_X_MAX),
    y: clamp(LEGACY_Y_BASE + nz * LEGACY_Y_SCALE, LEGACY_Y_MIN, LEGACY_Y_MAX),
  };
}

export function playfieldToScreenPercent(x: number, z: number): { x: number; y: number } {
  return playfieldToScreenPercentForMode(x, z, VIEW_MODE);
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
