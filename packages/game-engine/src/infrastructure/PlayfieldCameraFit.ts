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
import { surfaceYAtZ } from '../domain/PlayfieldGeometry';

export const PLAYFIELD_VIEW_DIR = new THREE.Vector3(0, 0.48, 0.88).normalize();
export const PLAYFIELD_PORTRAIT_VIEW_DIR = new THREE.Vector3(0, 0.98, 0.15).normalize();
export const PLAYFIELD_PORTRAIT_CAMERA_UP = new THREE.Vector3(0, 0, -1);
const LEGACY_CAMERA_UP = new THREE.Vector3(0, 1, 0);
export const PLAYFIELD_VIEW_NDC_MARGIN = 0.78;
export const PLAYFIELD_CAM_DISTANCE_SCALE = 1.05;
export const PLAYFIELD_PORTRAIT_NDC_X = 1;
export const PLAYFIELD_PORTRAIT_NDC_Y = 1;
export const PLAYFIELD_PORTRAIT_DISTANCE_SCALE = 1;
export const PLAYFIELD_ORTHO_EYE_LIFT = 2;
export const PLAYFIELD_PORTRAIT_HALF_WIDTH =
  (WALL_RIGHT_X - WALL_LEFT_X) * 0.5;
export const PLAYFIELD_PORTRAIT_LOOK_Z_BIAS = 0;
export const PLAYFIELD_PORTRAIT_LOOK_Y_BIAS = 0;

const _clipMatrix = new THREE.Matrix4();
const _ndcPoint = new THREE.Vector4();
const _camPosScratch = new THREE.Vector3();

type NdcAxis = 'x' | 'y';

export type PlayfieldCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;

export type PlayfieldCamFit = {
  target: THREE.Vector3;
  dirToCamera: THREE.Vector3;
  cameraUp: THREE.Vector3;
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
  dirY: 0.98,
  dirZ: 0.15,
  lookYBias: PLAYFIELD_PORTRAIT_LOOK_Y_BIAS,
  lookZBias: PLAYFIELD_PORTRAIT_LOOK_Z_BIAS,
  portraitNdcX: PLAYFIELD_PORTRAIT_NDC_X,
  portraitNdcY: PLAYFIELD_PORTRAIT_NDC_Y,
  distanceScale: PLAYFIELD_PORTRAIT_DISTANCE_SCALE,
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

export function playfieldCameraUpForMode(viewMode: PlayfieldViewMode): THREE.Vector3 {
  switch (viewMode) {
    case 'portrait-fill':
      return PLAYFIELD_PORTRAIT_CAMERA_UP;
    case 'legacy':
      return LEGACY_CAMERA_UP;
  }
}

export function playfieldCameraTargetForMode(
  viewMode: PlayfieldViewMode,
  frameBox: THREE.Box3,
  out: THREE.Vector3,
  debugTuning?: PlayfieldCameraDebugTuning | null,
): THREE.Vector3 {
  if (viewMode !== 'portrait-fill') {
    frameBox.getCenter(out);
    return out;
  }

  out.x = (frameBox.min.x + frameBox.max.x) * 0.5;
  out.z = (frameBox.min.z + frameBox.max.z) * 0.5;
  out.y = surfaceYAtZ(out.z);

  const lookY = debugTuning?.lookYBias ?? PLAYFIELD_PORTRAIT_LOOK_Y_BIAS;
  const lookZ = debugTuning?.lookZBias ?? PLAYFIELD_PORTRAIT_LOOK_Z_BIAS;
  if (lookY > 0) {
    out.y = THREE.MathUtils.lerp(out.y, PLAYFIELD_SURFACE_Y, lookY);
  }
  if (lookZ > 0) {
    out.z = THREE.MathUtils.lerp(out.z, frameBox.max.z, lookZ);
  }
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

export function fillPlayfieldTopDownCorners(box: THREE.Box3, reuse: THREE.Vector3[]): THREE.Vector3[] {
  reuse.length = 0;
  const { min, max } = box;
  const y = (min.y + max.y) * 0.5;
  for (const x of [min.x, max.x] as const) {
    for (const z of [min.z, max.z] as const) {
      reuse.push(new THREE.Vector3(x, y, z));
    }
  }
  return reuse;
}

export function boundingBoxPlayfieldWallFootprint(padXZ = 0): THREE.Box3 {
  const box = new THREE.Box3();
  for (const x of [WALL_LEFT_X, WALL_RIGHT_X] as const) {
    for (const z of [WALL_TOP_Z, WALL_BOTTOM_Z] as const) {
      box.expandByPoint(new THREE.Vector3(x, surfaceYAtZ(z), z));
    }
  }
  if (padXZ > 0) {
    box.min.x -= padXZ;
    box.max.x += padXZ;
    box.min.z -= padXZ;
    box.max.z += padXZ;
  }
  return box;
}

export function fillPlayfieldWallFootprintCorners(reuse: THREE.Vector3[]): THREE.Vector3[] {
  reuse.length = 0;
  for (const x of [WALL_LEFT_X, WALL_RIGHT_X] as const) {
    for (const z of [WALL_TOP_Z, WALL_BOTTOM_Z] as const) {
      reuse.push(new THREE.Vector3(x, surfaceYAtZ(z), z));
    }
  }
  return reuse;
}

function withCameraAt(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  camPos: THREE.Vector3,
  cameraUp: THREE.Vector3,
): THREE.Matrix4 {
  camera.up.copy(cameraUp);
  camera.position.copy(camPos);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return _clipMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
}

function playfieldNdcMaxAbsAxis(
  camera: THREE.PerspectiveCamera,
  fit: PlayfieldCamFit,
  camPos: THREE.Vector3,
  axis: NdcAxis,
): number {
  const clip = withCameraAt(camera, fit.target, camPos, fit.cameraUp);
  let maxAbs = 0;
  for (const c of fit.corners) {
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
  fit: PlayfieldCamFit,
  camPos: THREE.Vector3,
  ndcMargin: number,
): boolean {
  const clip = withCameraAt(camera, fit.target, camPos, fit.cameraUp);
  for (const c of fit.corners) {
    _ndcPoint.set(c.x, c.y, c.z, 1).applyMatrix4(clip);
    const w = Math.abs(_ndcPoint.w);
    if (w < 1e-7) return false;
    const nx = _ndcPoint.x / w;
    const ny = _ndcPoint.y / w;
    if (Math.abs(nx) > ndcMargin || Math.abs(ny) > ndcMargin) return false;
  }
  return true;
}

function playfieldNdcCoversViewport(
  camera: THREE.PerspectiveCamera,
  fit: PlayfieldCamFit,
  camPos: THREE.Vector3,
  fillX: number,
  fillY: number,
): boolean {
  const maxX = playfieldNdcMaxAbsAxis(camera, fit, camPos, 'x');
  const maxY = playfieldNdcMaxAbsAxis(camera, fit, camPos, 'y');
  return maxX >= fillX && maxY >= fillY;
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

function distanceForPortraitCoverView(
  camera: THREE.PerspectiveCamera,
  fit: PlayfieldCamFit,
  fillX: number,
  fillY: number,
): number {
  const { target: mc, dirToCamera } = fit;
  const pos = _camPosScratch;
  let lo = 0.03;
  let hi = 0.5;

  while (
    !playfieldNdcCoversViewport(camera, fit, pos.copy(mc).addScaledVector(dirToCamera, lo), fillX, fillY) &&
    lo > 0.004
  ) {
    lo *= 0.65;
  }
  while (
    playfieldNdcCoversViewport(camera, fit, pos.copy(mc).addScaledVector(dirToCamera, hi), fillX, fillY) &&
    hi < 80
  ) {
    hi *= 1.6;
  }

  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    pos.copy(mc).addScaledVector(dirToCamera, mid);
    if (playfieldNdcCoversViewport(camera, fit, pos, fillX, fillY)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}

function distanceForTiltedPlayfieldView(
  camera: THREE.PerspectiveCamera,
  fit: PlayfieldCamFit,
  ndcMargin: number,
): number {
  return distanceForCameraFit(camera, fit, (camPos) =>
    playfieldCornersInView(camera, fit, camPos, ndcMargin),
  );
}

export function applyPlayfieldCamera(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  dirToCamera: THREE.Vector3,
  distance: number,
  cameraUp: THREE.Vector3,
): void {
  camera.up.copy(cameraUp);
  camera.position.copy(target).addScaledVector(dirToCamera, distance);
  camera.lookAt(target);
}

export function applyPlayfieldOrthoTopDown(
  camera: THREE.OrthographicCamera,
  target: THREE.Vector3,
  aspect: number,
  halfWidth: number,
  cameraUp: THREE.Vector3,
): void {
  const halfHeight = halfWidth / Math.max(aspect, 1e-6);
  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.up.copy(cameraUp);
  camera.position.set(target.x, target.y + PLAYFIELD_ORTHO_EYE_LIFT, target.z);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}

export function portraitOrthoHalfWidth(
  aspect: number,
  debugTuning?: PlayfieldCameraDebugTuning | null,
): number {
  const ndcX = debugTuning?.portraitNdcX ?? PLAYFIELD_PORTRAIT_NDC_X;
  const ndcY = debugTuning?.portraitNdcY ?? PLAYFIELD_PORTRAIT_NDC_Y;
  const scale = debugTuning?.distanceScale ?? PLAYFIELD_PORTRAIT_DISTANCE_SCALE;
  const ndc = Math.max(Math.min(ndcX, ndcY), 1e-6);
  const halfDepth = (WALL_BOTTOM_Z - WALL_TOP_Z) * 0.5;
  const forWidth = PLAYFIELD_PORTRAIT_HALF_WIDTH / ndc;
  const forHeight = (halfDepth / ndc) * Math.max(aspect, 1e-6);
  return Math.max(forWidth, forHeight) * scale;
}

export function boundingBoxPlayfieldSurface(playfieldRoot: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const named =
    findObjectByNormalizedName(
      playfieldRoot,
      'playfield',
      'floor_main',
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

function fillPlayfieldFrameFootprintCorners(box: THREE.Box3, reuse: THREE.Vector3[]): THREE.Vector3[] {
  reuse.length = 0;
  const { min, max } = box;
  for (const x of [min.x, max.x] as const) {
    for (const z of [min.z, max.z] as const) {
      reuse.push(new THREE.Vector3(x, surfaceYAtZ(z), z));
    }
  }
  return reuse;
}

export function boundingBoxPortraitFrame(playfieldRoot: THREE.Object3D): THREE.Box3 {
  const meshBox = boundingBoxPlayfieldSurface(playfieldRoot);
  if (!meshBox.isEmpty()) {
    const box = meshBox.clone();
    box.min.x -= 0.008;
    box.max.x += 0.008;
    box.min.z -= 0.01;
    box.max.z += 0.01;
    return box;
  }
  return boundingBoxPlayfieldWallFootprint(0.01);
}

export function fitPlayfieldCamera(
  camera: PlayfieldCamera,
  fit: PlayfieldCamFit,
  target: THREE.Vector3,
  options?: PlayfieldCameraFitOptions,
  aspect = 1,
): number {
  return fitPlayfieldCameraForMode(
    options?.viewMode ?? DEFAULT_PLAYFIELD_VIEW_MODE,
    camera,
    fit,
    target,
    options,
    aspect,
  );
}

export type PlayfieldCameraRefit = {
  fit: PlayfieldCamFit;
  distance: number;
  frameBox: THREE.Box3;
};

export function refitPlayfieldCamera(
  camera: PlayfieldCamera,
  playfieldRoot: THREE.Object3D,
  viewMode: PlayfieldViewMode,
  target: THREE.Vector3,
  corners: THREE.Vector3[],
  debugTuning?: PlayfieldCameraDebugTuning | null,
  aspect = 1,
): PlayfieldCameraRefit {
  const frameBox =
    viewMode === 'portrait-fill'
      ? boundingBoxPortraitFrame(playfieldRoot)
      : boundingBoxPlayableArea(playfieldRoot);
  playfieldCameraTargetForMode(viewMode, frameBox, target, debugTuning);
  if (viewMode === 'portrait-fill') {
    fillPlayfieldFrameFootprintCorners(frameBox, corners);
  } else {
    fillPlayfieldBoxCorners(frameBox, corners);
  }
  const dirToCamera =
    viewMode === 'portrait-fill'
      ? portraitViewDirFromTuning(debugTuning)
      : playfieldViewDirForMode(viewMode).clone();
  const fit: PlayfieldCamFit = {
    target,
    dirToCamera,
    cameraUp: playfieldCameraUpForMode(viewMode).clone(),
    corners,
  };
  const distance = fitPlayfieldCamera(camera, fit, target, { viewMode, debugTuning }, aspect);
  return { fit, distance, frameBox };
}

function fitPlayfieldCameraForMode(
  viewMode: PlayfieldViewMode,
  camera: PlayfieldCamera,
  fit: PlayfieldCamFit,
  target: THREE.Vector3,
  options?: PlayfieldCameraFitOptions,
  aspect = 1,
): number {
  switch (viewMode) {
    case 'portrait-fill':
      return fitPlayfieldCameraPortraitFill(camera, fit, target, aspect, options?.debugTuning);
    case 'legacy':
      if (!(camera instanceof THREE.PerspectiveCamera)) {
        throw new Error('legacy playfield view requires PerspectiveCamera');
      }
      return fitPlayfieldCameraLegacy(camera, fit, target);
  }
}

function fitPlayfieldCameraPortraitFill(
  camera: PlayfieldCamera,
  fit: PlayfieldCamFit,
  target: THREE.Vector3,
  aspect: number,
  debugTuning?: PlayfieldCameraDebugTuning | null,
): number {
  if (camera instanceof THREE.OrthographicCamera) {
    const halfWidth = portraitOrthoHalfWidth(aspect, debugTuning);
    applyPlayfieldOrthoTopDown(camera, target, aspect, halfWidth, fit.cameraUp);
    return halfWidth;
  }
  if (!(camera instanceof THREE.PerspectiveCamera)) {
    throw new Error('portrait-fill perspective fallback requires PerspectiveCamera');
  }
  const ndcX = debugTuning?.portraitNdcX ?? PLAYFIELD_PORTRAIT_NDC_X;
  const ndcY = debugTuning?.portraitNdcY ?? PLAYFIELD_PORTRAIT_NDC_Y;
  const scale = debugTuning?.distanceScale ?? PLAYFIELD_PORTRAIT_DISTANCE_SCALE;
  const dist = distanceForPortraitCoverView(camera, fit, ndcX, ndcY) * scale;
  applyPlayfieldCamera(camera, target, fit.dirToCamera, dist, fit.cameraUp);
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
  applyPlayfieldCamera(camera, target, fit.dirToCamera, dist, fit.cameraUp);
  return dist;
}
