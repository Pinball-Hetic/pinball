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
export const PLAYFIELD_PORTRAIT_VIEW_DIR = new THREE.Vector3(0, 0.65, 0.75).normalize();
export const PLAYFIELD_VIEW_NDC_MARGIN = 0.78;
export const PLAYFIELD_CAM_DISTANCE_SCALE = 1.05;
export const PLAYFIELD_PORTRAIT_NDC_X = 1;
export const PLAYFIELD_PORTRAIT_NDC_Y = 1;
export const PLAYFIELD_PORTRAIT_LOOK_Z_BIAS = 0.24;
export const PLAYFIELD_PORTRAIT_LOOK_Y_BIAS = 0.32;

const _clipMatrix = new THREE.Matrix4();
const _ndcPoint = new THREE.Vector4();
const _camPosScratch = new THREE.Vector3();

type NdcAxis = 'x' | 'y';

export type PlayfieldCamFit = {
  target: THREE.Vector3;
  dirToCamera: THREE.Vector3;
  corners: THREE.Vector3[];
};

export type PlayfieldCameraDebugTuning = {
  dirY: number;
  dirZ: number;
  lookYBias: number;
  lookZBias: number;
  portraitNdcX: number;
  portraitNdcY: number;
  distanceScale: number;
};

export const DEFAULT_PLAYFIELD_CAMERA_DEBUG_TUNING: PlayfieldCameraDebugTuning = {
  dirY: 0.65,
  dirZ: 0.75,
  lookYBias: PLAYFIELD_PORTRAIT_LOOK_Y_BIAS,
  lookZBias: PLAYFIELD_PORTRAIT_LOOK_Z_BIAS,
  portraitNdcX: PLAYFIELD_PORTRAIT_NDC_X,
  portraitNdcY: PLAYFIELD_PORTRAIT_NDC_Y,
  distanceScale: 1,
};

export type PlayfieldCameraFitOptions = {
  viewMode?: PlayfieldViewMode;
  debugTuning?: PlayfieldCameraDebugTuning | null;
};

export function playfieldViewDirForMode(viewMode: PlayfieldViewMode): THREE.Vector3 {
  switch (viewMode) {
    case 'portrait-fill':
      return PLAYFIELD_PORTRAIT_VIEW_DIR;
    case 'legacy':
      return PLAYFIELD_VIEW_DIR;
  }
}

export function playfieldCameraTargetForMode(
  viewMode: PlayfieldViewMode,
  frameBox: THREE.Box3,
  out: THREE.Vector3,
  debugTuning?: PlayfieldCameraDebugTuning | null,
): THREE.Vector3 {
  frameBox.getCenter(out);
  if (viewMode !== 'portrait-fill') return out;

  const lookY = debugTuning?.lookYBias ?? PLAYFIELD_PORTRAIT_LOOK_Y_BIAS;
  const lookZ = debugTuning?.lookZBias ?? PLAYFIELD_PORTRAIT_LOOK_Z_BIAS;
  out.y = THREE.MathUtils.lerp(out.y, PLAYFIELD_SURFACE_Y, lookY);
  out.z = THREE.MathUtils.lerp(out.z, frameBox.max.z, lookZ);
  return out;
}

function portraitViewDirFromTuning(debugTuning?: PlayfieldCameraDebugTuning | null): THREE.Vector3 {
  if (!debugTuning) return PLAYFIELD_PORTRAIT_VIEW_DIR.clone();
  const dir = new THREE.Vector3(0, debugTuning.dirY, debugTuning.dirZ);
  if (dir.lengthSq() < 1e-8) return PLAYFIELD_PORTRAIT_VIEW_DIR.clone();
  return dir.normalize();
}

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

function playfieldNdcMaxAbsAxis(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  camPos: THREE.Vector3,
  corners: readonly THREE.Vector3[],
  axis: NdcAxis,
): number {
  const clip = withCameraAt(camera, target, camPos);
  let maxAbs = 0;
  for (const c of corners) {
    _ndcPoint.set(c.x, c.y, c.z, 1).applyMatrix4(clip);
    const w = Math.abs(_ndcPoint.w);
    if (w < 1e-7) continue;
    const v = axis === 'x' ? _ndcPoint.x / w : _ndcPoint.y / w;
    maxAbs = Math.max(maxAbs, Math.abs(v));
  }
  return maxAbs;
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
  return playfieldNdcMaxAbsAxis(camera, target, camPos, corners, 'x') <= ndcXLimit;
}

function playfieldNdcYCoversLimit(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  camPos: THREE.Vector3,
  corners: readonly THREE.Vector3[],
  ndcYLimit: number,
): boolean {
  return playfieldNdcMaxAbsAxis(camera, target, camPos, corners, 'y') >= ndcYLimit;
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

function distanceForCameraCoverWithin(
  camera: THREE.PerspectiveCamera,
  fit: PlayfieldCamFit,
  coversAtDistance: (camPos: THREE.Vector3) => boolean,
  maxDistance: number,
): number {
  const { target: mc, dirToCamera } = fit;
  const pos = _camPosScratch;
  pos.copy(mc).addScaledVector(dirToCamera, maxDistance);
  if (coversAtDistance(pos)) return maxDistance;

  let lo = 0.04;
  while (!coversAtDistance(pos.copy(mc).addScaledVector(dirToCamera, lo)) && lo > 1e-4) {
    lo /= 1.75;
  }
  let hi = maxDistance;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    pos.copy(mc).addScaledVector(dirToCamera, mid);
    if (coversAtDistance(pos)) lo = mid;
    else hi = mid;
  }
  return lo;
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

function distanceForPortraitHeightCoverView(
  camera: THREE.PerspectiveCamera,
  fit: PlayfieldCamFit,
  ndcYLimit: number,
  widthDistance: number,
): number {
  const { target, corners } = fit;
  return distanceForCameraCoverWithin(camera, fit, (camPos) =>
    playfieldNdcYCoversLimit(camera, target, camPos, corners, ndcYLimit),
    widthDistance,
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
    options,
  );
}

export type PlayfieldCameraRefit = {
  fit: PlayfieldCamFit;
  distance: number;
  frameBox: THREE.Box3;
};

export function refitPlayfieldCamera(
  camera: THREE.PerspectiveCamera,
  playfieldRoot: THREE.Object3D,
  viewMode: PlayfieldViewMode,
  target: THREE.Vector3,
  corners: THREE.Vector3[],
  debugTuning?: PlayfieldCameraDebugTuning | null,
): PlayfieldCameraRefit {
  const frameBox = boundingBoxPlayableArea(playfieldRoot);
  playfieldCameraTargetForMode(viewMode, frameBox, target, debugTuning);
  fillPlayfieldBoxCorners(frameBox, corners);
  const dirToCamera =
    viewMode === 'portrait-fill'
      ? portraitViewDirFromTuning(debugTuning)
      : playfieldViewDirForMode(viewMode).clone();
  const fit: PlayfieldCamFit = {
    target,
    dirToCamera,
    corners,
  };
  const distance = fitPlayfieldCamera(camera, fit, target, { viewMode, debugTuning });
  return { fit, distance, frameBox };
}

function fitPlayfieldCameraForMode(
  viewMode: PlayfieldViewMode,
  camera: THREE.PerspectiveCamera,
  fit: PlayfieldCamFit,
  target: THREE.Vector3,
  options?: PlayfieldCameraFitOptions,
): number {
  switch (viewMode) {
    case 'portrait-fill':
      return fitPlayfieldCameraPortraitFill(camera, fit, target, options?.debugTuning);
    case 'legacy':
      return fitPlayfieldCameraLegacy(camera, fit, target);
  }
}

function fitPlayfieldCameraPortraitFill(
  camera: THREE.PerspectiveCamera,
  fit: PlayfieldCamFit,
  target: THREE.Vector3,
  debugTuning?: PlayfieldCameraDebugTuning | null,
): number {
  const ndcX = debugTuning?.portraitNdcX ?? PLAYFIELD_PORTRAIT_NDC_X;
  const ndcY = debugTuning?.portraitNdcY ?? PLAYFIELD_PORTRAIT_NDC_Y;
  const scale = debugTuning?.distanceScale ?? 1;
  const dWidth = distanceForPortraitWidthFirstView(camera, fit, ndcX);
  const dist =
    distanceForPortraitHeightCoverView(camera, fit, ndcY, dWidth) * scale;
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
