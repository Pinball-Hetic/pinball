import { surfaceYAtZ } from '../domain/PlayfieldGeometry';

export interface WalkPathPoint {
  x: number;
  z: number;
}

export interface WalkPathPosition {
  x: number;
  y: number;
  z: number;
}

function clamp01(t: number): number {
  if (t < 0) return 0;
  if (t > 1) return 1;
  return t;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Boss walk progression: spawn → target along the tilted playfield.
 *  - progressAt(elapsed) = min(1, elapsed / duration)
 *  - positionAt(t) lerps x/z spawn→target, y = surfaceYAtZ(z) + footLift,
 *    t clamped to [0, 1].
 */
export class WalkPathProgress {
  constructor(
    private readonly spawn: WalkPathPoint,
    private readonly target: WalkPathPoint,
    private readonly footLift: number,
    private readonly duration: number,
  ) {}

  progressAt(elapsed: number): number {
    return Math.min(1, elapsed / this.duration);
  }

  positionAt(t: number): WalkPathPosition {
    const clamped = clamp01(t);
    const x = lerp(this.spawn.x, this.target.x, clamped);
    const z = lerp(this.spawn.z, this.target.z, clamped);
    return { x, y: surfaceYAtZ(z) + this.footLift, z };
  }
}

/**
 * Static boss placement on the tilted playfield: same formula as
 * WalkPathProgress.positionAt(1) — { x, y: surfaceYAtZ(z) + footLift, z }.
 */
export function surfacePoint(
  target: WalkPathPoint,
  footLift: number,
  surfaceYAtZ: (z: number) => number,
): WalkPathPosition {
  return { x: target.x, y: surfaceYAtZ(target.z) + footLift, z: target.z };
}

/**
 * Model yaw to face the camera (Y-axis billboard):
 * atan2(camX - anchorX, camZ - anchorZ) + yaw.
 */
export function cameraFacingYaw(
  anchorPos: WalkPathPoint,
  camPos: WalkPathPoint,
  yaw: number,
): number {
  const dx = camPos.x - anchorPos.x;
  const dz = camPos.z - anchorPos.z;
  return Math.atan2(dx, dz) + yaw;
}

/**
 * Model yaw to face the walk direction (spawn → target):
 * atan2(targetX - spawnX, targetZ - spawnZ) + yaw.
 */
export function pathFacingYaw(
  spawn: WalkPathPoint,
  target: WalkPathPoint,
  yaw: number,
): number {
  const dz = target.z - spawn.z;
  const dx = target.x - spawn.x;
  return Math.atan2(dx, dz) + yaw;
}
