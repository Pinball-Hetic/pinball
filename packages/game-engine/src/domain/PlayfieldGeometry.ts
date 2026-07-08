import {
  WALL_BOTTOM_Z,
  WALL_TOP_Z,
  WALL_LEFT_X,
  WALL_RIGHT_X,
  DEFAULT_BALL_RADIUS,
  getBallRadius,
} from './Ball';
import { FLIPPER_Z_MAX } from './FlipperConstants';
import type { SurfaceCoefficients } from './MapLayout';

const DEFAULT_SURFACE_COEFFICIENTS: SurfaceCoefficients = {
  base: 1.068,
  zOffset: 0.552,
  zSpan: 0.970,
  yDrop: 0.110,
};

let surfaceCoefficients: SurfaceCoefficients = DEFAULT_SURFACE_COEFFICIENTS;

// Call once at load time, BEFORE any physics/camera setup: spawns, colliders
// and camera framing all derive from surfaceYAtZ.
export function configureSurfaceCoefficients(coefficients: SurfaceCoefficients): void {
  surfaceCoefficients = coefficients;
}

export function resetSurfaceCoefficients(): void {
  surfaceCoefficients = DEFAULT_SURFACE_COEFFICIENTS;
}

export function surfaceYAtZ(z: number): number {
  const { base, zOffset, zSpan, yDrop } = surfaceCoefficients;
  return base - ((z + zOffset) / zSpan) * yDrop;
}

export function ballCenterOnSurface(z: number, margin = 0.002): number {
  return surfaceYAtZ(z) + getBallRadius() + margin;
}

export const DRAIN_Z_THRESHOLD = WALL_BOTTOM_Z + DEFAULT_BALL_RADIUS * 2;

export const BOTTOM_OUT_Z = FLIPPER_Z_MAX + 0.025;

export function bottomOutLaneSepX(spawnX: number): number {
  return spawnX - getBallRadius() * 2;
}

export function isInBottomOutZone(x: number, z: number, laneSepX: number = WALL_RIGHT_X): boolean {
  return z >= BOTTOM_OUT_Z && x <= laneSepX;
}

// Playfield surface ∈ [0.958, 1.068]; below 0.90 the ball fell into the void.
export const BALL_LOST_Y_THRESHOLD = 0.90;
export const BALL_OOB_MARGIN = 0.08;

export function isBallOutOfBounds(x: number, z: number): boolean {
  return (
    x < WALL_LEFT_X - BALL_OOB_MARGIN ||
    x > WALL_RIGHT_X + BALL_OOB_MARGIN ||
    z < WALL_TOP_Z - BALL_OOB_MARGIN ||
    z > WALL_BOTTOM_Z + BALL_OOB_MARGIN
  );
}

export const PLAYFIELD_SHADE_W = 0.58;
export const PLAYFIELD_SHADE_D = 1.02;
export const PLAYFIELD_TILT = Math.atan2(0.110, 0.970);
export const PLAYFIELD_SHADE_Y = 1.062;
export const PLAYFIELD_SHADE_Z = -0.067;
export const PLAYFIELD_SHADE_MAX_OPACITY = 0.96;
