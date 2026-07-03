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

// Accumulateurs des flippers, partagés entre le pas physique (par step Rapier),
// le pas visuel (par frame de rendu) et l'assistance de lancement.
//
// Deux intégrateurs distincts sur le MÊME modèle (computeSwingStep, même cible) :
// - phys* avance à STEP_INTERVAL dans onBeforeStep → les corps kinématiques
//   balayent un arc constant par step (anti-tunneling, cf. PhysicsUpdateHooks) ;
// - leftSwing/rightSwing avance au dt de rendu → pose Three affichée fluide au
//   refresh rate. Divergence bornée (convergence exponentielle vers la même
//   cible) : l'écart visuel/physique reste imperceptible.
export interface FlipperFrameState {
  /** Swing VISUEL (rendu), radians. */
  leftSwing: number;
  rightSwing: number;
  /** Swing PHYSIQUE (par step), radians — source des cibles kinématiques. */
  physLeftSwing: number;
  physRightSwing: number;
  /** Swing physique du step précédent — sert à l'angVel vue par la physique. */
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

// Pas PHYSIQUE flippers, appelé dans onBeforeStep AVANT chaque world.step()
// avec stepDt = PhysicsWorld.STEP_INTERVAL : avance le phys-swing, pose le
// pivot Three (transform monde = source de la cible kinématique) puis pousse
// la cible au corps Rapier. Une cible par step → arc balayé constant, quel que
// soit le refresh rate (anti-tunneling, cf. PhysicsUpdateHooks).
// applyFlipperSwing fait un rotation.set absolu (pas d'accumulation) : le rendu
// peut réappliquer le swing visuel après les steps sans corrompre la physique.
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

// Pas VISUEL flippers (rendu, après les steps physiques) : swing lissé Three.js,
// décroissance + application du hit-flash, alignement des wireframes debug.
// Ne touche PLUS aux corps Rapier — pilotés par stepFlipperPhysics (par step).
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

// Assistance de lancement : si la balle est dans la zone d'un flipper qui monte,
// garantit une vitesse de sortie (helper pur game-engine) + déclenche le
// hit-flash. Appelé seulement en jeu, hors gel. L'angVel vient des deltas
// PHYSIQUES par step (stepDt = STEP_INTERVAL) — c'est la vitesse de flipper que
// Rapier voit réellement, pas celle du swing visuel au refresh rate.
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
