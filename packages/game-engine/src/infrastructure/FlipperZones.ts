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

let flipperZonesLogging = true;

export function setFlipperZonesLogging(enabled: boolean): void {
  flipperZonesLogging = enabled;
}

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
