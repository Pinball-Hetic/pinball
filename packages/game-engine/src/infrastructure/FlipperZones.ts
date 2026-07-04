import * as THREE from 'three';

export type FlipperZone = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
};
export type FlipperZones = { left: FlipperZone; right: FlipperZone };

/**
 * Toggle for the zone-derivation log. On by default (a single `console.info`
 * at load). The cabinet can turn it off in prod via
 * `setFlipperZonesLogging(false)` to avoid console noise.
 */
let flipperZonesLogging = true;

export function setFlipperZonesLogging(enabled: boolean): void {
  flipperZonesLogging = enabled;
}

/**
 * Derives the flip-guarantee zones from the real bbox of the flipper meshes
 * (rest pose, BEFORE the simulation starts). Avoids frozen X coordinates
 * measured on an old GLB.
 *
 * `margin` expands the bbox on X/Z: the ball counts as touching as soon as
 * its center is within one radius of the edge (margin = BALL_RADIUS).
 */
export function computeFlipperZones(
  left: THREE.Object3D,
  right: THREE.Object3D,
  margin: number,
): FlipperZones {
  const zoneOf = (obj: THREE.Object3D): FlipperZone => {
    obj.updateMatrixWorld(true);
    const { min, max } = new THREE.Box3().setFromObject(obj);
    return {
      xMin: min.x - margin,
      xMax: max.x + margin,
      yMin: min.y - margin,
      yMax: max.y + margin,
      zMin: min.z - margin,
      zMax: max.z + margin,
    };
  };

  const zones = { left: zoneOf(left), right: zoneOf(right) };
  if (flipperZonesLogging) console.info('[FlipperZones]', zones);
  return zones;
}
