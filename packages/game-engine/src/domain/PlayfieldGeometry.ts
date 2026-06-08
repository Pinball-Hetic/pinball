import { WALL_BOTTOM_Z, BALL_RADIUS, BALL_SPAWN_POSITION } from './Ball';
import { FLIPPER_Z_MAX } from './FlipperConstants';

export function surfaceYAtZ(z: number): number {
  return 1.068 - ((z + 0.552) / 0.970) * 0.110;
}

/** Centre de la sphère posé sur le tapis incliné à l'abscisse Z donnée. */
export function ballCenterOnSurface(z: number, margin = 0.002): number {
  return surfaceYAtZ(z) + BALL_RADIUS + margin;
}

export const DRAIN_Z_THRESHOLD = WALL_BOTTOM_Z + BALL_RADIUS * 2;

export const BOTTOM_OUT_Z = FLIPPER_Z_MAX + 0.025;
export const BOTTOM_OUT_LANE_SEP_X = BALL_SPAWN_POSITION.x - BALL_RADIUS * 2;

export function isInBottomOutZone(x: number, z: number): boolean {
  return z >= BOTTOM_OUT_Z && x <= BOTTOM_OUT_LANE_SEP_X;
}

export const PLAYFIELD_SHADE_W = 0.58;
export const PLAYFIELD_SHADE_D = 1.02;
export const PLAYFIELD_TILT = Math.atan2(0.110, 0.970);
export const PLAYFIELD_SHADE_Y = 1.062;
export const PLAYFIELD_SHADE_Z = -0.067;
export const PLAYFIELD_SHADE_MAX_OPACITY = 0.96;
