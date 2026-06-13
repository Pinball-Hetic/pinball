import * as THREE from 'three';
import {
  PLAYFIELD_SURFACE_Y,
  WALL_BOTTOM_Z,
  WALL_LEFT_X,
  WALL_RIGHT_X,
  WALL_TOP_Z,
} from '../domain/Ball';
import { findObjectByNormalizedName } from './GltfNodeNames';
import type { PlayfieldViewMode } from '../domain/PlayfieldViewMode';
import { DEFAULT_PLAYFIELD_VIEW_MODE } from '../domain/PlayfieldViewMode';

export const PLAYFIELD_VIEW_DIR = new THREE.Vector3(0, 0.48, 0.88).normalize();
export const PLAYFIELD_VIEW_NDC_MARGIN = 0.78;
export const PLAYFIELD_CAM_DISTANCE_SCALE = 1.05;
export const PLAYFIELD_PORTRAIT_NDC_X = 1;

const _clipMatrix = new THREE.Matrix4();
const _ndcPoint = new THREE.Vector4();
const _camPosScratch = new THREE.Vector3();

export type PlayfieldCamFit = {
  target: THREE.Vector3;
  dirToCamera: THREE.Vector3;
  corners: THREE.Vector3[];
};

export type PlayfieldCameraFitOptions = {
  viewMode?: PlayfieldViewMode;
};

export function fillPlayfieldBoxCorners(box: THREE.Box3, reuse: THREE.Vector3[]): THREE.Vector3[] {
  reuse.length = 0;
  const { min, max } = box;
  for (const x of [min.x, max.x] as const) {
    for (const y of [min.y, max.y] as const) {
      for (const z of [min.z, max.z] as const) {
        reuse.push(new THREE.Vector3(x, y, z));
      }
    }
  }
  return reuse;
}

function withCameraAt(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  camPos: THREE.Vector3,
): THREE.Matrix4 {
  camera.up.set(0, 1, 0);
  camera.position.copy(camPos);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return _clipMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
}

function playfieldCornersInView(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  camPos: THREE.Vector3,
  corners: readonly THREE.Vector3[],
  ndcMargin: number,
): boolean {
  const clip = withCameraAt(camera, target, camPos);
  for (const c of corners) {
    _ndcPoint.set(c.x, c.y, c.z, 1).applyMatrix4(clip);
    const w = Math.abs(_ndcPoint.w);
    if (w < 1e-7) return false;
    const nx = _ndcPoint.x / w;
    const ny = _ndcPoint.y / w;
    if (Math.abs(nx) > ndcMargin || Math.abs(ny) > ndcMargin) return false;
  }
  return true;
}

function playfieldNdcXWithinLimit(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  camPos: THREE.Vector3,
  corners: readonly THREE.Vector3[],
  ndcXLimit: number,
): boolean {
  const clip = withCameraAt(camera, target, camPos);
  for (const c of corners) {
    _ndcPoint.set(c.x, c.y, c.z, 1).applyMatrix4(clip);
    const w = Math.abs(_ndcPoint.w);
    if (w < 1e-7) return false;
    if (Math.abs(_ndcPoint.x / w) > ndcXLimit) return false;
  }
  return true;
}

function distanceForCameraFit(
  camera: THREE.PerspectiveCamera,
  fit: PlayfieldCamFit,
  fitsAtDistance: (camPos: THREE.Vector3) => boolean,
): number {
  const { target: mc, dirToCamera } = fit;
  const pos = _camPosScratch;
  let lo = 0.04;
  let hi = 0.6;
  while (!fitsAtDistance(pos.copy(mc).addScaledVector(dirToCamera, hi)) && hi < 240) {
    hi *= 1.75;
  }
  if (!fitsAtDistance(pos.copy(mc).addScaledVector(dirToCamera, hi))) {
    return hi;
  }
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    pos.copy(mc).addScaledVector(dirToCamera, mid);
    if (fitsAtDistance(pos)) hi = mid;
    else lo = mid;
  }
  return hi;
}

function distanceForPortraitWidthFirstView(
  camera: THREE.PerspectiveCamera,
  fit: PlayfieldCamFit,
  ndcXLimit: number,
): number {
  const { target, corners } = fit;
  return distanceForCameraFit(camera, fit, (camPos) =>
    playfieldNdcXWithinLimit(camera, target, camPos, corners, ndcXLimit),
  );
}

function distanceForTiltedPlayfieldView(
  camera: THREE.PerspectiveCamera,
  fit: PlayfieldCamFit,
  ndcMargin: number,
): number {
  const { target, corners } = fit;
  return distanceForCameraFit(camera, fit, (camPos) =>
    playfieldCornersInView(camera, target, camPos, corners, ndcMargin),
  );
}

export function applyPlayfieldCamera(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  dirToCamera: THREE.Vector3,
  distance: number,
): void {
  camera.up.set(0, 1, 0);
  camera.position.copy(target).addScaledVector(dirToCamera, distance);
  camera.lookAt(target);
}

export function boundingBoxPlayfieldSurface(playfieldRoot: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const named =
    findObjectByNormalizedName(
      playfieldRoot,
      'playfield',
      'pf_playfield',
      'coll_playfield',
    ) ?? null;
  const sides =
    findObjectByNormalizedName(
      playfieldRoot,
      'playfield_sides',
      'pf_playfield_sides',
    ) ?? null;
  if (named) {
    named.updateMatrixWorld(true);
    box.setFromObject(named);
    if (sides) {
      sides.updateMatrixWorld(true);
      box.union(new THREE.Box3().setFromObject(sides));
    }
  }
  if (!box.isEmpty()) {
    box.expandByScalar(0.006);
    return box;
  }

  const tmp = new THREE.Box3();
  let first = true;
  const skipName = (n: string) =>
    /backglass|backbox|cabinet|score.?board|coin|feet|foot|glass|launcher|plunger.?panel|epoxy|upright|stand|skirt|lockbar|siderail|caisse|vitre|button|monnayeur|start.?button/i.test(
      n,
    );
  playfieldRoot.updateMatrixWorld(true);
  playfieldRoot.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const n = child.name.toLowerCase();
    if (skipName(n)) return;
    if (
      n.includes('playfield') ||
      n.includes('plastic') ||
      n.includes('bumper') ||
      n.includes('pop_') ||
      n.includes('flipper') ||
      n.includes('separator') ||
      n.includes('sling') ||
      n.includes('target') ||
      n.includes('guide') ||
      n.includes('rail') ||
      n.includes('rocket') ||
      n.startsWith('coll_') ||
      n.startsWith('pf_')
    ) {
      tmp.setFromObject(child);
      if (first) {
        box.copy(tmp);
        first = false;
      } else {
        box.union(tmp);
      }
    }
  });
  if (first) {
    box.setFromObject(playfieldRoot);
  }
  box.expandByScalar(0.008);
  return box;
}

export function boundingBoxPlayableArea(playfieldRoot: THREE.Object3D): THREE.Box3 {
  const wallBox = new THREE.Box3(
    new THREE.Vector3(WALL_LEFT_X - 0.012, PLAYFIELD_SURFACE_Y - 0.04, WALL_TOP_Z - 0.02),
    new THREE.Vector3(WALL_RIGHT_X + 0.012, PLAYFIELD_SURFACE_Y + 0.1, WALL_BOTTOM_Z + 0.02),
  );
  const meshBox = boundingBoxPlayfieldSurface(playfieldRoot);
  if (meshBox.isEmpty()) return wallBox;
  return meshBox.union(wallBox);
}

export function fitPlayfieldCamera(
  camera: THREE.PerspectiveCamera,
  fit: PlayfieldCamFit,
  target: THREE.Vector3,
  options?: PlayfieldCameraFitOptions,
): number {
  return fitPlayfieldCameraForMode(
    options?.viewMode ?? DEFAULT_PLAYFIELD_VIEW_MODE,
    camera,
    fit,
    target,
  );
}

function fitPlayfieldCameraForMode(
  viewMode: PlayfieldViewMode,
  camera: THREE.PerspectiveCamera,
  fit: PlayfieldCamFit,
  target: THREE.Vector3,
): number {
  switch (viewMode) {
    case 'portrait-fill':
      return fitPlayfieldCameraPortraitWidth(camera, fit, target);
    case 'legacy':
      return fitPlayfieldCameraLegacy(camera, fit, target);
  }
}

function fitPlayfieldCameraPortraitWidth(
  camera: THREE.PerspectiveCamera,
  fit: PlayfieldCamFit,
  target: THREE.Vector3,
): number {
  const dist = distanceForPortraitWidthFirstView(camera, fit, PLAYFIELD_PORTRAIT_NDC_X);
  applyPlayfieldCamera(camera, target, fit.dirToCamera, dist);
  return dist;
}

function fitPlayfieldCameraLegacy(
  camera: THREE.PerspectiveCamera,
  fit: PlayfieldCamFit,
  target: THREE.Vector3,
): number {
  const dist =
    distanceForTiltedPlayfieldView(camera, fit, PLAYFIELD_VIEW_NDC_MARGIN) *
    PLAYFIELD_CAM_DISTANCE_SCALE;
  applyPlayfieldCamera(camera, target, fit.dirToCamera, dist);
  return dist;
}
