import type * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import {
  SWING_RAD,
  SWING_SMOOTH,
  FLASH_DURATION,
  applyFlipperSwing,
  applyFlash,
  syncFlipperBody,
  flipperWorldTransform,
  computeFlipperLaunchAssist,
  type BallPhysics,
  type FlipperPivot,
  type FlipperZones,
  type FlashMat,
} from "@pinball/game-engine";
import type { InputState } from "../createApplyAction";

// Two integrators over the same target: phys* must advance at STEP_INTERVAL
// (per Rapier step) so kinematic bodies sweep a constant arc and don't tunnel;
// leftSwing/rightSwing advance at render dt for the displayed pose. Keep them
// separate — collapsing them reintroduces tunneling.
export interface FlipperFrameState {
  leftSwing: number;
  rightSwing: number;
  physLeftSwing: number;
  physRightSwing: number;
  physPrevLeft: number;
  physPrevRight: number;
  leftFlash: number;
  rightFlash: number;
}

export function createFlipperFrameState(): FlipperFrameState {
  return {
    leftSwing: 0,
    rightSwing: 0,
    physLeftSwing: 0,
    physRightSwing: 0,
    physPrevLeft: 0,
    physPrevRight: 0,
    leftFlash: 0,
    rightFlash: 0,
  };
}

// The `dt * 60` normalizes smoothing to 60 FPS so the angular speed is
// framerate-independent — don't drop it.
export function computeSwingStep(current: number, target01: number, dt: number): number {
  const decay = 1 - Math.pow(1 - SWING_SMOOTH, dt * 60);
  return current + (target01 * SWING_RAD - current) * decay;
}

export function decayFlash(flash: number, dt: number): number {
  return flash > 0 ? Math.max(0, flash - dt) : flash;
}

export interface FlipperPhysicsDeps {
  input: Pick<InputState, "leftTarget" | "rightTarget">;
  leftPivot: FlipperPivot | null;
  rightPivot: FlipperPivot | null;
  leftObj: THREE.Object3D | null;
  rightObj: THREE.Object3D | null;
  leftBody: RAPIER.RigidBody | null;
  rightBody: RAPIER.RigidBody | null;
  leftOffset: THREE.Vector3;
  rightOffset: THREE.Vector3;
}

export function stepFlipperPhysics(
  s: FlipperFrameState,
  d: FlipperPhysicsDeps,
  stepDt: number,
): void {
  s.physPrevLeft = s.physLeftSwing;
  s.physPrevRight = s.physRightSwing;
  s.physLeftSwing = computeSwingStep(s.physLeftSwing, d.input.leftTarget, stepDt);
  s.physRightSwing = computeSwingStep(s.physRightSwing, d.input.rightTarget, stepDt);
  if (d.leftPivot) applyFlipperSwing(d.leftPivot, s.physLeftSwing);
  if (d.rightPivot) applyFlipperSwing(d.rightPivot, s.physRightSwing);

  syncFlipperBody(d.leftBody, d.leftObj, d.leftOffset);
  syncFlipperBody(d.rightBody, d.rightObj, d.rightOffset);
}

export interface FlipperKinematicsDeps {
  input: Pick<InputState, "leftTarget" | "rightTarget">;
  leftPivot: FlipperPivot | null;
  rightPivot: FlipperPivot | null;
  leftObj: THREE.Object3D | null;
  rightObj: THREE.Object3D | null;
  leftOffset: THREE.Vector3;
  rightOffset: THREE.Vector3;
  leftFlashMats: FlashMat[];
  rightFlashMats: FlashMat[];
  leftDebug: THREE.Mesh | null;
  rightDebug: THREE.Mesh | null;
}

export function stepFlipperKinematics(
  s: FlipperFrameState,
  d: FlipperKinematicsDeps,
  dt: number,
): void {
  s.leftSwing = computeSwingStep(s.leftSwing, d.input.leftTarget, dt);
  s.rightSwing = computeSwingStep(s.rightSwing, d.input.rightTarget, dt);
  if (d.leftPivot) applyFlipperSwing(d.leftPivot, s.leftSwing);
  if (d.rightPivot) applyFlipperSwing(d.rightPivot, s.rightSwing);

  s.leftFlash = decayFlash(s.leftFlash, dt);
  s.rightFlash = decayFlash(s.rightFlash, dt);
  applyFlash(d.leftFlashMats, s.leftFlash);
  applyFlash(d.rightFlashMats, s.rightFlash);

  if (d.leftDebug && d.leftObj) {
    const { position, quaternion } = flipperWorldTransform(d.leftObj, d.leftOffset);
    d.leftDebug.position.copy(position);
    d.leftDebug.quaternion.copy(quaternion);
  }
  if (d.rightDebug && d.rightObj) {
    const { position, quaternion } = flipperWorldTransform(d.rightObj, d.rightOffset);
    d.rightDebug.position.copy(position);
    d.rightDebug.quaternion.copy(quaternion);
  }
}

// angVel must come from the per-step PHYSICS deltas (stepDt = STEP_INTERVAL),
// i.e. the flipper speed Rapier actually sees, not the visual swing speed at
// refresh rate.
export function stepFlipperAssist(
  s: FlipperFrameState,
  ball: BallPhysics,
  zones: FlipperZones,
  stepDt: number,
): void {
  const pos = ball.body.translation();
  const angVelL = (s.physLeftSwing - s.physPrevLeft) / stepDt;
  const angVelR = (s.physRightSwing - s.physPrevRight) / stepDt;

  const leftAssist = computeFlipperLaunchAssist({
    pos,
    vel: ball.body.linvel(),
    zone: zones.left,
    angVel: angVelL,
  });
  if (leftAssist) {
    ball.body.setLinvel(leftAssist.linvel, true);
    s.leftFlash = FLASH_DURATION;
  }

  const rightAssist = computeFlipperLaunchAssist({
    pos,
    vel: ball.body.linvel(),
    zone: zones.right,
    angVel: angVelR,
  });
  if (rightAssist) {
    ball.body.setLinvel(rightAssist.linvel, true);
    s.rightFlash = FLASH_DURATION;
  }
}
