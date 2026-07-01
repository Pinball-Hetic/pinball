import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  PlayfieldCameraDirector,
  refitPlayfieldCamera,
  playfieldCameraUpForMode,
  type PlayfieldCamFit,
  type PlayfieldCamera,
  type PlayfieldCameraDebugTuning,
  type PlayfieldViewMode,
} from "@pinball/game-engine";

export interface PlayfieldCameraRigDeps {
  camera: PlayfieldCamera;
  cameraTarget: THREE.Vector3;
  viewMode: PlayfieldViewMode;
  getDebugTuning: () => PlayfieldCameraDebugTuning;
  getViewportSize: () => { width: number; height: number };
}

type CamFitSnapshot = {
  fit: PlayfieldCamFit;
  camera: PlayfieldCamera;
  cameraTarget: THREE.Vector3;
  distance: number;
};

/**
 * Cadrage / recadrage caméra + capture de la base du directeur cinématique.
 *
 * Glue Three.js + directeurs game-engine (aucun import de map). Extrait
 * verbatim de PinballPlayfield : `syncToRoot` reproduit exactement l'ancien
 * `syncPlayfieldCamera` (refit + captureBase), `updateFrame` l'update per-frame
 * orbit/director, `restoreBoss` le `restoreBossCamera`. Le directeur reste
 * exposé via `.director` pour le routeur d'events (play/playVictory/setBosses).
 */
export class PlayfieldCameraRig {
  readonly director = new PlayfieldCameraDirector();
  private orbitControls: OrbitControls | null = null;
  private readonly camCorners: THREE.Vector3[] = [];
  private camFit: CamFitSnapshot | null = null;

  constructor(private readonly deps: PlayfieldCameraRigDeps) {
    this.director.setViewMode(deps.viewMode);
  }

  get orbit(): OrbitControls | null {
    return this.orbitControls;
  }

  private aspect(): number {
    const { width, height } = this.deps.getViewportSize();
    return width / Math.max(height, 1);
  }

  private captureDirectorBase(fit: PlayfieldCamFit, distance: number): void {
    if (this.director.isActive()) this.director.restore();
    this.director.captureBase({
      camera: this.deps.camera,
      target: this.deps.cameraTarget,
      dirToCamera: fit.dirToCamera,
      cameraUp: fit.cameraUp,
      distance,
      aspect: this.aspect(),
    });
  }

  syncToRoot(root: THREE.Object3D): THREE.Box3 {
    const { camera, cameraTarget, viewMode } = this.deps;
    const { fit, distance, frameBox } = refitPlayfieldCamera(
      camera,
      root,
      viewMode,
      cameraTarget,
      this.camCorners,
      this.deps.getDebugTuning(),
      this.aspect(),
    );
    this.camFit = { fit, camera, cameraTarget, distance };
    this.orbitControls?.target.copy(cameraTarget);
    this.captureDirectorBase(fit, distance);
    return frameBox;
  }

  applyNearFar(frameBox: THREE.Box3): void {
    const { camera } = this.deps;
    if (camera instanceof THREE.PerspectiveCamera) {
      const msz = frameBox.getSize(new THREE.Vector3());
      camera.near = Math.max(0.001, Math.min(msz.length() * 0.004, 0.25));
      camera.far = Math.max(80, msz.length() * 120);
      camera.updateProjectionMatrix();
    }
  }

  attachOrbit(domElement: HTMLElement): void {
    const orbit = new OrbitControls(this.deps.camera, domElement);
    orbit.target.copy(this.deps.cameraTarget);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.screenSpacePanning = true;
    orbit.minDistance = 0.05;
    orbit.maxDistance = 5;
    orbit.update();
    this.orbitControls = orbit;
  }

  restoreBoss(): void {
    this.director.restore();
  }

  updateFrame(dt: number, opts: { freeze: boolean; cinematicActive: boolean }): void {
    this.director.update(dt);
    if (this.orbitControls && !opts.freeze && !opts.cinematicActive) {
      this.orbitControls.update();
    }
  }

  /**
   * Fallback de recadrage au resize quand la racine playfield n'est pas encore
   * chargée : réoriente la caméra vers la cible via l'up du mode courant.
   * Verbatim de la branche `else if (playfieldCamFit)` du handleResize.
   */
  applyViewUpFallback(): boolean {
    if (!this.camFit) return false;
    this.deps.camera.up.copy(playfieldCameraUpForMode(this.deps.viewMode));
    this.deps.camera.lookAt(this.deps.cameraTarget);
    return true;
  }

  dispose(): void {
    this.orbitControls?.dispose();
    this.orbitControls = null;
    this.director.dispose();
  }
}
