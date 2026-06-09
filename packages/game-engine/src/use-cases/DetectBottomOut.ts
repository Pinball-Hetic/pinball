import { isInBottomOutZone } from '../domain/PlayfieldGeometry';

export class DetectBottomOut {
  check(pos: { x: number; z: number }): boolean {
    return isInBottomOutZone(pos.x, pos.z);
  }
}
