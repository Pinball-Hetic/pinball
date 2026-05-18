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

export interface FlipperHitResult {
  impulse: { x: number; y: number; z: number };
  side: 'left' | 'right';
}

export function detectFlipperHit(
  ballPos: { x: number; z: number },
  leftSwing: number,
  prevLeftSwing: number,
  rightSwing: number,
  prevRightSwing: number,
  leftHitFlag: boolean,
  rightHitFlag: boolean,
): { result: FlipperHitResult | null; leftHit: boolean; rightHit: boolean } {
  const inFlipperZ = ballPos.z > FLIPPER_Z_MIN && ballPos.z < FLIPPER_Z_MAX;
  let result: FlipperHitResult | null = null;
  let newLeftHit = leftHitFlag;
  let newRightHit = rightHitFlag;

  if (
    leftSwing > FLIPPER_TRIGGER &&
    prevLeftSwing <= FLIPPER_TRIGGER &&
    inFlipperZ &&
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
