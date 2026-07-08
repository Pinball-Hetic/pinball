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
