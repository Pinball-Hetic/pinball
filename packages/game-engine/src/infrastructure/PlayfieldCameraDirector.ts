import * as THREE from 'three';
import type { BossDefinition, BossId } from '../domain/BossRegistry';
import { getBossById } from '../domain/BossRegistry';
import {
  cinematicZoomDistance,
  type BossCameraCinematicConfig,
} from '../domain/CameraCinematicConstants';
import type { PlayfieldViewMode } from '../domain/PlayfieldViewMode';
import { DEFAULT_PLAYFIELD_VIEW_MODE } from '../domain/PlayfieldViewMode';
import { CinematicPhaseMachine } from './CinematicPhaseMachine';
import { applyPlayfieldOrthoTopDown } from './PlayfieldCameraFit';

type BaseView = {
  target: THREE.Vector3;
  dirToCamera: THREE.Vector3;
  cameraUp: THREE.Vector3;
  distance: number;
  aspect: number;
};

export type PlayfieldCameraCapture = {
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  target: THREE.Vector3;
  dirToCamera: THREE.Vector3;
  cameraUp: THREE.Vector3;
  distance: number;
  aspect: number;
};

export class PlayfieldCameraDirector {
  private bosses: BossDefinition[] = [];
  private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null = null;
  private base: BaseView | null = null;
  private config: BossCameraCinematicConfig | null = null;
  private viewMode: PlayfieldViewMode = DEFAULT_PLAYFIELD_VIEW_MODE;
  private readonly machine = new CinematicPhaseMachine();
  private zoomedDistance = 0;
  private faceDir: THREE.Vector3 | null = null;
  private readonly lookAt = new THREE.Vector3();
  private readonly panFrom = new THREE.Vector3();
  private readonly bossFocus = new THREE.Vector3();
  private readonly dirScratch = new THREE.Vector3();

  setBosses(bosses: BossDefinition[]): void {
    this.bosses = bosses;
  }

  setViewMode(viewMode: PlayfieldViewMode): void {
    this.viewMode = viewMode;
  }

  captureBase(capture: PlayfieldCameraCapture): void {
    this.camera = capture.camera;
    this.base = {
      target: capture.target.clone(),
      dirToCamera: capture.dirToCamera.clone().normalize(),
      cameraUp: capture.cameraUp.clone(),
      distance: capture.distance,
      aspect: capture.aspect,
    };
    this.applyView(this.base.target, this.base.distance);
  }

  isActive(): boolean {
    return this.machine.isActive();
  }

  play(bossId: BossId): void {
    this.begin(bossId, 'reveal');
  }

  playVictory(bossId: BossId): void {
    this.begin(bossId, 'victory');
  }

  update(dt: number): void {
    if (!this.camera || !this.base || !this.config || !this.machine.isActive()) return;
    const tick = this.machine.tick(dt, this.config);
    if (tick.phase === 'zoomIn') {
      this.lookAt.lerpVectors(this.panFrom, this.bossFocus, tick.blend.lookAtT);
      const dist = THREE.MathUtils.lerp(this.base.distance, this.zoomedDistance, tick.blend.distanceT);
      this.applyView(this.lookAt, dist, this.lerpViewDir(tick.blend.dirT));
      return;
    }
    if (tick.phase === 'hold') {
      this.applyView(this.bossFocus, this.zoomedDistance, this.faceDir ?? undefined);
      return;
    }
    this.lookAt.lerpVectors(this.bossFocus, this.base.target, tick.blend.lookAtT);
    const dist = THREE.MathUtils.lerp(this.zoomedDistance, this.base.distance, tick.blend.distanceT);
    this.applyView(this.lookAt, dist, this.lerpViewDir(tick.blend.dirT));
    if (tick.done) this.finish();
  }

  restore(): void {
    if (!this.base) {
      this.resetState();
      return;
    }
    this.applyView(this.base.target, this.base.distance);
    this.resetState();
  }

  dispose(): void {
    this.restore();
    this.camera = null;
    this.base = null;
  }

  private begin(bossId: BossId, kind: 'reveal' | 'victory'): void {
    if (!this.camera || !this.base || this.machine.isActive()) return;
    const def = getBossById(this.bosses, bossId);
    if (!def) return;
    const cinematic = kind === 'reveal' ? def.cameraCinematic : def.victoryCameraCinematic;
    this.config = cinematic;
    this.bossFocus.set(def.target.x, def.target.y + cinematic.lookAtLift, def.target.z);
    this.resolvePanFrom(cinematic, kind);
    this.zoomedDistance = cinematicZoomDistance(this.base.distance, cinematic.distanceScale, this.viewMode === 'portrait-fill');
    this.resolveFaceDir(cinematic);
    this.machine.start();
  }

  private resolvePanFrom(cinematic: BossCameraCinematicConfig, kind: 'reveal' | 'victory'): void {
    if (kind === 'reveal' && cinematic.panFrom) {
      this.panFrom.set(
        cinematic.panFrom.x,
        cinematic.panFrom.y + cinematic.lookAtLift,
        cinematic.panFrom.z,
      );
    } else {
      this.panFrom.copy(this.base!.target);
    }
  }

  private resolveFaceDir(cinematic: BossCameraCinematicConfig): void {
    if (cinematic.faceDirToCamera) {
      this.faceDir = new THREE.Vector3(
        cinematic.faceDirToCamera.x,
        cinematic.faceDirToCamera.y,
        cinematic.faceDirToCamera.z,
      ).normalize();
    } else {
      this.faceDir = null;
    }
  }

  private finish(): void {
    if (this.base) {
      this.applyView(this.base.target, this.base.distance);
    }
    this.resetState();
  }

  private resetState(): void {
    this.machine.reset();
    this.config = null;
    this.faceDir = null;
  }

  private lerpViewDir(t: number): THREE.Vector3 | undefined {
    if (!this.base || !this.faceDir || t <= 0) return undefined;
    if (t >= 1) return this.dirScratch.copy(this.faceDir);
    return this.dirScratch.copy(this.base.dirToCamera).lerp(this.faceDir, t).normalize();
  }

  private applyView(
    lookAt: THREE.Vector3,
    distance: number,
    dirToCamera?: THREE.Vector3,
  ): void {
    if (!this.camera || !this.base) return;
    const dir = dirToCamera ?? this.base.dirToCamera;
    if (this.camera instanceof THREE.OrthographicCamera) {
      applyPlayfieldOrthoTopDown(
        this.camera,
        lookAt,
        this.base.aspect,
        distance,
        this.base.cameraUp,
      );
      return;
    }
    this.camera.up.copy(this.base.cameraUp);
    this.camera.position.copy(lookAt).addScaledVector(dir, distance);
    this.camera.lookAt(lookAt);
  }
}
