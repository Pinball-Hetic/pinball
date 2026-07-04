import {
  FLIPPER_LAUNCH_VX_ATTENUATION,
  FLIPPER_MIN_LAUNCH_ANGVEL,
  FLIPPER_MIN_LAUNCH_VZ,
} from '../domain/FlipperConstants';
import type { FlipperZone } from '../infrastructure/FlipperZones';

type Vec3 = { x: number; y: number; z: number };

export interface FlipperLaunchAssistInput {
  pos: Vec3;
  vel: Vec3;
  zone: FlipperZone;
  angVel: number;
}

export interface FlipperLaunchAssistResult {
  linvel: Vec3;
}

/**
 * Flipper launch guarantee. Pure: no Rapier dependency — the caller reads
 * pos/vel from the body + derives angVel, applies the returned linvel and
 * triggers the flash. Returns null when no correction applies.
 *
 * Triggers when the ball is in the flipper zone AND the upswing angular
 * velocity exceeds FLIPPER_MIN_LAUNCH_ANGVEL AND vz is above
 * FLIPPER_MIN_LAUNCH_VZ: attenuate vx, clamp vz to FLIPPER_MIN_LAUNCH_VZ,
 * keep vy → guaranteed launch up the table.
 */
export function computeFlipperLaunchAssist(
  input: FlipperLaunchAssistInput,
): FlipperLaunchAssistResult | null {
  const { pos, vel, zone, angVel } = input;
  const inZone =
    pos.z > zone.zMin && pos.z < zone.zMax
    && pos.x > zone.xMin && pos.x < zone.xMax
    && pos.y >= zone.yMin && pos.y <= zone.yMax;
  if (!inZone) return null;
  if (angVel <= FLIPPER_MIN_LAUNCH_ANGVEL) return null;
  if (vel.z <= FLIPPER_MIN_LAUNCH_VZ) return null;
  return {
    linvel: {
      x: vel.x * FLIPPER_LAUNCH_VX_ATTENUATION,
      y: vel.y,
      z: FLIPPER_MIN_LAUNCH_VZ,
    },
  };
}
