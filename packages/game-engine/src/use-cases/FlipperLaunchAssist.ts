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
 * Garantie de lancement flipper. Pure : aucune dépendance Rapier — l'appelant
 * lit pos/vel du corps + dérive angVel, applique le linvel renvoyé et déclenche
 * le flash. Renvoie null quand aucune correction ne s'applique.
 *
 * Déclenche quand la balle est dans la zone du flipper ET la vitesse angulaire
 * de montée dépasse FLIPPER_MIN_LAUNCH_ANGVEL ET vz dépasse FLIPPER_MIN_LAUNCH_VZ :
 * on atténue vx, on clampe vz à FLIPPER_MIN_LAUNCH_VZ, on garde vy → lancement
 * garanti vers le haut du tapis.
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
