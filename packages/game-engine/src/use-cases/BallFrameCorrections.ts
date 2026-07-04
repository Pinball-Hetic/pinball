import { BALL_MAX_SPEED } from '../domain/Ball';
import { ballCenterOnSurface } from '../domain/PlayfieldGeometry';

type Vec3 = { x: number; y: number; z: number };

export interface BallBodyState {
  translation: Vec3;
  linvel: Vec3;
  angvel: Vec3;
}

/**
 * Locks the ball at the spawn while idle (including during plunger charge):
 * otherwise gravity/tilt makes it slide against the right wall (friction →
 * slower launch). Pure: the caller reads spawn from the layout and applies
 * translation/linvel/angvel to the body.
 */
export function computeIdleSpawnLock(spawn: { x: number; y: number; z: number }): BallBodyState {
  const z = spawn.z;
  return {
    translation: { x: spawn.x, y: ballCenterOnSurface(z), z },
    linvel: { x: 0, y: 0, z: 0 },
    angvel: { x: 0, y: 0, z: 0 },
  };
}

/**
 * Shooter lane lateral lock: during the climb (straight right part of the
 * lane, before the exit opening), X is pinned to the spawn line and lateral
 * velocity is cancelled → perfectly straight launch, independent of GLB
 * geometry. The ball is released once it reaches the exit zone
 * (Z <= lane.leftWallTopZ) so it enters the playfield naturally.
 *
 * Returns the state to apply while in the straight part, the 'close' signal
 * once past exitX (the caller closes the gate), or null when nothing to do.
 */
export function computeLaneStraightLock(
  pos: Vec3,
  linvel: Vec3,
  angvel: Vec3,
  lane: { leftWallTopZ: number; lockX: number; exitX: number },
  spawnX: number,
): BallBodyState | 'close' | null {
  const inLaneStraight = pos.z > lane.leftWallTopZ && pos.x > lane.lockX;
  if (inLaneStraight) {
    return {
      translation: { x: spawnX, y: pos.y, z: pos.z },
      linvel: { x: 0, y: linvel.y, z: linvel.z },
      angvel: { x: angvel.x, y: 0, z: 0 },
    };
  }
  if (pos.x < lane.exitX) return 'close';
  return null;
}

/**
 * Speed clamp. Both rules read the SAME initial velocity (the second does not
 * see the result of the first):
 *   1. if total speed exceeds BALL_MAX_SPEED → scale x/y/z.
 *   2. if INITIAL y > 1.25 → overwrite with { x, y: 0.35, z } using the
 *      INITIAL x/z, fully replacing the result of step 1.
 * Returns the final linvel to apply, or null when no correction is needed.
 */
export function computeSpeedClamp(vel: Vec3): Vec3 | null {
  let out: Vec3 | null = null;
  const speed = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);
  if (speed > BALL_MAX_SPEED) {
    const scale = BALL_MAX_SPEED / speed;
    out = { x: vel.x * scale, y: vel.y * scale, z: vel.z * scale };
  }
  if (vel.y > 1.25) {
    out = { x: vel.x, y: 0.35, z: vel.z };
  }
  return out;
}
