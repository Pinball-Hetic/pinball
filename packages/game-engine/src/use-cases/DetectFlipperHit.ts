import {
  FLIPPER_POWER,
  FLIPPER_TRIGGER,
  FLIPPER_Z_MIN,
  FLIPPER_Z_MAX,
  FLIPPER_LEFT_X_MIN,
  FLIPPER_LEFT_X_MAX,
  FLIPPER_LEFT_MID_X,
  FLIPPER_RIGHT_X_MIN,
  FLIPPER_RIGHT_X_MAX,
  FLIPPER_RIGHT_MID_X,
} from '../domain/FlipperConstants';
import { surfaceYAtZ } from '../domain/PlayfieldGeometry';
import { BALL_RADIUS } from '../domain/Ball';

/** Bande verticale valide : balle strictement AU-DESSUS de la surface uniquement.
 *  Zéro tolérance vers le bas — si la balle est sous la palette, pas d'impulsion. */
const FLIPPER_Y_ABOVE = BALL_RADIUS * 6;  // ~0.088 m au-dessus
const FLIPPER_Y_BELOW = -BALL_RADIUS;     // négatif = balle doit être au-dessus de la surface

/** Si la balle monte à plus de cette vitesse (m/s vers le haut du tapis), elle a déjà été frappée. */
const FLIPPER_VEL_Z_MIN = -0.5;

export interface FlipperHitResult {
  impulse: { x: number; y: number; z: number };
  side: 'left' | 'right';
}

export function detectFlipperHit(
  ballPos: { x: number; y: number; z: number },
  ballVel: { z: number },
  leftSwing: number,
  prevLeftSwing: number,
  rightSwing: number,
  prevRightSwing: number,
  leftHitFlag: boolean,
  rightHitFlag: boolean,
): { result: FlipperHitResult | null; leftHit: boolean; rightHit: boolean } {
  const inFlipperZ = ballPos.z > FLIPPER_Z_MIN && ballPos.z < FLIPPER_Z_MAX;
  const surfY = surfaceYAtZ(ballPos.z);
  // Balle dans la bande verticale : ni trop haut (en l'air) ni trop bas (derrière la palette)
  const inFlipperY = ballPos.y > surfY - FLIPPER_Y_BELOW &&
                     ballPos.y < surfY + FLIPPER_Y_ABOVE;
  // Balle ne doit pas déjà fuir vers le haut du tapis (déjà frappée ou derrière)
  const approachingFlipper = ballVel.z > FLIPPER_VEL_Z_MIN;
  let result: FlipperHitResult | null = null;
  let newLeftHit = leftHitFlag;
  let newRightHit = rightHitFlag;

  if (
    leftSwing > FLIPPER_TRIGGER &&
    prevLeftSwing <= FLIPPER_TRIGGER &&
    inFlipperZ &&
    inFlipperY &&
    approachingFlipper &&
    ballPos.x > FLIPPER_LEFT_X_MIN &&
    ballPos.x < FLIPPER_LEFT_X_MAX
  ) {
    newLeftHit = true;
    const normalizedPos = Math.max(-1, Math.min(1, (ballPos.x - FLIPPER_LEFT_MID_X) / 0.08));
    const launchAngle = -0.4 + normalizedPos * 0.6;
    result = {
      impulse: {
        x: FLIPPER_POWER * Math.sin(launchAngle),
        y: 0,
        z: -FLIPPER_POWER * Math.cos(launchAngle),
      },
      side: 'left',
    };
  }

  if (
    rightSwing > FLIPPER_TRIGGER &&
    prevRightSwing <= FLIPPER_TRIGGER &&
    inFlipperZ &&
    inFlipperY &&
    approachingFlipper &&
    ballPos.x > FLIPPER_RIGHT_X_MIN &&
    ballPos.x < FLIPPER_RIGHT_X_MAX
  ) {
    newRightHit = true;
    const normalizedPos = Math.max(-1, Math.min(1, (ballPos.x - FLIPPER_RIGHT_MID_X) / 0.06));
    const launchAngle = 0.4 - normalizedPos * 0.6;
    result = {
      impulse: {
        x: FLIPPER_POWER * Math.sin(launchAngle),
        y: 0,
        z: -FLIPPER_POWER * Math.cos(launchAngle),
      },
      side: 'right',
    };
  }

  return { result, leftHit: newLeftHit, rightHit: newRightHit };
}
