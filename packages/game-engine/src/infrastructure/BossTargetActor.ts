import * as THREE from 'three';
import { PLAYFIELD_TILT, surfaceYAtZ } from '../domain/PlayfieldGeometry';
import { surfacePoint, cameraFacingYaw, type WalkPathPoint } from './WalkPathProgress';
import { createGltfLoader } from './GltfDisplay';
import { applySkinnedModelFit, fitSkinnedModelWithRetry } from './SkinnedModelFit';
import { warmupObject3D } from './SkinnedModelWarmup';
import { BossActorAnimator, type BossActorActions, type BossActorGlowConfig } from './BossActorAnimator';

const _facingPos = new THREE.Vector3();

/**
 * Resolved per-map animation actions for a boss target actor. The owning map
 * resolves its own clips (raw or subclipped to a Blender frame range) and wires
 * them into mixer actions — that GLTF-clip strategy is the genuine per-map diff.
 */
export type BossTargetClipResolver = (
  mixer: THREE.AnimationMixer,
  clips: THREE.AnimationClip[],
) => Pick<BossActorActions, 'idleAction' | 'hitAction' | 'victoryAction'>;

export type BossTargetActorConfig = {
  /** Tag for load-error logging, e.g. "Demogorgon". */
  logTag: string;
  modelUrl: string;
  /** Surface placement target ({x,z} used; y derived from surfaceYAtZ). */
  target: WalkPathPoint;
  footLift: number;
  modelHeight: number;
  floorClearance: number;
  fitFrames: number;
  /** Billboard yaw offset (radians) applied on top of camera-facing. */
  yaw: number;
  glow: BossActorGlowConfig;
  /** Map-specific GLTF clip → action wiring (raw vs subclip). */
  resolveClips: BossTargetClipResolver;
  /**
   * Whether dispose() also disposes the glow PointLight's GPU resources.
   * Both maps want this true (the light leaks otherwise).
   */
  disposeGlowOnDispose: boolean;
};

/**
 * Composed lifecycle for the "target boss" actors (Demogorgon / Ganondorf).
 * Owns mount/warmup/show/hide/update/dispose, the surface placement, the
 * camera-facing billboard, the GLTF load + skinned-model fit, and the emissive
 * material setup. The animation state machine + glow pulse live in
 * BossActorAnimator (composition). The ONLY per-map variation is injected via
 * config (scalars, glow color, log tag) and the resolveClips function.
 */
export class BossTargetActor {
  private anchor: THREE.Group | null = null;
  private camera: THREE.Camera | null = null;
  private rig: THREE.Group | null = null;
  private offset: THREE.Group | null = null;
  private pendingFit: THREE.Object3D | null = null;
  private loadPromise: Promise<void> | null = null;
  private readonly animator: BossActorAnimator;

  constructor(private readonly config: BossTargetActorConfig) {
    this.animator = new BossActorAnimator(config.glow);
  }

  mount(parent: THREE.Object3D, camera: THREE.Camera): void {
    this.dispose();
    this.camera = camera;

    const anchor = new THREE.Group();
    const p = surfacePoint(this.config.target, this.config.footLift, surfaceYAtZ);
    anchor.position.set(p.x, p.y, p.z);
    anchor.rotation.x = PLAYFIELD_TILT;
    anchor.visible = false;
    parent.add(anchor);
    this.anchor = anchor;

    const rig = new THREE.Group();
    anchor.add(rig);
    this.rig = rig;

    // PointLight added to the scene ONLY during the fight (show/hide).
    this.animator.createGlowLight();

    this.loadPromise = this.loadModel();
  }

  ensureReady(): Promise<void> {
    return this.loadPromise ?? Promise.resolve();
  }

  async warmup(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Promise<void> {
    if (!this.anchor) return;
    await this.ensureReady();
    await fitSkinnedModelWithRetry(
      () => this.applyFit(),
      this.config.fitFrames,
      () => this.anchor !== null,
    );
    this.syncFacing();
    await warmupObject3D(renderer, scene, camera, this.anchor, {
      mixer: this.animator.currentMixer,
      primeActions: this.animator.primeActions(),
    });
  }

  show(): void {
    if (this.anchor) this.anchor.visible = true;
    if (this.anchor) this.animator.show(this.anchor);
  }

  hide(): void {
    if (this.anchor) this.anchor.visible = false;
    this.animator.hide(this.anchor);
  }

  playHit(): void {
    this.animator.playHit();
  }

  playVictory(): void {
    this.animator.playVictory();
  }

  update(dt: number): void {
    if (this.pendingFit) this.applyFit();
    if (!this.anchor?.visible) return;

    this.syncFacing();
    this.animator.update(dt, this.anchor);
  }

  dispose(): void {
    if (this.anchor) this.anchor.parent?.remove(this.anchor);
    this.anchor = null;
    this.camera = null;
    this.rig = null;
    this.offset = null;
    this.pendingFit = null;
    this.loadPromise = null;
    this.animator.reset(this.config.disposeGlowOnDispose);
  }

  private async loadModel(): Promise<void> {
    try {
      const gltf = await createGltfLoader().loadAsync(this.config.modelUrl);
      if (!this.anchor) return;
      this.fitModel(gltf.scene, gltf.animations);
      this.syncFacing();
      await fitSkinnedModelWithRetry(
        () => this.applyFit(),
        this.config.fitFrames,
        () => this.anchor !== null,
      );
      if (this.anchor?.visible) this.animator.playIdle();
    } catch (err) {
      console.error(`[${this.config.logTag}] load error:`, err);
    }
  }

  private preparePoseForFit(): void {
    const idle = this.animator.idle;
    if (idle) {
      idle.play();
      idle.time = 0;
    }
    this.animator.currentMixer?.update(0);
    this.pendingFit?.updateWorldMatrix(true, true);
    this.pendingFit?.traverse((obj) => {
      if (obj instanceof THREE.SkinnedMesh) obj.skeleton.update();
    });
  }

  private syncFacing(): void {
    if (!this.rig || !this.anchor || !this.camera) return;

    this.anchor.getWorldPosition(_facingPos);
    this.rig.rotation.y = cameraFacingYaw(_facingPos, this.camera.position, this.config.yaw);
  }

  private applyFit(): boolean {
    const model = this.pendingFit;
    if (!model || !this.rig || !this.offset || !this.anchor) return false;

    const ok = applySkinnedModelFit({
      model,
      rig: this.rig,
      offset: this.offset,
      anchor: this.anchor,
      targetHeight: this.config.modelHeight,
      floorClearance: this.config.floorClearance,
      beforeMeasure: () => this.preparePoseForFit(),
    });
    if (ok) this.pendingFit = null;
    return ok;
  }

  private fitModel(model: THREE.Object3D, clips: THREE.AnimationClip[]): void {
    if (!this.anchor || !this.rig) return;

    this.rig.position.set(0, 0, 0);
    this.rig.scale.set(1, 1, 1);
    this.rig.rotation.set(0, 0, 0);
    this.anchor.scale.set(1, 1, 1);
    const offset = new THREE.Group();
    this.offset = offset;
    this.rig.add(offset);
    offset.add(model);
    this.pendingFit = model;

    model.traverse((obj) => {
      obj.frustumCulled = false;
      if (obj instanceof THREE.SkinnedMesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (mat instanceof THREE.MeshStandardMaterial) {
            if (mat.map) {
              mat.emissiveMap = mat.map;
              mat.emissive.setHex(0xffffff);
            } else {
              mat.emissive.copy(mat.color);
            }
            mat.emissiveIntensity = 0.55;
            mat.needsUpdate = true;
          }
        }
      }
    });

    const mixer = new THREE.AnimationMixer(model);
    const { idleAction, hitAction, victoryAction } = this.config.resolveClips(mixer, clips);

    this.animator.setActions({ mixer, idleAction, hitAction, victoryAction });
  }
}
