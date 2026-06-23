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
export const PLAYFIELD_PORTRAIT_DISTANCE_SCALE = 1.08;
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

// ── API publique par mode : 100 % délégation à la table de stratégies ─────────
// Plus aucun switch/if sur le mode ici. Toute la connaissance spécifique à un
// mode vit dans PLAYFIELD_VIEW_MODE_STRATEGIES (défini plus bas). Conséquence :
// ajouter un mode de vue = ajouter UNE entrée dans la table, sans modifier ces
// fonctions ni refit/fit (Open/Closed : ouvert à l'extension, fermé à la modif).

export function playfieldViewDirForMode(viewMode: PlayfieldViewMode): THREE.Vector3 {
  return PLAYFIELD_VIEW_MODE_STRATEGIES[viewMode].viewDir();
}

export function playfieldCameraUpForMode(viewMode: PlayfieldViewMode): THREE.Vector3 {
  return PLAYFIELD_VIEW_MODE_STRATEGIES[viewMode].cameraUp();
}

export function playfieldCameraTargetForMode(
  viewMode: PlayfieldViewMode,
  frameBox: THREE.Box3,
  out: THREE.Vector3,
  debugTuning?: PlayfieldCameraDebugTuning | null,
): THREE.Vector3 {
  return PLAYFIELD_VIEW_MODE_STRATEGIES[viewMode].computeTarget(frameBox, out, debugTuning);
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

// ─────────────────────────────────────────────────────────────────────────────
// STRATÉGIES PAR MODE DE VUE — cœur du respect d'Open/Closed.
//
// Chaque mode de caméra (`legacy`, `portrait-fill`, …) est décrit par UN objet
// qui implémente la même interface. Tout le code générique ci-dessous (fit /
// refit) ne fait que LIRE cette table : il ne connaît aucun nom de mode.
//
// AJOUTER UN MODE = ajouter une entrée dans PLAYFIELD_VIEW_MODE_STRATEGIES.
// Aucune fonction existante n'est modifiée (« fermé à la modification »), et le
// `Record<PlayfieldViewMode, …>` force même TypeScript à exiger l'entrée à la
// compilation. Avant, il fallait éditer 5 endroits (2 switch + 3 if).
// ─────────────────────────────────────────────────────────────────────────────

interface PlayfieldViewModeStrategy {
  /** Direction œil→cible (vecteur frais, normalisé). */
  viewDir(debugTuning?: PlayfieldCameraDebugTuning | null): THREE.Vector3;
  /** Vecteur « up » de la caméra (constante partagée — l'appelant clone si besoin). */
  cameraUp(): THREE.Vector3;
  /** Boîte englobante de cadrage propre au mode. */
  frameBox(playfieldRoot: THREE.Object3D): THREE.Box3;
  /** Calcule le point visé, l'écrit dans `out` et le renvoie. */
  computeTarget(
    frameBox: THREE.Box3,
    out: THREE.Vector3,
    debugTuning?: PlayfieldCameraDebugTuning | null,
  ): THREE.Vector3;
  /** Remplit les coins servant au calcul de distance. */
  fillCorners(frameBox: THREE.Box3, corners: THREE.Vector3[]): void;
  /** Positionne la caméra ; renvoie la distance (perspective) ou half-width (ortho). */
  fit(
    camera: PlayfieldCamera,
    fit: PlayfieldCamFit,
    target: THREE.Vector3,
    aspect: number,
    debugTuning?: PlayfieldCameraDebugTuning | null,
  ): number;
}

// Cible « centre de la boîte » (mode legacy : caméra inclinée classique).
function legacyCameraTarget(frameBox: THREE.Box3, out: THREE.Vector3): THREE.Vector3 {
  return frameBox.getCenter(out);
}

// Cible spécifique au portrait : centre XZ posé sur la surface, avec biais
// optionnels de debug (rapproche le regard de la surface / du bas du cadre).
function portraitCameraTarget(
  frameBox: THREE.Box3,
  out: THREE.Vector3,
  debugTuning?: PlayfieldCameraDebugTuning | null,
): THREE.Vector3 {
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

const PLAYFIELD_VIEW_MODE_STRATEGIES: Record<PlayfieldViewMode, PlayfieldViewModeStrategy> = {
  'portrait-fill': {
    viewDir: (debugTuning) => portraitViewDirFromTuning(debugTuning),
    cameraUp: () => PLAYFIELD_PORTRAIT_CAMERA_UP,
    frameBox: (playfieldRoot) => boundingBoxPortraitFrame(playfieldRoot),
    computeTarget: (frameBox, out, debugTuning) => portraitCameraTarget(frameBox, out, debugTuning),
    fillCorners: (frameBox, corners) => {
      fillPlayfieldFrameFootprintCorners(frameBox, corners);
    },
    fit: (camera, fit, target, aspect, debugTuning) =>
      fitPlayfieldCameraPortraitFill(camera, fit, target, aspect, debugTuning),
  },
  legacy: {
    viewDir: () => PLAYFIELD_VIEW_DIR.clone(),
    cameraUp: () => LEGACY_CAMERA_UP,
    frameBox: (playfieldRoot) => boundingBoxPlayableArea(playfieldRoot),
    computeTarget: (frameBox, out) => legacyCameraTarget(frameBox, out),
    fillCorners: (frameBox, corners) => {
      fillPlayfieldBoxCorners(frameBox, corners);
    },
    fit: (camera, fit, target) => {
      if (!(camera instanceof THREE.PerspectiveCamera)) {
        throw new Error('legacy playfield view requires PerspectiveCamera');
      }
      return fitPlayfieldCameraLegacy(camera, fit, target);
    },
  },
};

export function fitPlayfieldCamera(
  camera: PlayfieldCamera,
  fit: PlayfieldCamFit,
  target: THREE.Vector3,
  options?: PlayfieldCameraFitOptions,
  aspect = 1,
): number {
  const viewMode = options?.viewMode ?? DEFAULT_PLAYFIELD_VIEW_MODE;
  return PLAYFIELD_VIEW_MODE_STRATEGIES[viewMode].fit(
    camera,
    fit,
    target,
    aspect,
    options?.debugTuning,
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
  const strategy = PLAYFIELD_VIEW_MODE_STRATEGIES[viewMode];
  const frameBox = strategy.frameBox(playfieldRoot);
  strategy.computeTarget(frameBox, target, debugTuning);
  strategy.fillCorners(frameBox, corners);
  const fit: PlayfieldCamFit = {
    target,
    dirToCamera: strategy.viewDir(debugTuning),
    cameraUp: strategy.cameraUp().clone(),
    corners,
  };
  const distance = fitPlayfieldCamera(camera, fit, target, { viewMode, debugTuning }, aspect);
  return { fit, distance, frameBox };
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
