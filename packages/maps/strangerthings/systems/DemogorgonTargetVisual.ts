import * as THREE from 'three';
import { DEMOGORGON_TARGET } from '../bosses';
import {
  DEMOGORGON_ANIM_HIT,
  DEMOGORGON_ANIM_IDLE,
  DEMOGORGON_ANIM_VICTORY,
  DEMOGORGON_ANIM_VICTORY_FALLBACK,
  DEMOGORGON_MODEL_FIT_FRAMES,
  DEMOGORGON_MODEL_FLOOR_CLEARANCE,
  DEMOGORGON_MODEL_HEIGHT,
  DEMOGORGON_MODEL_URL,
  DEMOGORGON_MODEL_FOOT_LIFT,
  DEMOGORGON_MODEL_YAW,
} from './DemogorgonConstants';
import { PLAYFIELD_TILT, surfaceYAtZ, surfacePoint, cameraFacingYaw } from '@pinball/game-engine';
import { findGltfAnimationClip } from '@pinball/game-engine';
import { createGltfLoader } from '@pinball/game-engine';
import {
  applySkinnedModelFit,
  fitSkinnedModelWithRetry,
} from '@pinball/game-engine';
import { warmupObject3D } from '@pinball/game-engine';
import { BossActorAnimator } from '@pinball/game-engine';

const _facingPos = new THREE.Vector3();

export class DemogorgonTargetVisual {
  private anchor: THREE.Group | null = null;
  private camera: THREE.Camera | null = null;
  private rig: THREE.Group | null = null;
  private offset: THREE.Group | null = null;
  private pendingFit: THREE.Object3D | null = null;
  private loadPromise: Promise<void> | null = null;
  private readonly animator = new BossActorAnimator({
    color: 0xff5533,
    distance: 0.38,
    decay: 2,
    y: 0.03,
  });

  mount(parent: THREE.Object3D, camera: THREE.Camera): void {
    this.dispose();
    this.camera = camera;

    const anchor = new THREE.Group();
    const p = surfacePoint(DEMOGORGON_TARGET, DEMOGORGON_MODEL_FOOT_LIFT, surfaceYAtZ);
    anchor.position.set(p.x, p.y, p.z);
    anchor.rotation.x = PLAYFIELD_TILT;
    anchor.visible = false;
    parent.add(anchor);
    this.anchor = anchor;

    const rig = new THREE.Group();
    anchor.add(rig);
    this.rig = rig;

    // PointLight ajoutée à la scène SEULEMENT pendant le fight (show/hide).
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
      DEMOGORGON_MODEL_FIT_FRAMES,
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
    this.animator.reset(false);
  }

  private async loadModel(): Promise<void> {
    try {
      const gltf = await createGltfLoader().loadAsync(DEMOGORGON_MODEL_URL);
      if (!this.anchor) return;
      this.fitModel(gltf.scene, gltf.animations);
      this.syncFacing();
      await fitSkinnedModelWithRetry(
        () => this.applyFit(),
        DEMOGORGON_MODEL_FIT_FRAMES,
        () => this.anchor !== null,
      );
      if (this.anchor?.visible) this.animator.playIdle();
    } catch (err) {
      console.error('[Demogorgon] load error:', err);
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
    this.rig.rotation.y = cameraFacingYaw(_facingPos, this.camera.position, DEMOGORGON_MODEL_YAW);
  }

  private applyFit(): boolean {
    const model = this.pendingFit;
    if (!model || !this.rig || !this.offset || !this.anchor) return false;

    const ok = applySkinnedModelFit({
      model,
      rig: this.rig,
      offset: this.offset,
      anchor: this.anchor,
      targetHeight: DEMOGORGON_MODEL_HEIGHT,
      floorClearance: DEMOGORGON_MODEL_FLOOR_CLEARANCE,
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
    const idleClip = findGltfAnimationClip(clips, DEMOGORGON_ANIM_IDLE);
    const hitClip = findGltfAnimationClip(clips, DEMOGORGON_ANIM_HIT);
    const victoryClip =
      findGltfAnimationClip(clips, DEMOGORGON_ANIM_VICTORY) ??
      findGltfAnimationClip(clips, DEMOGORGON_ANIM_VICTORY_FALLBACK);

    let idleAction: THREE.AnimationAction | null = null;
    let hitAction: THREE.AnimationAction | null = null;
    let victoryAction: THREE.AnimationAction | null = null;

    if (idleClip) {
      idleAction = mixer.clipAction(idleClip);
      idleAction.setLoop(THREE.LoopRepeat, Infinity);
    }
    if (hitClip) {
      hitAction = mixer.clipAction(hitClip);
      hitAction.setLoop(THREE.LoopOnce, 1);
      hitAction.clampWhenFinished = true;
    }
    if (victoryClip) {
      victoryAction = mixer.clipAction(victoryClip);
      victoryAction.setLoop(THREE.LoopOnce, 1);
      victoryAction.clampWhenFinished = true;
    }

    this.animator.setActions({ mixer, idleAction, hitAction, victoryAction });
  }
}
