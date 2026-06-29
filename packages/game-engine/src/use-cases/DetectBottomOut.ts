import { isInBottomOutZone } from '../domain/PlayfieldGeometry';

export class DetectBottomOut {
  // Couvre toute la largeur du plateau (jusqu'à WALL_RIGHT_X = 0.265).
  // Sans limite côté couloir plongeur : la balle doit drainer même si elle
  // dérive vers x > laneSepX avant d'atteindre z = BOTTOM_OUT_Z.
  check(pos: { x: number; z: number }): boolean {
    return isInBottomOutZone(pos.x, pos.z); // default rightX = WALL_RIGHT_X
  }
}
