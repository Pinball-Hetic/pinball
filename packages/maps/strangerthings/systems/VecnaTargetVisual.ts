import * as THREE from 'three';
import { VECNA_TARGET } from '../bosses';
import {
  VECNA_ANIM_HIT,
  VECNA_ANIM_VICTORY,
  VECNA_ANIM_WALK,
  VECNA_MODEL_BIND_HEIGHT,
  VECNA_MODEL_FIT_FRAMES,
  VECNA_MODEL_FLOOR_CLEARANCE,
  VECNA_MODEL_FOOT_LIFT,
  VECNA_MODEL_HEIGHT,
  VECNA_MODEL_URL,
  VECNA_MODEL_YAW,
  VECNA_SPAWN,
  VECNA_WALK_DURATION,
  VECNA_WALK_FADE_OUT,
  VECNA_WALK_SETTLE_FACING,
} from './VecnaConstants';
import { PLAYFIELD_TILT, surfaceYAtZ, easeOut, findGltfAnimationClip, createGltfLoader, applySkinnedModelFit, fitSkinnedModelWithRetry, updateSkinnedBindPose, warmupObject3D } from '@pinball/game-engine';

type AnimState = 'walk' | 'fight' | 'hit' | 'victory';

const _vecnaFacingPos = new THREE.Vector3();

export class VecnaTargetVisual {
  private anchor: THREE.Group | null = null;
  private camera: THREE.Camera | null = null;
  private rig: THREE.Group | null = null;
  private offset: THREE.Group | null = null;
  private model: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private walkAction: THREE.AnimationAction | null = null;
  private fightIdleAction: THREE.AnimationAction | null = null;
  private hitAction: THREE.AnimationAction | null = null;
  private victoryAction: THREE.AnimationAction | null = null;
  private animState: AnimState = 'walk';
  private glowLight: THREE.PointLight | null = null;
  private loadPromise: Promise<void> | null = null;
  private pathT = 1;
  private walking = false;
  private walkElapsed = 0;
  private settling = false;
  private settleElapsed = 0;
  private settleDuration = 0;
  private walkFacingY = 0;
  private pulseT = 0;
  private hitFlash = 0;

  mount(parent: THREE.Object3D, camera: THREE.Camera): void {
    this.dispose();
    this.camera = camera;

    const anchor = new THREE.Group();
    anchor.rotation.x = PLAYFIELD_TILT;
    anchor.visible = false;
    parent.add(anchor);
    this.anchor = anchor;
    this.setPathProgress(0);

    const rig = new THREE.Group();
    anchor.add(rig);
    this.rig = rig;

    this.glowLight = new THREE.PointLight(0xbb88ff, 0, 0.62, 2);
    this.glowLight.position.y = 0.08;
    anchor.add(this.glowLight);

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
      VECNA_MODEL_FIT_FRAMES,
      () => this.anchor !== null,
    );
    const primeActions = [this.walkAction, this.fightIdleAction, this.hitAction, this.victoryAction].filter(
      (action): action is THREE.AnimationAction => action !== null,
    );
    await warmupObject3D(renderer, scene, camera, this.anchor, {
      mixer: this.mixer,
      primeActions,
    });
  }

  beginReveal(): void {
    this.walking = false;
    this.walkElapsed = 0;
    this.settling = false;
    this.settleElapsed = 0;
    this.animState = 'walk';
    this.walkAction?.stop();
    this.fightIdleAction?.stop();
    this.hitAction?.stop();
    this.victoryAction?.stop();
    this.setPathProgress(0);
  }

  prepareWalk(): void {
    this.applyFit();
    this.playWalk();
  }

  setPathProgress(t: number): void {
    this.pathT = THREE.MathUtils.clamp(t, 0, 1);
    if (!this.anchor) return;

    const x = THREE.MathUtils.lerp(VECNA_SPAWN.x, VECNA_TARGET.x, this.pathT);
    const z = THREE.MathUtils.lerp(VECNA_SPAWN.z, VECNA_TARGET.z, this.pathT);
    this.anchor.position.set(x, surfaceYAtZ(z) + VECNA_MODEL_FOOT_LIFT, z);
  }

  show(): void {
    if (this.anchor) this.anchor.visible = true;
  }

  hide(): void {
    if (this.anchor) {
      this.anchor.visible = false;
      this.anchor.scale.setScalar(1);
      this.anchor.rotation.z = 0;
    }
    this.walking = false;
    this.walkElapsed = 0;
    this.settling = false;
    this.animState = 'walk';
    this.walkAction?.stop();
    this.fightIdleAction?.stop();
    this.hitAction?.stop();
    this.victoryAction?.stop();
    this.pathT = 0;
    this.hitFlash = 0;
    this.setPathProgress(0);
    if (this.glowLight) this.glowLight.intensity = 0;
  }

  playWalk(): void {
    this.walking = true;
    this.walkElapsed = 0;
    this.settling = false;
    this.animState = 'walk';
    if (!this.walkAction) return;
    this.fightIdleAction?.stop();
    this.walkAction.reset();
    this.walkAction.setLoop(THREE.LoopRepeat, Infinity);
    this.walkAction.clampWhenFinished = false;
    this.walkAction.timeScale = 1;
    this.walkAction.play();
  }

  startSettle(): void {
    if (!this.walking || this.settling) return;
    this.settling = true;
    this.settleElapsed = 0;
    this.settleDuration = VECNA_WALK_SETTLE_FACING;
    this.setPathProgress(1);
    if (this.rig) this.walkFacingY = this.rig.rotation.y;

    if (this.walkAction) {
      this.walkAction.fadeOut(VECNA_WALK_FADE_OUT);
    }
  }

  isWalkPathComplete(): boolean {
    return this.walkElapsed >= VECNA_WALK_DURATION;
  }

  private syncWalkPath(): void {
    const t = Math.min(1, this.walkElapsed / VECNA_WALK_DURATION);
    this.setPathProgress(t);
  }

  updateSettle(dt: number): boolean {
    if (!this.settling) return true;

    if (this.settleDuration <= 0) {
      this.completeSettle();
      return true;
    }

    this.settleElapsed += dt;
    const t = Math.min(1, this.settleElapsed / this.settleDuration);
    this.lerpFacingToCamera(easeOut(t));

    if (this.settleElapsed >= this.settleDuration + 0.05) {
      this.completeSettle();
    }

    return !this.settling;
  }

  private completeSettle(): void {
    if (!this.settling) return;
    this.settling = false;
    this.walking = false;
    if (this.walkAction) {
      this.walkAction.stop();
      this.walkAction.time = 0;
    }
    this.syncFacing();
    this.enterFightIdle();
  }

  playHit(): void {
    if (!this.mixer || !this.hitAction || !this.fightIdleAction) return;
    this.animState = 'hit';
    this.hitFlash = 0.18;
    this.fightIdleAction.paused = false;
    this.hitAction.reset();
    this.hitAction.setLoop(THREE.LoopOnce, 1);
    this.hitAction.clampWhenFinished = true;
    this.hitAction.crossFadeFrom(this.fightIdleAction, 0.08, true).play();
  }

  playVictory(): void {
    if (!this.mixer || !this.victoryAction) {
      this.enterFightIdle();
      return;
    }
    this.animState = 'victory';
    this.hitFlash = 0.28;
    this.victoryAction.reset();
    this.victoryAction.setLoop(THREE.LoopOnce, 1);
    this.victoryAction.clampWhenFinished = true;
    const from = this.hitAction?.isRunning() ? this.hitAction : this.fightIdleAction;
    if (from) {
      this.victoryAction.crossFadeFrom(from, 0.12, true).play();
    } else {
      this.victoryAction.play();
    }
  }

  update(dt: number): void {
    if (!this.anchor?.visible) return;

    this.mixer?.update(dt);

    if (this.walking && !this.settling) {
      this.walkElapsed = Math.min(VECNA_WALK_DURATION, this.walkElapsed + dt);
      this.syncWalkPath();
      this.syncWalkFacing();
    } else if (!this.settling) {
      this.syncFacing();
    }

    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);

    this.pulseT += dt;
    const hitBoost = this.hitFlash > 0 ? 1.5 : 1;
    const pulse = (0.82 + Math.sin(this.pulseT * 2.2) * 0.14) * hitBoost;
    if (this.glowLight) this.glowLight.intensity = 0.72 * pulse;

    const scale = 1 + (this.hitFlash / 0.18) * 0.12;
    this.anchor.scale.setScalar(scale);
  }

  dispose(): void {
    if (this.anchor) this.anchor.parent?.remove(this.anchor);
    this.anchor = null;
    this.camera = null;
    this.mixer = null;
    this.walkAction = null;
    this.fightIdleAction = null;
    this.hitAction = null;
    this.victoryAction = null;
    this.glowLight = null;
    this.rig = null;
    this.offset = null;
    this.model = null;
    this.walking = false;
    this.walkElapsed = 0;
    this.settling = false;
    this.hitFlash = 0;
    this.pulseT = 0;
    this.pathT = 0;
    this.animState = 'walk';
    this.loadPromise = null;
  }

  private async loadModel(): Promise<void> {
    try {
      const gltf = await createGltfLoader().loadAsync(VECNA_MODEL_URL);
      if (!this.anchor) return;
      this.attachModel(gltf.scene, gltf.animations);
      await fitSkinnedModelWithRetry(
        () => this.applyFit(),
        VECNA_MODEL_FIT_FRAMES,
        () => this.anchor !== null,
      );
      this.setPathProgress(this.pathT);
      this.syncWalkFacing();
    } catch (err) {
      console.error('[Vecna] load error:', err);
    }
  }

  private attachModel(model: THREE.Object3D, clips: THREE.AnimationClip[]): void {
    if (!this.anchor || !this.rig) return;

    this.rig.position.set(0, 0, 0);
    this.rig.rotation.set(0, 0, 0);
    this.rig.scale.set(1, 1, 1);
    this.anchor.scale.set(1, 1, 1);

    const offset = new THREE.Group();
    this.offset = offset;
    this.rig.add(offset);
    offset.add(model);
    this.model = model;

    model.traverse((obj) => {
      obj.frustumCulled = false;
      if (obj instanceof THREE.SkinnedMesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (mat instanceof THREE.MeshStandardMaterial) {
            mat.emissive.setHex(0x775588);
            mat.emissiveIntensity = 0.72;
            mat.needsUpdate = true;
          }
        }
      }
    });

    this.mixer = new THREE.AnimationMixer(model);
    const walkClip = findGltfAnimationClip(clips, VECNA_ANIM_WALK);
    const hitClip = findGltfAnimationClip(clips, VECNA_ANIM_HIT);
    const victoryClip = findGltfAnimationClip(clips, VECNA_ANIM_VICTORY);

    if (walkClip) {
      this.walkAction = this.mixer.clipAction(walkClip);
      this.walkAction.setLoop(THREE.LoopRepeat, Infinity);
      this.walkAction.clampWhenFinished = false;

      this.fightIdleAction = this.mixer.clipAction(walkClip);
      this.fightIdleAction.setLoop(THREE.LoopOnce, 1);
      this.fightIdleAction.clampWhenFinished = true;
    } else {
      console.warn(`[Vecna] walk clip not found (token="${VECNA_ANIM_WALK}")`, clips.map((c) => c.name));
    }

    if (hitClip) {
      this.hitAction = this.mixer.clipAction(hitClip);
      this.hitAction.setLoop(THREE.LoopOnce, 1);
      this.hitAction.clampWhenFinished = true;
    } else {
      console.warn(`[Vecna] hit clip not found (token="${VECNA_ANIM_HIT}")`, clips.map((c) => c.name));
    }

    if (victoryClip) {
      this.victoryAction = this.mixer.clipAction(victoryClip);
      this.victoryAction.setLoop(THREE.LoopOnce, 1);
      this.victoryAction.clampWhenFinished = true;
    } else {
      console.warn(`[Vecna] victory clip not found (token="${VECNA_ANIM_VICTORY}")`, clips.map((c) => c.name));
    }

    this.mixer.addEventListener('finished', (event) => {
      if (event.action === this.hitAction && this.animState === 'hit') {
        this.enterFightIdle();
      }
    });
  }

  private enterFightIdle(): void {
    if (!this.fightIdleAction) return;
    this.animState = 'fight';
    this.hitAction?.stop();
    this.walkAction?.stop();
    this.fightIdleAction.reset();
    this.fightIdleAction.setLoop(THREE.LoopOnce, 1);
    this.fightIdleAction.clampWhenFinished = true;
    this.fightIdleAction.time = 0;
    this.fightIdleAction.timeScale = 1;
    this.fightIdleAction.play();
    this.fightIdleAction.paused = true;
  }

  private applyFit(): boolean {
    if (!this.model || !this.offset || !this.rig || !this.anchor) return false;

    return applySkinnedModelFit({
      model: this.model,
      rig: this.rig,
      offset: this.offset,
      anchor: this.anchor,
      targetHeight: VECNA_MODEL_HEIGHT,
      floorClearance: VECNA_MODEL_FLOOR_CLEARANCE,
      fixedBindHeight: VECNA_MODEL_BIND_HEIGHT,
      beforeMeasure: () => updateSkinnedBindPose(this.model!),
    });
  }

  private lerpFacingToCamera(t: number): void {
    if (!this.rig) return;
    const targetY = this.cameraFacingY();
    if (targetY === null) return;
    this.rig.rotation.y = THREE.MathUtils.lerp(this.walkFacingY, targetY, t);
  }

  private syncWalkFacing(): void {
    if (!this.rig) return;
    const dz = VECNA_TARGET.z - VECNA_SPAWN.z;
    const dx = VECNA_TARGET.x - VECNA_SPAWN.x;
    this.rig.rotation.y = Math.atan2(dx, dz) + VECNA_MODEL_YAW;
  }

  private syncFacing(): void {
    if (!this.rig) return;
    const targetY = this.cameraFacingY();
    if (targetY === null) return;
    this.rig.rotation.y = targetY;
  }

  private cameraFacingY(): number | null {
    if (!this.anchor || !this.camera) return null;

    this.anchor.getWorldPosition(_vecnaFacingPos);
    const dx = this.camera.position.x - _vecnaFacingPos.x;
    const dz = this.camera.position.z - _vecnaFacingPos.z;
    return Math.atan2(dx, dz) + VECNA_MODEL_YAW;
  }
}
