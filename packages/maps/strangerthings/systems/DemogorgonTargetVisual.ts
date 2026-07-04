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
import { BossTargetActor, findGltfAnimationClip } from '@pinball/game-engine';

export function resolveDemogorgonClips(
  mixer: THREE.AnimationMixer,
  clips: THREE.AnimationClip[],
) {
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

  return { idleAction, hitAction, victoryAction };
}

export class DemogorgonTargetVisual extends BossTargetActor {
  constructor() {
    super({
      logTag: 'Demogorgon',
      modelUrl: DEMOGORGON_MODEL_URL,
      target: DEMOGORGON_TARGET,
      footLift: DEMOGORGON_MODEL_FOOT_LIFT,
      modelHeight: DEMOGORGON_MODEL_HEIGHT,
      floorClearance: DEMOGORGON_MODEL_FLOOR_CLEARANCE,
      fitFrames: DEMOGORGON_MODEL_FIT_FRAMES,
      yaw: DEMOGORGON_MODEL_YAW,
      glow: { color: 0xff5533, distance: 0.38, decay: 2, y: 0.03 },
      resolveClips: resolveDemogorgonClips,
      disposeGlowOnDispose: true,
    });
  }
}
