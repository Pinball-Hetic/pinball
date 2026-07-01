import { test, expect, describe, spyOn, beforeEach, afterEach } from 'bun:test';
import * as THREE from 'three';
import { computeFlipperZones, setFlipperZonesLogging } from './FlipperZones';

// Construit un mesh boîte centré sur `center`, de demi-dimensions `half`.
// La bbox monde résultante est [center - half, center + half] sur chaque axe.
function boxAt(center: { x: number; y: number; z: number }, half = 0.05): THREE.Mesh {
  const geom = new THREE.BoxGeometry(half * 2, half * 2, half * 2);
  const mesh = new THREE.Mesh(geom);
  mesh.position.set(center.x, center.y, center.z);
  return mesh;
}

describe('computeFlipperZones', () => {
  let infoSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Tait le console.info pour garder la sortie de test propre.
    infoSpy = spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  test('dérive la zone depuis la bbox monde du mesh, sans marge', () => {
    const left = boxAt({ x: -0.2, y: 1, z: 0.3 }, 0.05);
    const right = boxAt({ x: 0.2, y: 1, z: 0.3 }, 0.05);

    const zones = computeFlipperZones(left, right, 0);

    expect(zones.left.xMin).toBeCloseTo(-0.25, 6);
    expect(zones.left.xMax).toBeCloseTo(-0.15, 6);
    expect(zones.left.zMin).toBeCloseTo(0.25, 6);
    expect(zones.left.zMax).toBeCloseTo(0.35, 6);

    expect(zones.right.xMin).toBeCloseTo(0.15, 6);
    expect(zones.right.xMax).toBeCloseTo(0.25, 6);
  });

  test('dérive une borne Y depuis la bbox monde du mesh (regression #3)', () => {
    // Flipper centré en y=1, demi-hauteur 0.05 → bbox Y [0.95, 1.05].
    const left = boxAt({ x: -0.2, y: 1, z: 0.3 }, 0.05);
    const right = boxAt({ x: 0.2, y: 1, z: 0.3 }, 0.05);

    const zones = computeFlipperZones(left, right, 0);

    expect(zones.left.yMin).toBeCloseTo(0.95, 6);
    expect(zones.left.yMax).toBeCloseTo(1.05, 6);
    expect(zones.right.yMin).toBeCloseTo(0.95, 6);
    expect(zones.right.yMax).toBeCloseTo(1.05, 6);

    // Une balle nettement au-dessus/en-dessous du plan du flipper est hors zone.
    const aboveByBallCenter = 2;
    const belowByBallCenter = 0;
    expect(aboveByBallCenter <= zones.left.yMax).toBe(false);
    expect(belowByBallCenter >= zones.left.yMin).toBe(false);
  });

  test('la marge étend aussi la borne Y', () => {
    const left = boxAt({ x: 0, y: 0.5, z: 0 }, 0.1);
    const right = boxAt({ x: 1, y: 0.5, z: 0 }, 0.1);
    const margin = 0.02;

    const zones = computeFlipperZones(left, right, margin);

    // bbox Y brute = [0.4, 0.6] ; +/- margin → [0.38, 0.62]
    expect(zones.left.yMin).toBeCloseTo(0.38, 6);
    expect(zones.left.yMax).toBeCloseTo(0.62, 6);
  });

  test('la marge étend la bbox symétriquement sur X et Z', () => {
    const left = boxAt({ x: 0, y: 0, z: 0 }, 0.1);
    const right = boxAt({ x: 1, y: 0, z: 0 }, 0.1);
    const margin = 0.02;

    const zones = computeFlipperZones(left, right, margin);

    // bbox brute = [-0.1, 0.1] ; +/- margin → [-0.12, 0.12]
    expect(zones.left.xMin).toBeCloseTo(-0.12, 6);
    expect(zones.left.xMax).toBeCloseTo(0.12, 6);
    expect(zones.left.zMin).toBeCloseTo(-0.12, 6);
    expect(zones.left.zMax).toBeCloseTo(0.12, 6);
    // largeur = bbox (0.2) + 2*margin (0.04) = 0.24
    expect(zones.left.xMax - zones.left.xMin).toBeCloseTo(0.24, 6);
  });

  test('prend en compte la transformation monde (position du parent)', () => {
    const parent = new THREE.Group();
    parent.position.set(0.5, 0, -0.3);
    const child = boxAt({ x: 0, y: 0, z: 0 }, 0.05);
    parent.add(child);
    // Propage la transform du parent dans la hiérarchie (sinon la matrice
    // monde du parent reste l'identité et computeFlipperZones ne « voit » pas
    // l'offset, car updateMatrixWorld(child) part de parent.matrixWorld).
    parent.updateMatrixWorld(true);

    const right = boxAt({ x: 2, y: 0, z: 0 }, 0.05);

    const zones = computeFlipperZones(child, right, 0);

    // bbox monde de child = parent.position +/- 0.05
    expect(zones.left.xMin).toBeCloseTo(0.45, 6);
    expect(zones.left.xMax).toBeCloseTo(0.55, 6);
    expect(zones.left.zMin).toBeCloseTo(-0.35, 6);
    expect(zones.left.zMax).toBeCloseTo(-0.25, 6);
  });

  test('left et right sont calculés indépendamment', () => {
    const left = boxAt({ x: -1, y: 0, z: 0 }, 0.05);
    const right = boxAt({ x: 1, y: 0, z: 0 }, 0.05);

    const zones = computeFlipperZones(left, right, 0);

    expect(zones.left.xMax).toBeLessThan(zones.right.xMin);
  });

  test('logge les zones via console.info une seule fois', () => {
    const left = boxAt({ x: 0, y: 0, z: 0 });
    const right = boxAt({ x: 1, y: 0, z: 0 });

    const zones = computeFlipperZones(left, right, 0);

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith('[FlipperZones]', zones);
  });

  test('setFlipperZonesLogging(false) coupe le console.info sans changer le résultat', () => {
    const left = boxAt({ x: 0, y: 0, z: 0 });
    const right = boxAt({ x: 1, y: 0, z: 0 });

    setFlipperZonesLogging(false);
    try {
      const zones = computeFlipperZones(left, right, 0);
      expect(infoSpy).not.toHaveBeenCalled();
      expect(zones.left.xMin).toBeCloseTo(-0.05, 6);
    } finally {
      setFlipperZonesLogging(true);
    }
  });
});
