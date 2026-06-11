import * as THREE from 'three';
import { DEMOGORGON_TARGET } from '../domain/Ball';
import {
  DEMOGORGON_ANIM_HIT,
  DEMOGORGON_ANIM_IDLE,
  DEMOGORGON_ANIM_VICTORY,
  DEMOGORGON_ANIM_VICTORY_FALLBACK,
  DEMOGORGON_MODEL_HEIGHT,
  DEMOGORGON_MODEL_URL,
  DEMOGORGON_MODEL_FOOT_LIFT,
  DEMOGORGON_MODEL_YAW,
} from '../domain/DemogorgonConstants';
import { PLAYFIELD_TILT, surfaceYAtZ } from '../domain/PlayfieldGeometry';
import { createGltfLoader } from './GltfDisplay';
import { fitWithRetry, warmupObject3D } from './SkinnedModelWarmup';

type AnimState = 'idle' | 'hit' | 'victory';

const _facingPos = new THREE.Vector3();

function findAnimationClip(clips: THREE.AnimationClip[], token: string): THREE.AnimationClip | undefined {
  const needle = token.toLowerCase();
  return clips.find((clip) => {
    const name = clip.name.toLowerCase();
    return name === needle || name.endsWith(`|${needle}`);
  });
}

export class DemogorgonTargetVisual {
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
      DEMOGORGON_TARGET.x,
      surfaceYAtZ(DEMOGORGON_TARGET.z) + DEMOGORGON_MODEL_FOOT_LIFT,
      DEMOGORGON_TARGET.z,
    );
    anchor.rotation.x = PLAYFIELD_TILT;
    anchor.visible = false;
    parent.add(anchor);
    this.anchor = anchor;

    const rig = new THREE.Group();
    anchor.add(rig);
    this.rig = rig;

    // PointLight ajoutée à la scène SEULEMENT pendant le fight (show/hide).
    this.glowLight = new THREE.PointLight(0xff5533, 0, 0.38, 2);
    this.glowLight.position.y = 0.03;

    this.loadPromise = this.loadModel();
  }

  ensureReady(): Promise<void> {
    return this.loadPromise ?? Promise.resolve();
  }

  async warmup(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Promise<void> {
    if (!this.anchor) return;
    await this.ensureReady();
    await fitWithRetry(() => this.tryApplyFit());
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
      this.glowLight.removeFromParent(); // hors scène hors fight
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
    if (this.pendingFit) this.tryApplyFit();
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
      const gltf = await createGltfLoader().loadAsync(DEMOGORGON_MODEL_URL);
      if (!this.anchor) return;
      this.fitModel(gltf.scene, gltf.animations);
      this.syncFacing();
      await fitWithRetry(() => this.tryApplyFit());
      if (this.anchor.visible) this.playIdle();
    } catch (err) {
      console.error('[Demogorgon] load error:', err);
    }
  }

  private tryApplyFit(): boolean {
    const model = this.pendingFit;
    if (!model || !this.rig || !this.offset || !this.anchor) return false;

    model.updateWorldMatrix(true, true);
    if (this.idleAction) {
      this.idleAction.play();
      this.idleAction.time = 0;
    }
    this.mixer?.update(0);
    model.traverse((obj) => {
      if (obj instanceof THREE.SkinnedMesh) obj.skeleton.update();
    });

    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    model.traverse((obj) => {
      if (obj instanceof THREE.SkinnedMesh) {
        const pos = obj.geometry.attributes.position;
        const hasSkin = obj.geometry.attributes.skinIndex && obj.geometry.attributes.skinWeight;
        if (!pos) return;
        obj.skeleton.update();
        const step = Math.max(1, Math.floor(pos.count / 800));
        for (let i = 0; i < pos.count; i += step) {
          v.fromBufferAttribute(pos, i);
          if (hasSkin) obj.applyBoneTransform(i, v);
          obj.localToWorld(v);
          this.anchor!.worldToLocal(v);
          box.expandByPoint(v);
        }
      }
    });
    if (box.isEmpty()) return false;

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    if (Math.max(Math.abs(center.x), Math.abs(center.y), Math.abs(center.z)) > 4) return false;

    const height = Math.max(size.y, 1e-4);
    this.offset.position.set(-center.x, -box.min.y + 0.006, -center.z);
    this.rig.scale.setScalar(DEMOGORGON_MODEL_HEIGHT / height);
    this.pendingFit = null;
    return true;
  }

  private syncFacing(): void {
    if (!this.rig || !this.anchor || !this.camera) return;

    this.anchor.getWorldPosition(_facingPos);
    const dx = this.camera.position.x - _facingPos.x;
    const dz = this.camera.position.z - _facingPos.z;
    this.rig.rotation.y = Math.atan2(dx, dz) + DEMOGORGON_MODEL_YAW;
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
    const idleClip = findAnimationClip(clips, DEMOGORGON_ANIM_IDLE);
    const hitClip = findAnimationClip(clips, DEMOGORGON_ANIM_HIT);
    const victoryClip =
      findAnimationClip(clips, DEMOGORGON_ANIM_VICTORY) ??
      findAnimationClip(clips, DEMOGORGON_ANIM_VICTORY_FALLBACK);

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

    this.playIdle();
  }

  private playIdle(): void {
    if (!this.idleAction) return;
    this.animState = 'idle';
    this.idleAction.reset();
    this.idleAction.setLoop(THREE.LoopRepeat, Infinity);
    this.idleAction.fadeIn(0.12).play();
  }
}
