import { WALL_BOTTOM_Z, BALL_RADIUS } from './Ball';

export function surfaceYAtZ(z: number): number {
  return 1.068 - ((z + 0.552) / 0.970) * 0.110;
}

export const DRAIN_Z_THRESHOLD = WALL_BOTTOM_Z + BALL_RADIUS * 2;
