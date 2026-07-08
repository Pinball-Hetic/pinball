import { BALL_MAX_SPEED } from '../domain/Ball';
import { ballCenterOnSurface } from '../domain/PlayfieldGeometry';

type Vec3 = { x: number; y: number; z: number };

export interface BallBodyState {
  translation: Vec3;
  linvel: Vec3;
  angvel: Vec3;
}

export function computeIdleSpawnLock(spawn: { x: number; y: number; z: number }): BallBodyState {
  const z = spawn.z;
  return {
    translation: { x: spawn.x, y: ballCenterOnSurface(z), z },
    linvel: { x: 0, y: 0, z: 0 },
    angvel: { x: 0, y: 0, z: 0 },
  };
}

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

// Both rules read the SAME initial velocity; the y > 1.25 rule fully replaces
// (not composes with) the speed-scale result.
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
