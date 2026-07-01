import * as THREE from 'three';
import { PLAYFIELD_TILT } from '../domain/PlayfieldGeometry';
import { createGltfLoader } from './GltfDisplay';
import { applySkinnedModelFit, fitSkinnedModelWithRetry, updateSkinnedBindPose } from './SkinnedModelFit';
import { warmupObject3D } from './SkinnedModelWarmup';
import {
  WalkPathProgress,
  cameraFacingYaw,
  pathFacingYaw,
  type WalkPathPoint,
} from './WalkPathProgress';
import { easeOut } from './CinematicEasing';
import {
  walkBossPulse,
  walkBossScale,
  WALK_BOSS_HIT_FLASH,
  WALK_BOSS_FINISHER_FLASH,
} from './WalkBossPulse';

type AnimState = 'walk' | 'fight' | 'hit' | 'finisher';

/** Mixer + actions resolved by the owning map from its own GLTF clips. */
export type WalkBossActions = {
  mixer: THREE.AnimationMixer;
  walkAction: THREE.AnimationAction | null;
  /** Idle/settled pose action. May reuse the walk clip (Vecna). */
  fightIdleAction: THREE.AnimationAction | null;
  hitAction: THREE.AnimationAction | null;
  /** Victory (ST) or dead (Zelda) finisher. */
  finisherAction: THREE.AnimationAction | null;
};

export type WalkBossClipResolver = (
  mixer: THREE.AnimationMixer,
  clips: THREE.AnimationClip[],
) => Omit<WalkBossActions, 'mixer'>;

export type WalkBossEmissiveConfig = {
  color: number;
  intensity: number;
};

export type WalkBossGlowConfig = {
  color: number;
  distance: number;
  decay: number;
  y: number;
  intensityBase: number;
};

/**
 * How the fight idle pose is held once the walk-in settles.
 *  - 'reuse-walk-frozen' (Vecna): play once + clamp + pause on a frozen pose.
 *  - 'loop-idle' (Dark Link): loop the idle clip forever.
 */
export type WalkBossFightIdleMode = 'reuse-walk-frozen' | 'loop-idle';

export type WalkBossTargetActorConfig = {
  /** Tag for load/clip warn+error logging, e.g. "Vecna". */
  logTag: string;
  modelUrl: string;
  spawn: WalkPathPoint;
  target: WalkPathPoint;
  footLift: number;
  modelHeight: number;
  floorClearance: number;
  /** Optional fixed bind height (Vecna uses it; Dark Link omits). */
  bindHeight?: number;
  fitFrames: number;
  yaw: number;
  walkDuration: number;
  settleFacing: number;
  walkFadeOut: number;
  emissive: WalkBossEmissiveConfig;
  glow: WalkBossGlowConfig;
  /** Anchor scale boost at peak hit flash (Vecna 0.12, Dark Link 0.10). */
  hitScaleBoost: number;
  fightIdleMode: WalkBossFightIdleMode;
  resolveClips: WalkBossClipResolver;
};

const _facingPos = new THREE.Vector3();

/**
 * Composed lifecycle for the "walk-in target boss" actors (Vecna / Dark Link):
 * spawn → walk along the tilted playfield → settle facing the camera → fight
 * idle, with hit flashes and a victory/dead finisher. Behaviour is verbatim
 * from the former VecnaTargetVisual / DarkLinkTargetVisual; the only per-map
 * variation is injected via config (constants, emissive/glow, fight-idle mode,
 * scale boost) and the resolveClips function (raw vs subclipped GLTF clips).
 */
export class WalkBossTargetActor {
  private anchor: THREE.Group | null = null;
  private camera: THREE.Camera | null = null;
  private rig: THREE.Group | null = null;
  private offset: THREE.Group | null = null;
  private model: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private walkAction: THREE.AnimationAction | null = null;
  private fightIdleAction: THREE.AnimationAction | null = null;
  private hitAction: THREE.AnimationAction | null = null;
  private finisherAction: THREE.AnimationAction | null = null;
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
  private readonly walkPath: WalkPathProgress;

  constructor(private readonly config: WalkBossTargetActorConfig) {
    this.walkPath = new WalkPathProgress(
      config.spawn,
      config.target,
      config.footLift,
      config.walkDuration,
    );
  }

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

    this.glowLight = new THREE.PointLight(
      this.config.glow.color,
      0,
      this.config.glow.distance,
      this.config.glow.decay,
    );
    this.glowLight.position.y = this.config.glow.y;
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
      this.config.fitFrames,
      () => this.anchor !== null,
    );
    const primeActions = [this.walkAction, this.fightIdleAction, this.hitAction, this.finisherAction].filter(
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
    this.finisherAction?.stop();
    this.setPathProgress(0);
  }

  prepareWalk(): void {
    this.applyFit();
    this.playWalk();
  }

  setPathProgress(t: number): void {
    this.pathT = THREE.MathUtils.clamp(t, 0, 1);
    if (!this.anchor) return;

    const p = this.walkPath.positionAt(this.pathT);
    this.anchor.position.set(p.x, p.y, p.z);
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
    this.finisherAction?.stop();
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
    this.settleDuration = this.config.settleFacing;
    this.setPathProgress(1);
    if (this.rig) this.walkFacingY = this.rig.rotation.y;

    if (this.walkAction) {
      this.walkAction.fadeOut(this.config.walkFadeOut);
    }
  }

  isWalkPathComplete(): boolean {
    return this.walkElapsed >= this.config.walkDuration;
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

  playHit(): void {
    if (!this.mixer || !this.hitAction || !this.fightIdleAction) return;
    this.animState = 'hit';
    this.hitFlash = WALK_BOSS_HIT_FLASH;
    this.fightIdleAction.paused = false;
    this.hitAction.reset();
    this.hitAction.setLoop(THREE.LoopOnce, 1);
    this.hitAction.clampWhenFinished = true;
    this.hitAction.crossFadeFrom(this.fightIdleAction, 0.08, true).play();
  }

  /** Play the finisher (victory for ST, dead for Zelda). */
  playFinisher(): void {
    if (!this.mixer || !this.finisherAction) {
      this.enterFightIdle();
      return;
    }
    this.animState = 'finisher';
    this.hitFlash = WALK_BOSS_FINISHER_FLASH;
    this.finisherAction.reset();
    this.finisherAction.setLoop(THREE.LoopOnce, 1);
    this.finisherAction.clampWhenFinished = true;
    const from = this.hitAction?.isRunning() ? this.hitAction : this.fightIdleAction;
    if (from) {
      this.finisherAction.crossFadeFrom(from, 0.12, true).play();
    } else {
      this.finisherAction.play();
    }
  }

  update(dt: number): void {
    if (!this.anchor?.visible) return;

    this.mixer?.update(dt);

    if (this.walking && !this.settling) {
      this.walkElapsed = Math.min(this.config.walkDuration, this.walkElapsed + dt);
      this.syncWalkPath();
      this.syncWalkFacing();
    } else if (!this.settling) {
      this.syncFacing();
    }

    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);

    this.pulseT += dt;
    const pulse = walkBossPulse(this.pulseT, this.hitFlash);
    if (this.glowLight) this.glowLight.intensity = this.config.glow.intensityBase * pulse;

    const scale = walkBossScale(this.hitFlash, this.config.hitScaleBoost);
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
    this.finisherAction = null;
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

  private syncWalkPath(): void {
    this.setPathProgress(this.walkPath.progressAt(this.walkElapsed));
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

  private enterFightIdle(): void {
    if (!this.fightIdleAction) return;
    this.animState = 'fight';
    this.hitAction?.stop();
    this.walkAction?.stop();
    this.fightIdleAction.reset();

    if (this.config.fightIdleMode === 'reuse-walk-frozen') {
      this.fightIdleAction.setLoop(THREE.LoopOnce, 1);
      this.fightIdleAction.clampWhenFinished = true;
      this.fightIdleAction.time = 0;
      this.fightIdleAction.timeScale = 1;
      this.fightIdleAction.play();
      this.fightIdleAction.paused = true;
      return;
    }

    this.fightIdleAction.setLoop(THREE.LoopRepeat, Infinity);
    this.fightIdleAction.clampWhenFinished = false;
    this.fightIdleAction.timeScale = 1;
    this.fightIdleAction.play();
  }

  private async loadModel(): Promise<void> {
    try {
      const gltf = await createGltfLoader().loadAsync(this.config.modelUrl);
      if (!this.anchor) return;
      this.attachModel(gltf.scene, gltf.animations);
      await fitSkinnedModelWithRetry(
        () => this.applyFit(),
        this.config.fitFrames,
        () => this.anchor !== null,
      );
      this.setPathProgress(this.pathT);
      this.syncWalkFacing();
    } catch (err) {
      console.error(`[${this.config.logTag}] load error:`, err);
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

    const { color, intensity } = this.config.emissive;
    model.traverse((obj) => {
      obj.frustumCulled = false;
      if (obj instanceof THREE.SkinnedMesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (mat instanceof THREE.MeshStandardMaterial) {
            mat.emissive.setHex(color);
            mat.emissiveIntensity = intensity;
            mat.needsUpdate = true;
          }
        }
      }
    });

    const mixer = new THREE.AnimationMixer(model);
    const { walkAction, fightIdleAction, hitAction, finisherAction } = this.config.resolveClips(
      mixer,
      clips,
    );
    this.mixer = mixer;
    this.walkAction = walkAction;
    this.fightIdleAction = fightIdleAction;
    this.hitAction = hitAction;
    this.finisherAction = finisherAction;

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
      targetHeight: this.config.modelHeight,
      floorClearance: this.config.floorClearance,
      fixedBindHeight: this.config.bindHeight,
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
    this.rig.rotation.y = pathFacingYaw(this.config.spawn, this.config.target, this.config.yaw);
  }

  private syncFacing(): void {
    if (!this.rig) return;
    const targetY = this.cameraFacingY();
    if (targetY === null) return;
    this.rig.rotation.y = targetY;
  }

  private cameraFacingY(): number | null {
    if (!this.anchor || !this.camera) return null;

    this.anchor.getWorldPosition(_facingPos);
    return cameraFacingYaw(_facingPos, this.camera.position, this.config.yaw);
  }
}
