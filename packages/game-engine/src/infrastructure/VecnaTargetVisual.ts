import * as THREE from 'three';
import { VECNA_TARGET } from '../domain/Ball';
import {
  VECNA_ANIM_WALK,
  VECNA_MODEL_BIND_HEIGHT,
  VECNA_MODEL_FIT_FRAMES,
  VECNA_MODEL_FLOOR_CLEARANCE,
  VECNA_MODEL_FOOT_LIFT,
  VECNA_MODEL_HEIGHT,
  VECNA_MODEL_URL,
  VECNA_MODEL_YAW,
  VECNA_SPAWN,
} from '../domain/VecnaConstants';
import { PLAYFIELD_TILT, surfaceYAtZ } from '../domain/PlayfieldGeometry';
import { easeOut } from './CinematicEasing';
import { findGltfAnimationClip } from './GltfAnimationClips';
import { createGltfLoader } from './GltfDisplay';
import {
  applySkinnedModelFit,
  fitSkinnedModelWithRetry,
  updateSkinnedBindPose,
} from './SkinnedModelFit';

export class VecnaTargetVisual {
  private anchor: THREE.Group | null = null;
  private camera: THREE.Camera | null = null;
  private rig: THREE.Group | null = null;
  private offset: THREE.Group | null = null;
  private model: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private walkAction: THREE.AnimationAction | null = null;
  private glowLight: THREE.PointLight | null = null;
  private loadPromise: Promise<void> | null = null;
  private pathT = 1;
  private walking = false;
  private settling = false;
  private settleElapsed = 0;
  private settleDuration = 0;
  private walkFacingY = 0;
  private pulseT = 0;
  private hitFlash = 0;

  private readonly onWalkFinished = (event: { action: THREE.AnimationAction }): void => {
    if (event.action === this.walkAction && this.settling) {
      this.completeSettle();
    }
  };

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

    this.glowLight = new THREE.PointLight(0x9955ee, 0, 0.55, 2);
    this.glowLight.position.y = 0.08;
    anchor.add(this.glowLight);

    this.loadPromise = this.loadModel();
  }

  ensureReady(): Promise<void> {
    return this.loadPromise ?? Promise.resolve();
  }

  async warmup(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Promise<void> {
    if (!this.anchor) return;
    await renderer.compileAsync(this.anchor, camera, scene);
  }

  beginReveal(): void {
    this.walking = false;
    this.settling = false;
    this.settleElapsed = 0;
    this.walkAction?.stop();
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
    this.settling = false;
    this.walkAction?.stop();
    this.pathT = 0;
    this.hitFlash = 0;
    this.setPathProgress(0);
    if (this.glowLight) this.glowLight.intensity = 0;
  }

  playWalk(): void {
    if (!this.walkAction) return;
    this.walking = true;
    this.settling = false;
    this.walkAction.reset();
    this.walkAction.setLoop(THREE.LoopRepeat, Infinity);
    this.walkAction.clampWhenFinished = false;
    this.walkAction.play();
  }

  startSettle(): void {
    if (!this.walking || this.settling) return;
    this.settling = true;
    this.settleElapsed = 0;
    this.setPathProgress(1);
    if (this.rig) this.walkFacingY = this.rig.rotation.y;

    if (!this.walkAction) {
      this.settleDuration = 0;
      return;
    }

    const clipDuration = this.walkAction.getClip().duration;
    const phase = this.walkAction.time % clipDuration;
    this.settleDuration = clipDuration - phase;
    this.walkAction.setLoop(THREE.LoopOnce, 1);
    this.walkAction.clampWhenFinished = true;
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
    this.syncFacing();
  }

  stopWalk(): void {
    this.walking = false;
    this.settling = false;
    if (this.walkAction) {
      this.walkAction.stop();
      this.walkAction.time = 0;
      this.walkAction.clampWhenFinished = false;
    }
  }

  playHit(): void {
    this.hitFlash = 0.18;
  }

  playVictory(): void {
    this.hitFlash = 0.28;
  }

  update(dt: number): void {
    if (!this.anchor?.visible) return;

    this.mixer?.update(dt);

    if (this.walking && !this.settling) this.syncWalkFacing();
    else if (!this.settling) this.syncFacing();

    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);

    this.pulseT += dt;
    const hitBoost = this.hitFlash > 0 ? 1.5 : 1;
    const pulse = (0.82 + Math.sin(this.pulseT * 2.2) * 0.14) * hitBoost;
    if (this.glowLight) this.glowLight.intensity = 0.58 * pulse;

    const scale = 1 + (this.hitFlash / 0.18) * 0.12;
    this.anchor.scale.setScalar(scale);
  }

  dispose(): void {
    this.mixer?.removeEventListener('finished', this.onWalkFinished);
    if (this.anchor) this.anchor.parent?.remove(this.anchor);
    this.anchor = null;
    this.camera = null;
    this.mixer = null;
    this.walkAction = null;
    this.glowLight = null;
    this.rig = null;
    this.offset = null;
    this.model = null;
    this.walking = false;
    this.settling = false;
    this.hitFlash = 0;
    this.pulseT = 0;
    this.pathT = 0;
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
            mat.emissive.setHex(0x553366);
            mat.emissiveIntensity = 0.55;
            mat.needsUpdate = true;
          }
        }
      }
    });

    this.mixer = new THREE.AnimationMixer(model);
    this.mixer.addEventListener('finished', this.onWalkFinished);
    const walkClip = findGltfAnimationClip(clips, VECNA_ANIM_WALK);
    if (walkClip) {
      this.walkAction = this.mixer.clipAction(walkClip);
      this.walkAction.setLoop(THREE.LoopRepeat, Infinity);
      this.walkAction.clampWhenFinished = false;
    } else {
      console.warn(`[Vecna] walk clip not found (token="${VECNA_ANIM_WALK}")`, clips.map((c) => c.name));
    }
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

    const anchorPos = new THREE.Vector3();
    this.anchor.getWorldPosition(anchorPos);
    const dx = this.camera.position.x - anchorPos.x;
    const dz = this.camera.position.z - anchorPos.z;
    return Math.atan2(dx, dz) + VECNA_MODEL_YAW;
  }
}
