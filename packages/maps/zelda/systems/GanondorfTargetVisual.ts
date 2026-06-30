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
import { BossTargetActor, findGltfAnimationClip } from '@pinball/game-engine';

export function resolveGanondorfClips(
  mixer: THREE.AnimationMixer,
  clips: THREE.AnimationClip[],
) {
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

  return { idleAction, hitAction, victoryAction };
}

export class GanondorfTargetVisual extends BossTargetActor {
  constructor() {
    super({
      logTag: 'Ganondorf',
      modelUrl: GANONDORF_MODEL_URL,
      target: GANONDORF_TARGET,
      footLift: GANONDORF_MODEL_FOOT_LIFT,
      modelHeight: GANONDORF_MODEL_HEIGHT,
      floorClearance: GANONDORF_MODEL_FLOOR_CLEARANCE,
      fitFrames: GANONDORF_MODEL_FIT_FRAMES,
      yaw: GANONDORF_MODEL_YAW,
      glow: { color: 0xaa00ff, distance: 0.38, decay: 2, y: 0.03 },
      resolveClips: resolveGanondorfClips,
      disposeGlowOnDispose: true,
    });
  }
}
