import * as THREE from 'three';
import type { BossId } from '../domain/BossRegistry';
import { getBossDefinition } from '../domain/BossRegistry';
import {
  CAMERA_CINEMATIC_DISTANCE_MIN,
  type BossCameraCinematicConfig,
} from '../domain/CameraCinematicConstants';
import { easeIn, easeOut } from './CinematicEasing';

type Phase = 'idle' | 'zoomIn' | 'hold' | 'zoomOut';

type BaseView = {
  target: THREE.Vector3;
  dirToCamera: THREE.Vector3;
  distance: number;
};

export type PlayfieldCameraCapture = {
  camera: THREE.PerspectiveCamera;
  target: THREE.Vector3;
  dirToCamera: THREE.Vector3;
  distance: number;
};

export class PlayfieldCameraDirector {
  private camera: THREE.PerspectiveCamera | null = null;
  private base: BaseView | null = null;
  private config: BossCameraCinematicConfig | null = null;
  private phase: Phase = 'idle';
  private elapsed = 0;
  private zoomedDistance = 0;
  private readonly lookAt = new THREE.Vector3();
  private readonly panFrom = new THREE.Vector3();
  private readonly bossFocus = new THREE.Vector3();

  captureBase(capture: PlayfieldCameraCapture): void {
    this.camera = capture.camera;
    this.base = {
      target: capture.target.clone(),
      dirToCamera: capture.dirToCamera.clone().normalize(),
      distance: capture.distance,
    };
    this.applyView(this.base.target, this.base.distance);
  }

  isActive(): boolean {
    return this.phase !== 'idle';
  }

  play(bossId: BossId): void {
    if (!this.camera || !this.base || this.phase !== 'idle') return;

    const def = getBossDefinition(bossId);
    this.config = def.cameraCinematic;
    this.bossFocus.set(
      def.target.x,
      def.target.y + def.cameraCinematic.lookAtLift,
      def.target.z,
    );
    if (def.cameraCinematic.panFrom) {
      this.panFrom.set(
        def.cameraCinematic.panFrom.x,
        def.cameraCinematic.panFrom.y + def.cameraCinematic.lookAtLift,
        def.cameraCinematic.panFrom.z,
      );
    } else {
      this.panFrom.copy(this.base.target);
    }
    this.zoomedDistance = Math.max(
      CAMERA_CINEMATIC_DISTANCE_MIN,
      this.base.distance * def.cameraCinematic.distanceScale,
    );
    this.phase = 'zoomIn';
    this.elapsed = 0;
  }

  update(dt: number): void {
    if (!this.camera || !this.base || !this.config || this.phase === 'idle') return;

    this.elapsed += dt;

    if (this.phase === 'zoomIn') {
      const t = Math.min(1, this.elapsed / this.config.zoomInDuration);
      const e = easeOut(t);
      this.lookAt.lerpVectors(this.panFrom, this.bossFocus, e);
      this.applyView(
        this.lookAt,
        THREE.MathUtils.lerp(this.base.distance, this.zoomedDistance, e),
      );
      if (t >= 1) {
        this.phase = 'hold';
        this.elapsed = 0;
      }
      return;
    }

    if (this.phase === 'hold') {
      this.applyView(this.bossFocus, this.zoomedDistance);
      if (this.elapsed >= this.config.holdDuration) {
        this.phase = 'zoomOut';
        this.elapsed = 0;
      }
      return;
    }

    if (this.phase === 'zoomOut') {
      const t = Math.min(1, this.elapsed / this.config.zoomOutDuration);
      const e = easeIn(t);
      this.lookAt.lerpVectors(this.bossFocus, this.base.target, e);
      this.applyView(
        this.lookAt,
        THREE.MathUtils.lerp(this.zoomedDistance, this.base.distance, e),
      );
      if (t >= 1) this.finish();
    }
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

  private finish(): void {
    if (this.base) {
      this.applyView(this.base.target, this.base.distance);
    }
    this.resetState();
  }

  private resetState(): void {
    this.phase = 'idle';
    this.elapsed = 0;
    this.config = null;
  }

  private applyView(lookAt: THREE.Vector3, distance: number): void {
    if (!this.camera || !this.base) return;
    this.camera.up.set(0, 1, 0);
    this.camera.position.copy(lookAt).addScaledVector(this.base.dirToCamera, distance);
    this.camera.lookAt(lookAt);
  }
}
