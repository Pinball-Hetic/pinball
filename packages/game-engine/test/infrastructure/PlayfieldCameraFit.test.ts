import { test, expect, describe } from 'bun:test';
import * as THREE from 'three';
import {
  PLAYFIELD_VIEW_DIR,
  PLAYFIELD_PORTRAIT_VIEW_DIR,
  PLAYFIELD_PORTRAIT_CAMERA_UP,
  PLAYFIELD_PORTRAIT_HALF_WIDTH,
  PLAYFIELD_ORTHO_EYE_LIFT,
  fillPlayfieldBoxCorners,
  fillPlayfieldTopDownCorners,
  fillPlayfieldWallFootprintCorners,
  boundingBoxPlayfieldWallFootprint,
  portraitOrthoHalfWidth,
  applyPlayfieldCamera,
  applyPlayfieldOrthoTopDown,
  playfieldViewDirForMode,
  playfieldCameraUpForMode,
  playfieldCameraTargetForMode,
} from '../../src/infrastructure/PlayfieldCameraFit';
import {
  WALL_LEFT_X,
  WALL_RIGHT_X,
  WALL_TOP_Z,
  WALL_BOTTOM_Z,
} from '../../src/domain/Ball';
import { surfaceYAtZ } from '../../src/domain/PlayfieldGeometry';

describe('PlayfieldCameraFit — constantes de direction', () => {
  test('les vecteurs de vue sont normalisés', () => {
    expect(PLAYFIELD_VIEW_DIR.length()).toBeCloseTo(1, 6);
    expect(PLAYFIELD_PORTRAIT_VIEW_DIR.length()).toBeCloseTo(1, 6);
  });

  test('le up portrait pointe vers -Z (vue de dessus inclinée)', () => {
    expect(PLAYFIELD_PORTRAIT_CAMERA_UP.x).toBe(0);
    expect(PLAYFIELD_PORTRAIT_CAMERA_UP.y).toBe(0);
    expect(PLAYFIELD_PORTRAIT_CAMERA_UP.z).toBe(-1);
  });

  test('demi-largeur portrait = (droite - gauche)/2', () => {
    expect(PLAYFIELD_PORTRAIT_HALF_WIDTH).toBeCloseTo((WALL_RIGHT_X - WALL_LEFT_X) * 0.5, 6);
  });
});

describe('fillPlayfieldBoxCorners', () => {
  test('produit les 8 coins de la boîte et réutilise le tableau', () => {
    const box = new THREE.Box3(
      new THREE.Vector3(-1, -2, -3),
      new THREE.Vector3(1, 2, 3),
    );
    const reuse: THREE.Vector3[] = [{ junk: true } as unknown as THREE.Vector3];
    const corners = fillPlayfieldBoxCorners(box, reuse);
    expect(corners).toBe(reuse); // same reference (reused)
    expect(corners).toHaveLength(8);
    // each component must belong to min/max on its axis
    for (const c of corners) {
      expect([-1, 1]).toContain(c.x);
      expect([-2, 2]).toContain(c.y);
      expect([-3, 3]).toContain(c.z);
    }
    // uniqueness of the 8 corners
    const keys = new Set(corners.map((c) => `${c.x},${c.y},${c.z}`));
    expect(keys.size).toBe(8);
  });
});

describe('fillPlayfieldTopDownCorners', () => {
  test('produit 4 coins XZ à la hauteur médiane', () => {
    const box = new THREE.Box3(
      new THREE.Vector3(-1, 0, -3),
      new THREE.Vector3(1, 4, 3),
    );
    const corners = fillPlayfieldTopDownCorners(box, []);
    expect(corners).toHaveLength(4);
    for (const c of corners) {
      expect(c.y).toBeCloseTo(2, 6); // (0 + 4)/2
      expect([-1, 1]).toContain(c.x);
      expect([-3, 3]).toContain(c.z);
    }
  });
});

describe('boundingBoxPlayfieldWallFootprint', () => {
  test('englobe les 4 coins du mur posés sur la surface', () => {
    const box = boundingBoxPlayfieldWallFootprint();
    expect(box.min.x).toBeCloseTo(WALL_LEFT_X, 6);
    expect(box.max.x).toBeCloseTo(WALL_RIGHT_X, 6);
    expect(box.min.z).toBeCloseTo(WALL_TOP_Z, 6);
    expect(box.max.z).toBeCloseTo(WALL_BOTTOM_Z, 6);
    // Y bounded by the surface at both Z ends
    const ys = [surfaceYAtZ(WALL_TOP_Z), surfaceYAtZ(WALL_BOTTOM_Z)];
    expect(box.min.y).toBeCloseTo(Math.min(...ys), 6);
    expect(box.max.y).toBeCloseTo(Math.max(...ys), 6);
  });

  test('padXZ élargit la boîte sur X et Z uniquement', () => {
    const base = boundingBoxPlayfieldWallFootprint(0);
    const padded = boundingBoxPlayfieldWallFootprint(0.05);
    expect(padded.min.x).toBeCloseTo(base.min.x - 0.05, 6);
    expect(padded.max.x).toBeCloseTo(base.max.x + 0.05, 6);
    expect(padded.min.z).toBeCloseTo(base.min.z - 0.05, 6);
    expect(padded.max.z).toBeCloseTo(base.max.z + 0.05, 6);
    // Y unchanged
    expect(padded.min.y).toBeCloseTo(base.min.y, 6);
    expect(padded.max.y).toBeCloseTo(base.max.y, 6);
  });

  test('padXZ négatif ou nul ne modifie pas la boîte', () => {
    const base = boundingBoxPlayfieldWallFootprint(0);
    const neg = boundingBoxPlayfieldWallFootprint(-1);
    expect(neg.min.x).toBeCloseTo(base.min.x, 6);
    expect(neg.max.x).toBeCloseTo(base.max.x, 6);
  });
});

describe('fillPlayfieldWallFootprintCorners', () => {
  test('produit 4 coins ancrés à la surface', () => {
    const corners = fillPlayfieldWallFootprintCorners([]);
    expect(corners).toHaveLength(4);
    for (const c of corners) {
      expect([WALL_LEFT_X, WALL_RIGHT_X]).toContain(c.x);
      expect([WALL_TOP_Z, WALL_BOTTOM_Z]).toContain(c.z);
      expect(c.y).toBeCloseTo(surfaceYAtZ(c.z), 6);
    }
  });
});

describe('portraitOrthoHalfWidth', () => {
  test('échelle par défaut applique le scale portrait (> dimension brute)', () => {
    const hw = portraitOrthoHalfWidth(1);
    // with ndc=1 and aspect=1: max(halfWidth, halfDepth) * 1.08
    const halfDepth = (WALL_BOTTOM_Z - WALL_TOP_Z) * 0.5;
    const expected = Math.max(PLAYFIELD_PORTRAIT_HALF_WIDTH, halfDepth) * 1.08;
    expect(hw).toBeCloseTo(expected, 6);
  });

  test('aspect plus large augmente la composante hauteur', () => {
    const narrow = portraitOrthoHalfWidth(1);
    const wide = portraitOrthoHalfWidth(3);
    expect(wide).toBeGreaterThan(narrow);
  });

  test('debugTuning override ndc/scale', () => {
    const tuned = portraitOrthoHalfWidth(1, {
      portraitNdcX: 2,
      portraitNdcY: 2,
      distanceScale: 1,
      dirY: 0.98,
      dirZ: 0.15,
      lookYBias: 0,
      lookZBias: 0,
    });
    // ndc=2 halves it, scale=1 → < default
    expect(tuned).toBeLessThan(portraitOrthoHalfWidth(1));
  });

  test('aspect minuscule est borné (pas de NaN/Infinity)', () => {
    const hw = portraitOrthoHalfWidth(0);
    expect(Number.isFinite(hw)).toBe(true);
  });
});

describe('applyPlayfieldCamera', () => {
  test('positionne la caméra à distance le long de dirToCamera et regarde la cible', () => {
    const cam = new THREE.PerspectiveCamera();
    const target = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3(0, 0, 1);
    applyPlayfieldCamera(cam, target, dir, 5, new THREE.Vector3(0, 1, 0));
    expect(cam.position.x).toBeCloseTo(0, 6);
    expect(cam.position.y).toBeCloseTo(1, 6);
    expect(cam.position.z).toBeCloseTo(5, 6);
    expect(cam.up.z).toBeCloseTo(0, 6);
  });
});

describe('applyPlayfieldOrthoTopDown', () => {
  test('configure le frustum ortho et survole la cible', () => {
    const cam = new THREE.OrthographicCamera();
    const target = new THREE.Vector3(0.5, 1, -0.3);
    applyPlayfieldOrthoTopDown(cam, target, 2, 4, PLAYFIELD_PORTRAIT_CAMERA_UP);
    expect(cam.left).toBeCloseTo(-4, 6);
    expect(cam.right).toBeCloseTo(4, 6);
    expect(cam.top).toBeCloseTo(2, 6); // halfWidth/aspect = 4/2
    expect(cam.bottom).toBeCloseTo(-2, 6);
    expect(cam.position.y).toBeCloseTo(1 + PLAYFIELD_ORTHO_EYE_LIFT, 6);
    expect(cam.position.x).toBeCloseTo(0.5, 6);
    expect(cam.position.z).toBeCloseTo(-0.3, 6);
  });

  test('aspect < 1 conserve une hauteur finie (clamp anti-division)', () => {
    const cam = new THREE.OrthographicCamera();
    applyPlayfieldOrthoTopDown(cam, new THREE.Vector3(), 0, 4, PLAYFIELD_PORTRAIT_CAMERA_UP);
    expect(Number.isFinite(cam.top)).toBe(true);
  });
});

describe('stratégies par mode de vue', () => {
  test('legacy : viewDir = constante inclinée, up = +Y', () => {
    const dir = playfieldViewDirForMode('legacy');
    expect(dir.length()).toBeCloseTo(1, 6);
    expect(dir.equals(PLAYFIELD_VIEW_DIR)).toBe(true);
    const up = playfieldCameraUpForMode('legacy');
    expect(up.y).toBe(1);
  });

  test('portrait-fill : up = -Z', () => {
    const up = playfieldCameraUpForMode('portrait-fill');
    expect(up.z).toBe(-1);
  });

  test('viewDirForMode renvoie un vecteur frais (pas la constante partagée)', () => {
    const d1 = playfieldViewDirForMode('legacy');
    const d2 = playfieldViewDirForMode('legacy');
    expect(d1).not.toBe(d2);
    expect(d1).not.toBe(PLAYFIELD_VIEW_DIR);
  });

  test('cameraUpForMode renvoie un vecteur frais — muter le retour ne corrompt pas la constante', () => {
    const up1 = playfieldCameraUpForMode('portrait-fill');
    const up2 = playfieldCameraUpForMode('portrait-fill');
    expect(up1).not.toBe(up2);
    expect(up1).not.toBe(PLAYFIELD_PORTRAIT_CAMERA_UP);
    // Mutating the return must not touch the shared constant.
    up1.set(9, 9, 9).normalize();
    expect(PLAYFIELD_PORTRAIT_CAMERA_UP.z).toBe(-1);
    expect(playfieldCameraUpForMode('portrait-fill').z).toBe(-1);
  });

  test('legacy target = centre de la boîte de cadrage', () => {
    const box = new THREE.Box3(
      new THREE.Vector3(-1, 0, -2),
      new THREE.Vector3(1, 2, 2),
    );
    const out = new THREE.Vector3();
    playfieldCameraTargetForMode('legacy', box, out);
    expect(out.x).toBeCloseTo(0, 6);
    expect(out.y).toBeCloseTo(1, 6);
    expect(out.z).toBeCloseTo(0, 6);
  });

  test('portrait target : XZ centré, Y posé sur la surface', () => {
    const box = new THREE.Box3(
      new THREE.Vector3(-0.2, 0.9, -0.4),
      new THREE.Vector3(0.2, 1.1, 0.2),
    );
    const out = new THREE.Vector3();
    playfieldCameraTargetForMode('portrait-fill', box, out);
    expect(out.x).toBeCloseTo(0, 6);
    const midZ = (-0.4 + 0.2) * 0.5;
    expect(out.z).toBeCloseTo(midZ, 6);
    expect(out.y).toBeCloseTo(surfaceYAtZ(midZ), 6);
  });
});
