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
 * Dérive les zones de garantie de lancement depuis la bbox réelle des meshes
 * flippers (pose de repos, AVANT le démarrage de la simulation). Évite les
 * coordonnées X figées mesurées sur un ancien GLB.
 *
 * `margin` étend la bbox sur X/Z : la balle touche dès que son centre est à un
 * rayon du bord (margin = BALL_RADIUS).
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
  console.info('[FlipperZones]', zones);
  return zones;
}
