import * as THREE from 'three';
import { GANONDORF_TARGET } from '../bosses';
import {
  GANONDORF_ANIM_HIT,
  GANONDORF_ANIM_IDLE,
  GANONDORF_ANIM_VICTORY,
  GANONDORF_ANIM_VICTORY_FALLBACK,
  GANONDORF_ANIM_FPS,
  GANONDORF_ANIM_IDLE_FRAMES,
  GANONDORF_ANIM_HIT_FRAMES,
  GANONDORF_ANIM_VICTORY_FRAMES,
  GANONDORF_MODEL_FIT_FRAMES,
  GANONDORF_MODEL_FLOOR_CLEARANCE,
  GANONDORF_MODEL_HEIGHT,
  GANONDORF_MODEL_FOOT_LIFT,
  GANONDORF_MODEL_YAW,
  GANONDORF_MODEL_URL,
} from './GanondorfConstants';
import { PLAYFIELD_TILT, surfaceYAtZ } from '@pinball/game-engine';
import { findGltfAnimationClip } from '@pinball/game-engine';
import { createGltfLoader } from '@pinball/game-engine';
import {
  applySkinnedModelFit,
  fitSkinnedModelWithRetry,
} from '@pinball/game-engine';
import { warmupObject3D } from '@pinball/game-engine';

type AnimState = 'idle' | 'hit' | 'victory';

const _facingPos = new THREE.Vector3();

export class GanondorfTargetVisual {
  private anchor: THREE.Group | null = null;
  private camera: THREE.Camera | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private idleAction: THREE.AnimationAction | null = null;
  private hitAction: THREE.AnimationAction | null = null;
  private victoryAction: THREE.AnimationAction | null = null;
  private animState: AnimState = 'idle';
  private pulseT = 0;
  private hitFlash = 0;
  private rig: THREE.Group | null = null;
  private offset: THREE.Group | null = null;
  private pendingFit: THREE.Object3D | null = null;
  private glowLight: THREE.PointLight | null = null;
  private loadPromise: Promise<void> | null = null;

  mount(parent: THREE.Object3D, camera: THREE.Camera): void {
    this.dispose();
    this.camera = camera;

    const anchor = new THREE.Group();
    anchor.position.set(
      GANONDORF_TARGET.x,
      surfaceYAtZ(GANONDORF_TARGET.z) + GANONDORF_MODEL_FOOT_LIFT,
      GANONDORF_TARGET.z,
    );
    anchor.rotation.x = PLAYFIELD_TILT;
    anchor.visible = false;
    parent.add(anchor);
    this.anchor = anchor;

    const rig = new THREE.Group();
    anchor.add(rig);
    this.rig = rig;

    // Lumière violette — ajoutée à la scène SEULEMENT pendant le fight.
    this.glowLight = new THREE.PointLight(0xaa00ff, 0, 0.38, 2);
    this.glowLight.position.y = 0.03;

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
      GANONDORF_MODEL_FIT_FRAMES,
      () => this.anchor !== null,
    );
    this.syncFacing();
    const primeActions = [this.idleAction, this.hitAction, this.victoryAction].filter(
      (action): action is THREE.AnimationAction => action !== null,
    );
    await warmupObject3D(renderer, scene, camera, this.anchor, {
      mixer: this.mixer,
      primeActions,
    });
  }

  show(): void {
    if (this.anchor) this.anchor.visible = true;
    if (this.glowLight && this.anchor && !this.glowLight.parent) {
      this.anchor.add(this.glowLight);
    }
    this.playIdle();
  }

  hide(): void {
    if (this.anchor) {
      this.anchor.visible = false;
      this.anchor.scale.setScalar(1);
      this.anchor.rotation.z = 0;
    }
    this.animState = 'idle';
    this.hitFlash = 0;
    if (this.glowLight) {
      this.glowLight.intensity = 0;
      this.glowLight.removeFromParent();
    }
  }

  playHit(): void {
    if (!this.mixer || !this.hitAction || !this.idleAction) return;
    this.animState = 'hit';
    this.hitFlash = 0.18;
    this.hitAction.reset();
    this.hitAction.setLoop(THREE.LoopOnce, 1);
    this.hitAction.clampWhenFinished = true;
    this.hitAction.crossFadeFrom(this.idleAction, 0.08, true).play();
  }

  playVictory(): void {
    if (!this.mixer || !this.victoryAction || !this.idleAction) {
      this.playIdle();
      return;
    }
    this.animState = 'victory';
    this.victoryAction.reset();
    this.victoryAction.setLoop(THREE.LoopOnce, 1);
    this.victoryAction.clampWhenFinished = true;
    const from = this.hitAction?.isRunning() ? this.hitAction : this.idleAction;
    this.victoryAction.crossFadeFrom(from, 0.12, true).play();
  }

  update(dt: number): void {
    if (this.pendingFit) this.applyFit();
    if (!this.anchor?.visible) return;

    this.mixer?.update(dt);
    this.syncFacing();

    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);

    this.pulseT += dt;
    const hitBoost = this.hitFlash > 0 ? 1.4 : 1;
    const pulse = (0.82 + Math.sin(this.pulseT * 2.5) * 0.12) * hitBoost;
    if (this.glowLight) this.glowLight.intensity = 0.42 * pulse;

    const scale = 1 + (this.hitFlash / 0.18) * 0.2;
    this.anchor.scale.setScalar(scale);
  }

  dispose(): void {
    if (this.anchor) this.anchor.parent?.remove(this.anchor);
    this.anchor = null;
    this.camera = null;
    this.mixer = null;
    this.idleAction = null;
    this.hitAction = null;
    this.victoryAction = null;
    if (this.glowLight) {
      this.glowLight.dispose();
      this.glowLight.removeFromParent();
    }
    this.glowLight = null;
    this.rig = null;
    this.offset = null;
    this.pendingFit = null;
    this.animState = 'idle';
    this.hitFlash = 0;
    this.pulseT = 0;
    this.loadPromise = null;
  }

  private async loadModel(): Promise<void> {
    try {
      const gltf = await createGltfLoader().loadAsync(GANONDORF_MODEL_URL);
      if (!this.anchor) return;
      this.fitModel(gltf.scene, gltf.animations);
      this.syncFacing();
      await fitSkinnedModelWithRetry(
        () => this.applyFit(),
        GANONDORF_MODEL_FIT_FRAMES,
        () => this.anchor !== null,
      );
      if (this.anchor?.visible) this.playIdle();
    } catch (err) {
      console.error('[Ganondorf] load error:', err);
    }
  }

  private preparePoseForFit(): void {
    if (this.idleAction) {
      this.idleAction.play();
      this.idleAction.time = 0;
    }
    this.mixer?.update(0);
    this.pendingFit?.updateWorldMatrix(true, true);
    this.pendingFit?.traverse((obj) => {
      if (obj instanceof THREE.SkinnedMesh) obj.skeleton.update();
    });
  }

  private syncFacing(): void {
    if (!this.rig || !this.anchor || !this.camera) return;

    this.anchor.getWorldPosition(_facingPos);
    const dx = this.camera.position.x - _facingPos.x;
    const dz = this.camera.position.z - _facingPos.z;
    this.rig.rotation.y = Math.atan2(dx, dz) + GANONDORF_MODEL_YAW;
  }

  private applyFit(): boolean {
    const model = this.pendingFit;
    if (!model || !this.rig || !this.offset || !this.anchor) return false;

    const ok = applySkinnedModelFit({
      model,
      rig: this.rig,
      offset: this.offset,
      anchor: this.anchor,
      targetHeight: GANONDORF_MODEL_HEIGHT,
      floorClearance: GANONDORF_MODEL_FLOOR_CLEARANCE,
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

    this.mixer = new THREE.AnimationMixer(model);

    // Recadrage des clips sur leur plage Blender (Manual Frame Range).
    // Sans subclip, le GLB exporte les keyframes en temps absolu et Three.js
    // joue depuis t=0, ce qui fait jouer la mauvaise partie de l'animation.
    const rawIdleClip = findGltfAnimationClip(clips, GANONDORF_ANIM_IDLE);
    const rawHitClip = findGltfAnimationClip(clips, GANONDORF_ANIM_HIT);
    const rawVictoryClip =
      findGltfAnimationClip(clips, GANONDORF_ANIM_VICTORY) ??
      findGltfAnimationClip(clips, GANONDORF_ANIM_VICTORY_FALLBACK);

    const idleClip = rawIdleClip
      ? THREE.AnimationUtils.subclip(rawIdleClip, GANONDORF_ANIM_IDLE, GANONDORF_ANIM_IDLE_FRAMES.start, GANONDORF_ANIM_IDLE_FRAMES.end, GANONDORF_ANIM_FPS)
      : undefined;
    const hitClip = rawHitClip
      ? THREE.AnimationUtils.subclip(rawHitClip, GANONDORF_ANIM_HIT, GANONDORF_ANIM_HIT_FRAMES.start, GANONDORF_ANIM_HIT_FRAMES.end, GANONDORF_ANIM_FPS)
      : undefined;
    const victoryClip = rawVictoryClip
      ? THREE.AnimationUtils.subclip(rawVictoryClip, GANONDORF_ANIM_VICTORY, GANONDORF_ANIM_VICTORY_FRAMES.start, GANONDORF_ANIM_VICTORY_FRAMES.end, GANONDORF_ANIM_FPS)
      : undefined;

    if (idleClip) {
      this.idleAction = this.mixer.clipAction(idleClip);
      this.idleAction.setLoop(THREE.LoopRepeat, Infinity);
    }
    if (hitClip) {
      this.hitAction = this.mixer.clipAction(hitClip);
      this.hitAction.setLoop(THREE.LoopOnce, 1);
      this.hitAction.clampWhenFinished = true;
    }
    if (victoryClip) {
      this.victoryAction = this.mixer.clipAction(victoryClip);
      this.victoryAction.setLoop(THREE.LoopOnce, 1);
      this.victoryAction.clampWhenFinished = true;
    }

    this.mixer.addEventListener('finished', (event) => {
      if (event.action === this.hitAction && this.animState === 'hit') {
        this.playIdle();
      }
    });
  }

  private playIdle(): void {
    if (!this.idleAction) return;
    this.animState = 'idle';
    this.idleAction.reset();
    this.idleAction.setLoop(THREE.LoopRepeat, Infinity);
    this.idleAction.fadeIn(0.12).play();
  }
}
