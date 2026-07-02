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

// Accumulateurs de frame des flippers (swing lissé + hit-flash), partagés entre
// le pas cinématique et le pas d'assistance de lancement. Un seul objet possédé
// par la closure d'init — remplace 6 `let` éparpillés.
export interface FlipperFrameState {
  leftSwing: number;
  rightSwing: number;
  prevLeftSwing: number;
  prevRightSwing: number;
  leftFlash: number;
  rightFlash: number;
}

export function createFlipperFrameState(): FlipperFrameState {
  return {
    leftSwing: 0,
    rightSwing: 0,
    prevLeftSwing: 0,
    prevRightSwing: 0,
    leftFlash: 0,
    rightFlash: 0,
  };
}

// Lissage normalisé à 60 FPS : Math.pow(1 - SWING_SMOOTH, dt * 60) reproduit
// exactement le comportement 60 Hz sur tous les écrans (120 Hz → decay plus
// petit par frame, même vitesse angulaire réelle). Pur.
export function computeSwingStep(current: number, target01: number, dt: number): number {
  const decay = 1 - Math.pow(1 - SWING_SMOOTH, dt * 60);
  return current + (target01 * SWING_RAD - current) * decay;
}

// Décroissance linéaire du hit-flash, plancher 0. Pur.
export function decayFlash(flash: number, dt: number): number {
  return flash > 0 ? Math.max(0, flash - dt) : flash;
}

export interface FlipperKinematicsDeps {
  input: Pick<InputState, "leftTarget" | "rightTarget">;
  leftPivot: FlipperPivot | null;
  rightPivot: FlipperPivot | null;
  leftObj: THREE.Object3D | null;
  rightObj: THREE.Object3D | null;
  leftBody: RAPIER.RigidBody | null;
  rightBody: RAPIER.RigidBody | null;
  leftOffset: THREE.Vector3;
  rightOffset: THREE.Vector3;
  leftFlashMats: FlashMat[];
  rightFlashMats: FlashMat[];
  leftDebug: THREE.Mesh | null;
  rightDebug: THREE.Mesh | null;
}

// Pas cinématique flippers : swing lissé Three.js → corps Rapier, décroissance +
// application du hit-flash, alignement des wireframes debug. Args live/frame.
// Ordre préservé 1:1.
export function stepFlipperKinematics(
  s: FlipperFrameState,
  d: FlipperKinematicsDeps,
  dt: number,
): void {
  s.prevLeftSwing = s.leftSwing;
  s.prevRightSwing = s.rightSwing;
  s.leftSwing = computeSwingStep(s.leftSwing, d.input.leftTarget, dt);
  s.rightSwing = computeSwingStep(s.rightSwing, d.input.rightTarget, dt);
  if (d.leftPivot) applyFlipperSwing(d.leftPivot, s.leftSwing);
  if (d.rightPivot) applyFlipperSwing(d.rightPivot, s.rightSwing);

  syncFlipperBody(d.leftBody, d.leftObj, d.leftOffset);
  syncFlipperBody(d.rightBody, d.rightObj, d.rightOffset);

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

// Assistance de lancement : si la balle est dans la zone d'un flipper qui monte,
// garantit une vitesse de sortie (helper pur game-engine) + déclenche le
// hit-flash. Appelé seulement en jeu, hors gel. Args live/frame.
export function stepFlipperAssist(
  s: FlipperFrameState,
  ball: BallPhysics,
  zones: FlipperZones,
  dt: number,
): void {
  const pos = ball.body.translation();
  const angVelL = (s.leftSwing - s.prevLeftSwing) / dt;
  const angVelR = (s.rightSwing - s.prevRightSwing) / dt;

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
