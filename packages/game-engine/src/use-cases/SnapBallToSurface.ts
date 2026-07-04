import {
  SURFACE_SNAP_THRESHOLD,
  WALL_BOTTOM_Z,
  WALL_LEFT_X,
  WALL_RIGHT_X,
  WALL_TOP_Z,
} from '../domain/Ball';
import { ballCenterOnSurface } from '../domain/PlayfieldGeometry';

type Vec3 = { x: number; y: number; z: number };

export interface SurfaceSnapResult {
  /** Position to rest the ball at (always present when the snap triggers). */
  translation: Vec3;
  /** Corrected velocity — present only when an upward Y was cancelled. */
  linvel?: Vec3;
}

/**
 * Decides whether the ball must be snapped back onto the tilted surface.
 * Pure: no Rapier dependency — the caller reads pos/vel from the body and
 * applies the result. Returns null when no snap is needed.
 *
 * Rules:
 * - active only inside the playfield, outside the straight shooter lane;
 * - triggers when the ball lifts more than SURFACE_SNAP_THRESHOLD;
 * - cancels only POSITIVE Y velocity (lift-off) — negative Y is gravity
 *   bringing the ball back, never blocked. XZ untouched → game speed kept.
 */
export function computeSurfaceSnap(
  pos: Vec3,
  vel: Vec3,
  lane: { leftWallTopZ: number; lockX: number },
): SurfaceSnapResult | null {
  const inLaneStraight = pos.z > lane.leftWallTopZ && pos.x > lane.lockX;
  if (inLaneStraight) return null;

  const inPlayfield =
    pos.x > WALL_LEFT_X && pos.x < WALL_RIGHT_X &&
    pos.z > WALL_TOP_Z && pos.z < WALL_BOTTOM_Z;
  if (!inPlayfield) return null;

  const surfaceY = ballCenterOnSurface(pos.z);
  if (pos.y <= surfaceY + SURFACE_SNAP_THRESHOLD) return null;

  const result: SurfaceSnapResult = { translation: { x: pos.x, y: surfaceY, z: pos.z } };
  if (vel.y > 0) result.linvel = { x: vel.x, y: 0, z: vel.z };
  return result;
}
