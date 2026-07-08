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
  findGltfAnimationClip,
  WalkBossTargetActor,
  type WalkBossActions,
} from '@pinball/game-engine';

function resolveDarkLinkClips(
  mixer: THREE.AnimationMixer,
  clips: THREE.AnimationClip[],
): Omit<WalkBossActions, 'mixer'> {
  // Re-crop clips to their Blender range (Manual Frame Range).
  // Without a subclip, the GLB exports keyframes in absolute time and
  // Three.js plays from t=0, playing the wrong part of the animation.
  const rawWalkClip = findGltfAnimationClip(clips, DARK_LINK_ANIM_WALK);
  const rawIdleClip = findGltfAnimationClip(clips, DARK_LINK_ANIM_IDLE);
  const rawHitClip = findGltfAnimationClip(clips, DARK_LINK_ANIM_HIT);
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

  let walkAction: THREE.AnimationAction | null = null;
  let fightIdleAction: THREE.AnimationAction | null = null;
  let hitAction: THREE.AnimationAction | null = null;
  let finisherAction: THREE.AnimationAction | null = null;

  if (walkClip) {
    walkAction = mixer.clipAction(walkClip);
    walkAction.setLoop(THREE.LoopRepeat, Infinity);
  } else {
    console.warn('[DarkLink] walk clip not found', clips.map((c) => c.name));
  }

  if (idleClip) {
    fightIdleAction = mixer.clipAction(idleClip);
    fightIdleAction.setLoop(THREE.LoopRepeat, Infinity);
  } else {
    console.warn('[DarkLink] idle clip not found', clips.map((c) => c.name));
  }

  if (hitClip) {
    hitAction = mixer.clipAction(hitClip);
    hitAction.setLoop(THREE.LoopOnce, 1);
    hitAction.clampWhenFinished = true;
  } else {
    console.warn('[DarkLink] hit clip not found', clips.map((c) => c.name));
  }

  if (deadClip) {
    finisherAction = mixer.clipAction(deadClip);
    finisherAction.setLoop(THREE.LoopOnce, 1);
    finisherAction.clampWhenFinished = true;
  } else {
    console.warn('[DarkLink] dead clip not found', clips.map((c) => c.name));
  }

  return { walkAction, fightIdleAction, hitAction, finisherAction };
}

export class DarkLinkTargetVisual {
  private readonly actor = new WalkBossTargetActor({
    logTag: 'DarkLink',
    modelUrl: DARK_LINK_MODEL_URL,
    spawn: DARK_LINK_SPAWN,
    target: DARK_LINK_TARGET,
    footLift: DARK_LINK_MODEL_FOOT_LIFT,
    modelHeight: DARK_LINK_MODEL_HEIGHT,
    floorClearance: DARK_LINK_MODEL_FLOOR_CLEARANCE,
    fitFrames: DARK_LINK_MODEL_FIT_FRAMES,
    yaw: DARK_LINK_MODEL_YAW,
    walkDuration: DARK_LINK_WALK_DURATION,
    settleFacing: DARK_LINK_WALK_SETTLE_FACING,
    walkFadeOut: DARK_LINK_WALK_FADE_OUT,
    emissive: { color: 0x440000, intensity: 0.55 },
    glow: { color: 0xff2200, distance: 0.55, decay: 2, y: 0.08, intensityBase: 0.65 },
    hitScaleBoost: 0.10,
    fightIdleMode: 'loop-idle',
    resolveClips: resolveDarkLinkClips,
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

  playDead(): void {
    this.actor.playFinisher();
  }

  update(dt: number): void {
    this.actor.update(dt);
  }

  dispose(): void {
    this.actor.dispose();
  }
}
