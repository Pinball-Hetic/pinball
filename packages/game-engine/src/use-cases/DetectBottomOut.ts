import { isInBottomOutZone } from '../domain/PlayfieldGeometry';

export class DetectBottomOut {
  // Full playfield width, no shooter-lane cutoff: the ball must still drain if
  // it drifts to x > laneSepX before reaching z = BOTTOM_OUT_Z.
  check(pos: { x: number; z: number }): boolean {
    return isInBottomOutZone(pos.x, pos.z);
  }
}
