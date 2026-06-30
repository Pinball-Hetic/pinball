import * as THREE from 'three';
import { DARK_LINK_TARGET } from '../bosses';
import {
  DARK_LINK_ANIM_WALK,
  DARK_LINK_ANIM_IDLE,
  DARK_LINK_ANIM_HIT,
  DARK_LINK_ANIM_DEAD,
  DARK_LINK_ANIM_FPS,
  DARK_LINK_ANIM_WALK_FRAMES,
  DARK_LINK_ANIM_IDLE_FRAMES,
  DARK_LINK_ANIM_HIT_FRAMES,
  DARK_LINK_ANIM_DEAD_FRAMES,
  DARK_LINK_MODEL_FIT_FRAMES,
  DARK_LINK_MODEL_FLOOR_CLEARANCE,
  DARK_LINK_MODEL_HEIGHT,
  DARK_LINK_MODEL_FOOT_LIFT,
  DARK_LINK_MODEL_YAW,
  DARK_LINK_MODEL_URL,
  DARK_LINK_SPAWN,
  DARK_LINK_WALK_DURATION,
  DARK_LINK_WALK_SETTLE_FACING,
  DARK_LINK_WALK_FADE_OUT,
} from './DarkLinkConstants';
import {
  PLAYFIELD_TILT,
  easeOut,
  findGltfAnimationClip,
  createGltfLoader,
  applySkinnedModelFit,
  fitSkinnedModelWithRetry,
  updateSkinnedBindPose,
  warmupObject3D,
  WalkPathProgress,
  cameraFacingYaw,
  pathFacingYaw,
} from '@pinball/game-engine';

type AnimState = 'walk' | 'fight' | 'hit' | 'dead';

const _facingPos = new THREE.Vector3();

const _walkPath = new WalkPathProgress(DARK_LINK_SPAWN, DARK_LINK_TARGET, DARK_LINK_MODEL_FOOT_LIFT, DARK_LINK_WALK_DURATION);

/**
 * Visuel 3D de Dark Link (GLB + animations).
 * Pattern identique à VecnaTargetVisual :
 *  - marche depuis DARK_LINK_SPAWN vers DARK_LINK_TARGET
 *  - idle en combat
 *  - animation hit à chaque coup
 *  - animation dead à la victoire
 */
export class DarkLinkTargetVisual {
  private anchor: THREE.Group | null = null;
  private camera: THREE.Camera | null = null;
  private rig: THREE.Group | null = null;
  private offset: THREE.Group | null = null;
  private model: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private walkAction:      THREE.AnimationAction | null = null;
  private idleAction:      THREE.AnimationAction | null = null;
  private hitAction:       THREE.AnimationAction | null = null;
  private deadAction:      THREE.AnimationAction | null = null;
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

    // Lueur rouge (Dark Link)
    this.glowLight = new THREE.PointLight(0xff2200, 0, 0.55, 2);
    this.glowLight.position.y = 0.08;
    anchor.add(this.glowLight);

    this.loadPromise = this.loadModel();
  }

  ensureReady(): Promise<void> {
    return this.loadPromise ?? Promise.resolve();
  }

  async warmup(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ): Promise<void> {
    if (!this.anchor) return;
    await this.ensureReady();
    await fitSkinnedModelWithRetry(
      () => this.applyFit(),
      DARK_LINK_MODEL_FIT_FRAMES,
      () => this.anchor !== null,
    );
    const primeActions = [
      this.walkAction, this.idleAction, this.hitAction, this.deadAction,
    ].filter((a): a is THREE.AnimationAction => a !== null);
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
    this.idleAction?.stop();
    this.hitAction?.stop();
    this.deadAction?.stop();
    this.setPathProgress(0);
  }

  prepareWalk(): void {
    this.applyFit();
    this.playWalk();
  }

  setPathProgress(t: number): void {
    this.pathT = THREE.MathUtils.clamp(t, 0, 1);
    if (!this.anchor) return;
    const p = _walkPath.positionAt(this.pathT);
    this.anchor.position.set(p.x, p.y, p.z);
  }

  show(): void { if (this.anchor) this.anchor.visible = true; }
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
    this.idleAction?.stop();
    this.hitAction?.stop();
    this.deadAction?.stop();
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
    this.idleAction?.stop();
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
    this.settleDuration = DARK_LINK_WALK_SETTLE_FACING;
    this.setPathProgress(1);
    if (this.rig) this.walkFacingY = this.rig.rotation.y;
    this.walkAction?.fadeOut(DARK_LINK_WALK_FADE_OUT);
  }

  isWalkPathComplete(): boolean {
    return this.walkElapsed >= DARK_LINK_WALK_DURATION;
  }

  updateSettle(dt: number): boolean {
    if (!this.settling) return true;
    if (this.settleDuration <= 0) { this.completeSettle(); return true; }
    this.settleElapsed += dt;
    const t = Math.min(1, this.settleElapsed / this.settleDuration);
    this.lerpFacingToCamera(easeOut(t));
    if (this.settleElapsed >= this.settleDuration + 0.05) this.completeSettle();
    return !this.settling;
  }

  playHit(): void {
    if (!this.mixer || !this.hitAction || !this.idleAction) return;
    this.animState = 'hit';
    this.hitFlash = 0.18;
    this.idleAction.paused = false;
    this.hitAction.reset();
    this.hitAction.setLoop(THREE.LoopOnce, 1);
    this.hitAction.clampWhenFinished = true;
    this.hitAction.crossFadeFrom(this.idleAction, 0.08, true).play();
  }

  playDead(): void {
    if (!this.mixer || !this.deadAction) { this.enterFightIdle(); return; }
    this.animState = 'dead';
    this.hitFlash = 0.28;
    this.deadAction.reset();
    this.deadAction.setLoop(THREE.LoopOnce, 1);
    this.deadAction.clampWhenFinished = true;
    const from = this.hitAction?.isRunning() ? this.hitAction : this.idleAction;
    if (from) this.deadAction.crossFadeFrom(from, 0.12, true).play();
    else this.deadAction.play();
  }

  update(dt: number): void {
    if (!this.anchor?.visible) return;
    this.mixer?.update(dt);

    if (this.walking && !this.settling) {
      this.walkElapsed = Math.min(DARK_LINK_WALK_DURATION, this.walkElapsed + dt);
      this.syncWalkPath();
      this.syncWalkFacing();
    } else if (!this.settling) {
      this.syncFacing();
    }

    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);

    this.pulseT += dt;
    const hitBoost = this.hitFlash > 0 ? 1.5 : 1;
    const pulse = (0.82 + Math.sin(this.pulseT * 2.2) * 0.14) * hitBoost;
    if (this.glowLight) this.glowLight.intensity = 0.65 * pulse;

    const scale = 1 + (this.hitFlash / 0.18) * 0.10;
    this.anchor.scale.setScalar(scale);
  }

  dispose(): void {
    if (this.anchor) this.anchor.parent?.remove(this.anchor);
    this.anchor = null;
    this.camera = null;
    this.mixer = null;
    this.walkAction = null;
    this.idleAction = null;
    this.hitAction = null;
    this.deadAction = null;
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

  // ── Privé ────────────────────────────────────────────────────────────────

  private syncWalkPath(): void {
    this.setPathProgress(_walkPath.progressAt(this.walkElapsed));
  }

  private completeSettle(): void {
    if (!this.settling) return;
    this.settling = false;
    this.walking = false;
    this.walkAction?.stop();
    if (this.walkAction) this.walkAction.time = 0;
    this.syncFacing();
    this.enterFightIdle();
  }

  private enterFightIdle(): void {
    if (!this.idleAction) return;
    this.animState = 'fight';
    this.hitAction?.stop();
    this.walkAction?.stop();
    this.idleAction.reset();
    this.idleAction.setLoop(THREE.LoopRepeat, Infinity);
    this.idleAction.clampWhenFinished = false;
    this.idleAction.timeScale = 1;
    this.idleAction.play();
  }

  private async loadModel(): Promise<void> {
    try {
      const gltf = await createGltfLoader().loadAsync(DARK_LINK_MODEL_URL);
      if (!this.anchor) return;
      this.attachModel(gltf.scene, gltf.animations);
      await fitSkinnedModelWithRetry(
        () => this.applyFit(),
        DARK_LINK_MODEL_FIT_FRAMES,
        () => this.anchor !== null,
      );
      this.setPathProgress(this.pathT);
      this.syncWalkFacing();
    } catch (err) {
      console.error('[DarkLink] load error:', err);
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

    // Teinte émeraude sombre pour le Sacred Realm
    model.traverse((obj) => {
      obj.frustumCulled = false;
      if (obj instanceof THREE.SkinnedMesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (mat instanceof THREE.MeshStandardMaterial) {
            mat.emissive.setHex(0x440000);
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
    const rawWalkClip = findGltfAnimationClip(clips, DARK_LINK_ANIM_WALK);
    const rawIdleClip = findGltfAnimationClip(clips, DARK_LINK_ANIM_IDLE);
    const rawHitClip  = findGltfAnimationClip(clips, DARK_LINK_ANIM_HIT);
    const rawDeadClip = findGltfAnimationClip(clips, DARK_LINK_ANIM_DEAD);

    const walkClip = rawWalkClip
      ? THREE.AnimationUtils.subclip(rawWalkClip, DARK_LINK_ANIM_WALK, DARK_LINK_ANIM_WALK_FRAMES.start, DARK_LINK_ANIM_WALK_FRAMES.end, DARK_LINK_ANIM_FPS)
      : undefined;
    const idleClip = rawIdleClip
      ? THREE.AnimationUtils.subclip(rawIdleClip, DARK_LINK_ANIM_IDLE, DARK_LINK_ANIM_IDLE_FRAMES.start, DARK_LINK_ANIM_IDLE_FRAMES.end, DARK_LINK_ANIM_FPS)
      : undefined;
    const hitClip = rawHitClip
      ? THREE.AnimationUtils.subclip(rawHitClip, DARK_LINK_ANIM_HIT, DARK_LINK_ANIM_HIT_FRAMES.start, DARK_LINK_ANIM_HIT_FRAMES.end, DARK_LINK_ANIM_FPS)
      : undefined;
    const deadClip = rawDeadClip
      ? THREE.AnimationUtils.subclip(rawDeadClip, DARK_LINK_ANIM_DEAD, DARK_LINK_ANIM_DEAD_FRAMES.start, DARK_LINK_ANIM_DEAD_FRAMES.end, DARK_LINK_ANIM_FPS)
      : undefined;

    if (walkClip) {
      this.walkAction = this.mixer.clipAction(walkClip);
      this.walkAction.setLoop(THREE.LoopRepeat, Infinity);
    } else {
      console.warn('[DarkLink] walk clip not found', clips.map((c) => c.name));
    }

    if (idleClip) {
      this.idleAction = this.mixer.clipAction(idleClip);
      this.idleAction.setLoop(THREE.LoopRepeat, Infinity);
    } else {
      console.warn('[DarkLink] idle clip not found', clips.map((c) => c.name));
    }

    if (hitClip) {
      this.hitAction = this.mixer.clipAction(hitClip);
      this.hitAction.setLoop(THREE.LoopOnce, 1);
      this.hitAction.clampWhenFinished = true;
    } else {
      console.warn('[DarkLink] hit clip not found', clips.map((c) => c.name));
    }

    if (deadClip) {
      this.deadAction = this.mixer.clipAction(deadClip);
      this.deadAction.setLoop(THREE.LoopOnce, 1);
      this.deadAction.clampWhenFinished = true;
    } else {
      console.warn('[DarkLink] dead clip not found', clips.map((c) => c.name));
    }

    this.mixer.addEventListener('finished', (event) => {
      if (event.action === this.hitAction && this.animState === 'hit') {
        this.enterFightIdle();
      }
    });
  }

  private applyFit(): boolean {
    if (!this.model || !this.offset || !this.rig || !this.anchor) return false;
    return applySkinnedModelFit({
      model: this.model,
      rig: this.rig,
      offset: this.offset,
      anchor: this.anchor,
      targetHeight: DARK_LINK_MODEL_HEIGHT,
      floorClearance: DARK_LINK_MODEL_FLOOR_CLEARANCE,
      beforeMeasure: () => updateSkinnedBindPose(this.model!),
    });
  }

  private syncWalkFacing(): void {
    if (!this.rig) return;
    this.rig.rotation.y = pathFacingYaw(DARK_LINK_SPAWN, DARK_LINK_TARGET, DARK_LINK_MODEL_YAW);
  }

  private syncFacing(): void {
    if (!this.rig) return;
    const y = this.cameraFacingY();
    if (y !== null) this.rig.rotation.y = y;
  }

  private lerpFacingToCamera(t: number): void {
    if (!this.rig) return;
    const y = this.cameraFacingY();
    if (y === null) return;
    this.rig.rotation.y = THREE.MathUtils.lerp(this.walkFacingY, y, t);
  }

  private cameraFacingY(): number | null {
    if (!this.anchor || !this.camera) return null;
    this.anchor.getWorldPosition(_facingPos);
    return cameraFacingYaw(_facingPos, this.camera.position, DARK_LINK_MODEL_YAW);
  }
}
