import { isInBottomOutZone } from '../domain/PlayfieldGeometry';

export class DetectBottomOut {
  // Covers the full playfield width (up to WALL_RIGHT_X = 0.265). No shooter
  // lane cutoff: the ball must still drain if it drifts to x > laneSepX before
  // reaching z = BOTTOM_OUT_Z.
  check(pos: { x: number; z: number }): boolean {
    return isInBottomOutZone(pos.x, pos.z); // default rightX = WALL_RIGHT_X
  }
}
