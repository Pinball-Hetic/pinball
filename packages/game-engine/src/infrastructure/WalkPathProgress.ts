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
 * Progression de marche pure d'un boss : spawn → target le long du tapis
 * incliné. Comportement extrait verbatim des *TargetVisual (ST + Zelda) :
 *  - progressAt(elapsed) = min(1, elapsed / duration)
 *  - positionAt(t) lerp x/z spawn→target, y = surfaceYAtZ(z) + footLift,
 *    t clampé sur [0, 1].
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
 * Placement statique d'un boss sur le tapis incliné : même formule que
 * WalkPathProgress.positionAt(1). Verbatim des *TargetVisual (ST + Zelda) :
 * { x, y: surfaceYAtZ(z) + footLift, z }. surfaceYAtZ injecté (DIP).
 */
export function surfacePoint(
  target: WalkPathPoint,
  footLift: number,
  surfaceYAtZ: (z: number) => number,
): WalkPathPosition {
  return { x: target.x, y: surfaceYAtZ(target.z) + footLift, z: target.z };
}

/**
 * Yaw du modèle pour faire face à la caméra (billboard sur l'axe Y).
 * Verbatim des *TargetVisual : atan2(camX - anchorX, camZ - anchorZ) + yaw.
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
 * Yaw du modèle pour faire face à la direction de marche (spawn → target).
 * Verbatim des *TargetVisual : atan2(targetX - spawnX, targetZ - spawnZ) + yaw.
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
