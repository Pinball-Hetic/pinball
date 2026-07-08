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
import {
  findGltfAnimationClip,
  WalkBossTargetActor,
  type WalkBossActions,
} from '@pinball/game-engine';

function resolveVecnaClips(
  mixer: THREE.AnimationMixer,
  clips: THREE.AnimationClip[],
): Omit<WalkBossActions, 'mixer'> {
  const walkClip = findGltfAnimationClip(clips, VECNA_ANIM_WALK);
  const hitClip = findGltfAnimationClip(clips, VECNA_ANIM_HIT);
  const victoryClip = findGltfAnimationClip(clips, VECNA_ANIM_VICTORY);

  let walkAction: THREE.AnimationAction | null = null;
  let fightIdleAction: THREE.AnimationAction | null = null;
  let hitAction: THREE.AnimationAction | null = null;
  let finisherAction: THREE.AnimationAction | null = null;

  if (walkClip) {
    walkAction = mixer.clipAction(walkClip);
    walkAction.setLoop(THREE.LoopRepeat, Infinity);
    walkAction.clampWhenFinished = false;

    fightIdleAction = mixer.clipAction(walkClip);
    fightIdleAction.setLoop(THREE.LoopOnce, 1);
    fightIdleAction.clampWhenFinished = true;
  } else {
    console.warn(`[Vecna] walk clip not found (token="${VECNA_ANIM_WALK}")`, clips.map((c) => c.name));
  }

  if (hitClip) {
    hitAction = mixer.clipAction(hitClip);
    hitAction.setLoop(THREE.LoopOnce, 1);
    hitAction.clampWhenFinished = true;
  } else {
    console.warn(`[Vecna] hit clip not found (token="${VECNA_ANIM_HIT}")`, clips.map((c) => c.name));
  }

  if (victoryClip) {
    finisherAction = mixer.clipAction(victoryClip);
    finisherAction.setLoop(THREE.LoopOnce, 1);
    finisherAction.clampWhenFinished = true;
  } else {
    console.warn(`[Vecna] victory clip not found (token="${VECNA_ANIM_VICTORY}")`, clips.map((c) => c.name));
  }

  return { walkAction, fightIdleAction, hitAction, finisherAction };
}

export class VecnaTargetVisual {
  private readonly actor = new WalkBossTargetActor({
    logTag: 'Vecna',
    modelUrl: VECNA_MODEL_URL,
    spawn: VECNA_SPAWN,
    target: VECNA_TARGET,
    footLift: VECNA_MODEL_FOOT_LIFT,
    modelHeight: VECNA_MODEL_HEIGHT,
    floorClearance: VECNA_MODEL_FLOOR_CLEARANCE,
    bindHeight: VECNA_MODEL_BIND_HEIGHT,
    fitFrames: VECNA_MODEL_FIT_FRAMES,
    yaw: VECNA_MODEL_YAW,
    walkDuration: VECNA_WALK_DURATION,
    settleFacing: VECNA_WALK_SETTLE_FACING,
    walkFadeOut: VECNA_WALK_FADE_OUT,
    emissive: { color: 0x775588, intensity: 0.72 },
    glow: { color: 0xbb88ff, distance: 0.62, decay: 2, y: 0.08, intensityBase: 0.72 },
    hitScaleBoost: 0.12,
    fightIdleMode: 'reuse-walk-frozen',
    resolveClips: resolveVecnaClips,
  });

  mount(parent: THREE.Object3D, camera: THREE.Camera): void {
    this.actor.mount(parent, camera);
  }

  ensureReady(): Promise<void> {
    return this.actor.ensureReady();
  }

  warmup(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Promise<void> {
    return this.actor.warmup(renderer, scene, camera);
  }

  beginReveal(): void {
    this.actor.beginReveal();
  }

  prepareWalk(): void {
    this.actor.prepareWalk();
  }

  setPathProgress(t: number): void {
    this.actor.setPathProgress(t);
  }

  show(): void {
    this.actor.show();
  }

  hide(): void {
    this.actor.hide();
  }

  playWalk(): void {
    this.actor.playWalk();
  }

  startSettle(): void {
    this.actor.startSettle();
  }

  isWalkPathComplete(): boolean {
    return this.actor.isWalkPathComplete();
  }

  updateSettle(dt: number): boolean {
    return this.actor.updateSettle(dt);
  }

  playHit(): void {
    this.actor.playHit();
  }

  playVictory(): void {
    this.actor.playFinisher();
  }

  update(dt: number): void {
    this.actor.update(dt);
  }

  dispose(): void {
    this.actor.dispose();
  }
}
